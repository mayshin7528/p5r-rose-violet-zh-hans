const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_DIR = path.join(ROOT, "translations", "catalog");
const OVERRIDES_FILE = path.join(ROOT, "translations", "overrides.csv");
const REPORT_DIR = path.join(ROOT, "docs", "reports");
const ALL_FILE = path.join(REPORT_DIR, "story_semantic_audit_v2_all_20260809.csv");
const CANDIDATE_FILE = path.join(REPORT_DIR, "story_semantic_audit_v2_candidates_20260809.csv");

const PRIMARY_CATEGORIES = new Set([
  "event_e100", "event_e400", "event_e700", "event_other", "camp",
  "event_script_e100", "event_script_e400", "event_script_e700", "event_script_other",
  "field_other", "femulator_pak", "mypalace", "facility",
]);

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() || [];
  if (headers[0]) headers[0] = headers[0].replace(/^\ufeff/, "");
  return rows.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(file, rows, headers) {
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\r\n");
  fs.writeFileSync(file, `\ufeff${headers.join(",")}\r\n${body}\r\n`, "utf8");
}

function rowKey(row) {
  return `${row.category}\u0000${row.resource_key}\u0000${row.msg_id}`;
}

function visible(text) {
  return String(text || "")
    .replace(/^\[(?:msg|sel)\s+[^\r\n]+\]\s*/m, "")
    .replace(/\[f 4 1\]|\[lName\]/g, "〔动态姓氏〕")
    .replace(/\[f 4 2\]|\[fName\]/g, "〔动态名字〕")
    .replace(/\[f 4 3\]/g, "〔动态全名〕")
    .replace(/\[n\]/g, "\n")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function speaker(text) {
  const first = String(text || "").split(/\r?\n/, 1)[0];
  return first.match(/^\[(?:msg|sel)\s+[^\]]+?(?:\s+\[([^\]]+)\])?\]$/)?.[1] || "";
}

function normalizedVisible(text) {
  return visible(text).normalize("NFKC").replace(/[\s，。！？、…：；“”‘’『』「」（）()\-—]/g, "").toLowerCase();
}

function countReadableChars(text) {
  return text.replace(/〔动态(?:姓氏|名字|全名)〕/g, "名字名字").replace(/\s/g, "").length;
}

function newlineAudit(text) {
  const issues = [];
  const pages = String(text || "").replace(/\r\n/g, "\n").split("\n").filter((line) => line.startsWith("[s]"));
  pages.forEach((page, pageIndex) => {
    const endIndex = page.lastIndexOf("[f 1 ") >= 0 ? page.lastIndexOf("[f 1 ") : page.lastIndexOf("[e]");
    const body = page.slice(0, endIndex >= 0 ? endIndex : undefined)
      .replace(/^((?:\[[^\]]+\])+)/, "")
      .replace(/(?:\[n\])+$/, "");
    const pieces = body.split("[n]");
    const breakCount = pieces.length - 1;
    if (breakCount > 2) issues.push(`第${pageIndex + 1}页换行${breakCount}次>2`);
    const visiblePieces = pieces.map((piece) => visible(piece));
    const totalLength = visiblePieces.reduce((sum, piece) => sum + countReadableChars(piece), 0);
    visiblePieces.forEach((piece, index) => {
      const length = countReadableChars(piece);
      if (length > 20 && totalLength <= 60) issues.push(`第${pageIndex + 1}页第${index + 1}行${length}字>20`);
      if (index < visiblePieces.length - 1 && totalLength <= 20 && !/[，。！？、…：；”’』」）)]$/.test(piece)) {
        issues.push(`第${pageIndex + 1}页第${index + 1}行非标点断行`);
      }
    });
    if (breakCount === 2 && totalLength <= 40) issues.push(`第${pageIndex + 1}页${totalLength}字却使用2次换行`);
  });
  return [...new Set(issues)];
}

const catalogFiles = fs.readdirSync(CATALOG_DIR).filter((name) => name.endsWith(".csv.gz"));
const catalogs = catalogFiles.flatMap((name) => parseCsv(zlib.gunzipSync(fs.readFileSync(path.join(CATALOG_DIR, name))).toString("utf8")));
const overrides = new Map(parseCsv(fs.readFileSync(OVERRIDES_FILE, "utf8")).map((row) => [rowKey(row), row]));
const selected = catalogs.filter((row) => {
  if (row.category === "field_other") {
    return /^FIELD\/NPC\/CORP\d+/i.test(row.resource_key) || /^FIELD\/KF_EVENT\/NPC\//i.test(row.resource_key);
  }
  return PRIMARY_CATEGORIES.has(row.category) || row.category === "battle";
});
const resourceRows = new Map();
for (const row of selected) {
  const key = `${row.category}\u0000${row.resource_key}`;
  if (!resourceRows.has(key)) resourceRows.set(key, []);
  resourceRows.get(key).push(row);
}

const detail = [];
for (const row of selected) {
  const override = overrides.get(rowKey(row));
  const effective = override?.final_zh || row.final_zh || row.official_chinese || "";
  const en = visible(row.mod_text);
  const zh = visible(effective);
  const official = visible(row.official_chinese);
  const flags = [];
  let score = 0;
  const isBattle = row.category === "battle";
  const resourceKey = `${row.category}\u0000${row.resource_key}`;
  if (row.msg_id.startsWith("SEL_")) { flags.push("玩家选项"); score += 8; }
  if (row.match_class !== "EXACT_OFFICIAL_PROXY") { flags.push("旧分类提示Mod变化"); score += 4; }
  if (normalizedVisible(effective) === normalizedVisible(row.official_chinese)) {
    flags.push("官中继承未经Mod英文语义核对"); score += 6;
  }
  if (/\b(?:sumire|kasumi|sis|sister|senpai|violet|rose|joker|akechi|maruki)\b/i.test(en)) {
    flags.push("核心人物或称谓"); score += 6;
  }
  if (/\b(?:dead|died|death|killed|mother|father|parent|accident|arrested|remember|memory|reality|dream)\b/i.test(en)) {
    flags.push("剧情事实"); score += 5;
  }
  if (/\[(?:fName|lName)\]|\[f 4 [123]\]/.test(row.mod_text)) { flags.push("动态姓名"); score += 5; }
  if (/\b[A-Za-z]{3,}\b/.test(zh) && /[\u3400-\u9fff]/.test(zh)) { flags.push("中文正文含英文"); score += 8; }
  if (/^[\s\S]*\b[A-Za-z]{3,}\b[\s\S]*$/.test(zh) && !/[\u3400-\u9fff]/.test(zh)) { flags.push("整句非中文"); score += 12; }
  if (/[A-Za-z]{2,}/.test(speaker(effective))) { flags.push("英文说话人"); score += 12; }
  if (/\bKasumi\b|\bsumi(?:\s*0+)+\b/i.test(zh)) { flags.push("可见错误占位"); score += 12; }
  const enLength = en.replace(/\s/g, "").length;
  const zhLength = countReadableChars(zh);
  if (enLength > 20 && (enLength / Math.max(1, zhLength) > 7 || zhLength / Math.max(1, enLength) > 0.9)) {
    flags.push("中英长度异常"); score += 4;
  }
  const newlineIssues = newlineAudit(effective);
  if (newlineIssues.length) { flags.push("换行不合规"); score += 6; }
  const siblings = resourceRows.get(resourceKey);
  const index = siblings.indexOf(row);
  const previous = index > 0 ? visible(overrides.get(rowKey(siblings[index - 1]))?.final_zh || siblings[index - 1].final_zh || siblings[index - 1].official_chinese) : "";
  const next = index + 1 < siblings.length ? visible(overrides.get(rowKey(siblings[index + 1]))?.final_zh || siblings[index + 1].final_zh || siblings[index + 1].official_chinese) : "";
  if (isBattle && !/核心人物|称谓|英文|占位|换行/.test(flags.join("；"))) score = Math.min(score, 2);
  detail.push({
    category: row.category,
    resource: row.resource_key,
    msg_id: row.msg_id,
    speaker: speaker(effective),
    risk_score: score,
    flags: flags.join("；"),
    previous_context: previous,
    mod_english: en,
    official_chinese: official,
    current_chinese: zh,
    next_context: next,
    newline_result: newlineIssues.length ? newlineIssues.join("；") : "合规",
    match_class: row.match_class,
    has_override: override ? "yes" : "no",
    review_decision: "",
    corrected_zh: "",
  });
}

detail.sort((a, b) => b.risk_score - a.risk_score || a.category.localeCompare(b.category) || a.resource.localeCompare(b.resource) || a.msg_id.localeCompare(b.msg_id));
const candidates = detail.filter((row) => row.risk_score >= 6);
const headers = [
  "category", "resource", "msg_id", "speaker", "risk_score", "flags", "previous_context",
  "mod_english", "official_chinese", "current_chinese", "next_context", "newline_result",
  "match_class", "has_override", "review_decision", "corrected_zh",
];
fs.mkdirSync(REPORT_DIR, { recursive: true });
writeCsv(ALL_FILE, detail, headers);
writeCsv(CANDIDATE_FILE, candidates, headers);
const byCategory = Object.fromEntries([...new Set(detail.map((row) => row.category))].sort().map((category) => [category, {
  rows: detail.filter((row) => row.category === category).length,
  candidates: candidates.filter((row) => row.category === category).length,
  newline: detail.filter((row) => row.category === category && row.newline_result !== "合规").length,
}]));
console.log(JSON.stringify({ total: detail.length, candidates: candidates.length, byCategory, allFile: ALL_FILE, candidateFile: CANDIDATE_FILE }, null, 2));
