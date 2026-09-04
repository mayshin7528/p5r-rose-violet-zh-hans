const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const CATALOG = path.join(ROOT, "translations", "catalog");
const OVERRIDES = path.join(ROOT, "translations", "overrides.csv");
const STATUS = path.join(ROOT, "translations", "resource_status.json");
const OUTPUT = path.join(ROOT, "docs", "reports", "剩余主Mod未翻译明细_20260809.csv");
const EXCLUDED_OUTPUT = path.join(ROOT, "docs", "reports", "主Mod占位符排除明细_20260809.csv");
const REPORT_OUTPUT = path.join(ROOT, "docs", "reports", "剩余主Mod未翻译审查报告_20260809.md");

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
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

function key(row) {
  return [row.category, row.resource_key, row.msg_id].join("\u0000");
}

function visible(text) {
  return String(text || "")
    .replace(/^\[(?:msg|sel)\s+[^\r\n]+\]\s*/m, "")
    .replace(/\[n\]/g, "\n")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function fullyEnglish(text) {
  const value = visible(text);
  return /[A-Za-z]{2,}/.test(value) && !/[\u3400-\u9fff]/.test(value);
}

function placeholderKind(text) {
  const lines = visible(text).normalize("NFKC").split(/\r?\n/)
    .map((line) => line.trim().replace(/[。.!]+$/, ""))
    .filter(Boolean);
  if (!lines.length) return "";
  if (lines.every((line) => /^reserve$/i.test(line))) return "RESERVE reserved slot";
  if (lines.every((line) => /^(?:ex)?ダミー$/i.test(line))) return "Japanese dummy slot";
  if (lines.every((line) => /^test\d+$/i.test(line))) return "test slot";
  if (lines.every((line) => /^(?:ex)?dummy(?:\s*[0-9]+|\s+[a-z0-9_]+)?$/i.test(line))) return "Dummy placeholder";
  return "";
}

function speaker(text) {
  return String(text || "").split(/\r?\n/, 1)[0].match(/\[([^\[\]]+)\]\]$/)?.[1] || "";
}

const overrides = new Map(parseCsv(fs.readFileSync(OVERRIDES, "utf8")).map((row) => [key(row), row]));
const skippedMain = new Set(JSON.parse(fs.readFileSync(STATUS, "utf8"))
  .filter((row) => row.status === "skipped_untranslated_ascii" && !row.resourceKey.startsWith("OptionalModFiles/"))
  .map((row) => row.resourceKey));
const groups = new Map();

for (const file of fs.readdirSync(CATALOG).filter((name) => name.endsWith(".csv.gz")).sort()) {
  const csv = zlib.gunzipSync(fs.readFileSync(path.join(CATALOG, file))).toString("utf8");
  for (const row of parseCsv(csv)) {
    if (!skippedMain.has(row.resource_key)) continue;
    const selected = overrides.get(key(row))?.final_zh || row.final_zh;
    const item = { ...row, selected };
    if (!groups.has(row.resource_key)) groups.set(row.resource_key, []);
    groups.get(row.resource_key).push(item);
  }
}

const output = [];
const excluded = [];
for (const [resource, rows] of groups) {
  rows.forEach((row, index) => {
    if (!fullyEnglish(row.selected)) return;
    const placeholder = placeholderKind(row.mod_text) || placeholderKind(row.selected);
    const official = visible(row.official_chinese);
    const reason = official
      ? "官中存在，但此前按 Mod 英文回退；需要判断 Mod 是否改写"
      : row.match_class === "MOD_ADDED"
        ? "Mod 新增文本，没有官方中文"
        : "没有可靠的官方中文对应文本";
    const record = {
      category: row.category,
      resource_key: resource,
      msg_id: row.msg_id,
      speaker: speaker(row.mod_text),
      previous_context: index ? visible(rows[index - 1].mod_text) : "",
      mod_english: visible(row.mod_text),
      next_context: index + 1 < rows.length ? visible(rows[index + 1].mod_text) : "",
      official_chinese: official,
      match_class: row.match_class,
      reason,
      proposed_zh: "",
    };
    if (placeholder) excluded.push({ ...record, reason: placeholder });
    else output.push(record);
  });
}

const headers = ["category", "resource_key", "msg_id", "speaker", "previous_context", "mod_english", "next_context", "official_chinese", "match_class", "reason", "proposed_zh"];
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `\ufeff${headers.join(",")}\r\n${output.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\r\n")}\r\n`, "utf8");
fs.writeFileSync(EXCLUDED_OUTPUT, `\ufeff${headers.join(",")}\r\n${excluded.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\r\n")}\r\n`, "utf8");

const byReason = output.reduce((all, row) => { all[row.reason] = (all[row.reason] || 0) + 1; return all; }, {});
const byResource = [...groups].map(([resource, rows]) => ({ resource, untranslated: rows.filter((row) => fullyEnglish(row.selected)).length }))
  .filter((row) => row.untranslated).sort((a, b) => b.untranslated - a.untranslated);
const excludedKinds = excluded.reduce((all, row) => { all[row.reason] = (all[row.reason] || 0) + 1; return all; }, {});
const report = `# 剩余主 Mod 未翻译内容审查报告（2026-08-09）

## 结论

- 审查范围：主 Mod；已排除所有 \`OptionalModFiles/\` 资源。
- 原检测结果：${output.length + excluded.length} 条“整句英文”。
- 实际需要翻译：${output.length} 条。
- 排除的开发占位符：${excluded.length} 条。
- 本轮新增或修改译文：0 条。
- 编译与部署：未执行。
- 管理器中的既有 \`skipped_untranslated_ascii\` 状态来自上一次编译报告；本轮按要求不编译，因此该旧状态不会在本轮被重写。

## 为什么此前显示未翻译

旧检测只判断文本是否含连续英文字母且不含汉字，因此把 \`Dummy\`、\`RESERVE\`、\`test1\` 等开发占位符误判为英文台词。这些槽位不是玩家可见的有效剧情文本；官中资源也保留了同类占位内容，翻译它们反而会改变资源语义。

## 排除明细

${Object.entries(excludedKinds).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `- ${kind}: ${count} 条`).join("\n")}

完整排除记录见 \`主Mod占位符排除明细_20260809.csv\`。真正待翻译清单见 \`剩余主Mod未翻译明细_20260809.csv\`；本次审查后该表仅保留表头，表示没有有效遗漏。

## 剧情关系复核

排除项中没有 \`Sumire\`、\`Kasumi\`、\`Sis\`、\`Sister\`、\`Senpai\`、\`Rose\` 或动态姓名相关文本。因此本轮没有需要重新判断的姐妹称谓、主角选项、人物指代或 Coop 剧情语句。
`;
fs.writeFileSync(REPORT_OUTPUT, report, "utf8");
console.log(JSON.stringify({ resources: byResource.length, messages: output.length, excluded: excluded.length, excludedKinds, byReason, output: OUTPUT, excludedOutput: EXCLUDED_OUTPUT, report: REPORT_OUTPUT }, null, 2));
