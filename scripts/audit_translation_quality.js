const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const CATALOG = path.join(ROOT, "translations", "catalog");
const OVERRIDES = path.join(ROOT, "translations", "overrides.csv");
const OUTPUT = path.join(ROOT, "docs", "reports", "最终汉化高风险候选_20260809.csv");

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
    .replace(/\[f 4 1\]/g, "〔动态姓氏〕")
    .replace(/\[f 4 2\]/g, "〔动态名字〕")
    .replace(/\[f 4 3\]/g, "〔动态全名〕")
    .replace(/\[fName\]/g, "〔动态名字〕")
    .replace(/\[n\]/g, "\n")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function speaker(text) {
  return String(text || "").split(/\r?\n/, 1)[0].match(/\[([^\[\]]+)\]\]$/)?.[1] || "";
}

function count(text, expression) {
  return (String(text || "").match(expression) || []).length;
}

function placeholder(text) {
  const lines = visible(text).normalize("NFKC").split(/\r?\n/)
    .map((line) => line.trim().replace(/[。.!]+$/, ""))
    .filter(Boolean);
  return lines.length > 0 && lines.every((line) =>
    /^(?:ex)?dummy(?:\s*[0-9]+|\s+[a-z0-9_]+)?$/i.test(line)
      || /^(?:ex)?ダミー$/i.test(line)
      || /^reserve$/i.test(line)
      || /^test\d+$/i.test(line),
  );
}

function isStory(category) {
  return /^(?:event_|camp$|mypalace$|facility$|femulator_pak$)/.test(category);
}

const overrideRows = parseCsv(fs.readFileSync(OVERRIDES, "utf8"));
const overrides = new Map(overrideRows.map((row) => [key(row), row]));
const rows = [];

for (const file of fs.readdirSync(CATALOG).filter((name) => name.endsWith(".csv.gz") && name !== "optional_mod_files.csv.gz").sort()) {
  const source = zlib.gunzipSync(fs.readFileSync(path.join(CATALOG, file))).toString("utf8");
  for (const row of parseCsv(source)) {
    const override = overrides.get(key(row));
    rows.push({
      ...row,
      effective_final: override?.final_zh || row.final_zh || "",
      has_override: override ? "yes" : "no",
    });
  }
}

const byResource = new Map();
for (const row of rows) {
  if (!byResource.has(row.resource_key)) byResource.set(row.resource_key, []);
  byResource.get(row.resource_key).push(row);
}

const modifiedResources = new Set();
for (const [resource, items] of byResource) {
  const storyOverrides = items.filter((row) => row.has_override === "yes").length;
  const changed = items.filter((row) => row.match_class === "MINOR_EDIT" || row.match_class === "MOD_ADDED").length;
  if (storyOverrides >= 2 || changed >= 2) modifiedResources.add(resource);
}

const candidates = [];
for (const [resource, items] of byResource) {
  items.forEach((row, index) => {
    const en = visible(row.mod_text);
    const zh = visible(row.effective_final);
    if (!en || placeholder(en)) return;
    const flags = [];
    const finalSpeaker = speaker(row.effective_final);
    const modSpeaker = speaker(row.mod_text);
    const isSelection = /^\[sel\s/i.test(row.mod_text);

    if (/[A-Za-z]{3,}/.test(zh) && !/[\u3400-\u9fff]/.test(zh)) flags.push("full_english");
    if (/\b(?:sumire|sumire-san)\b/i.test(en) && !/(?:堇|妹妹|姐姐|动态)/.test(zh)) flags.push("sumire_missing");
    if (/\b(?:kasumi|kasumi-san)\b/i.test(en) && !/(?:霞|姐姐|动态)/.test(zh)) flags.push("kasumi_missing");
    if (/\b(?:sis|sister)\b/i.test(en)) flags.push(isSelection ? "sister_in_selection" : "sister_relation");
    if (/\bsenpai\b/i.test(en)) flags.push("senpai_context");
    if (/\b(?:rose|violet)\b/i.test(en)) flags.push("codename_or_protagonist");
    if (/\b(?:anastasie|arsene|briar)\b/i.test(en)) flags.push("persona_name");
    if (/(?:学长|姐姐大人|芳泽\s*霞)/.test(zh)) flags.push("known_bad_wording");
    if (count(row.mod_text, /\[f 4 [123]\]/g) !== count(row.effective_final, /\[f 4 [123]\]/g)) flags.push("dynamic_name_mismatch");
    if (count(row.mod_text, /\[e\]/g) !== count(row.effective_final, /\[e\]/g)) flags.push("end_code_mismatch");
    if (!isSelection && finalSpeaker && /[A-Za-z]{2,}/.test(finalSpeaker)) flags.push("ascii_speaker");
    if (isStory(row.category) && modifiedResources.has(resource) && row.has_override === "no" && row.final_source === "official_chinese") flags.push("official_in_modified_story_resource");
    if ((row.match_class === "MINOR_EDIT" || row.match_class === "MOD_ADDED") && row.has_override === "no") flags.push("unreviewed_mod_change");

    if (!flags.length) return;
    candidates.push({
      category: row.category,
      resource_key: resource,
      msg_id: row.msg_id,
      speaker: finalSpeaker || modSpeaker,
      flags: flags.join(";"),
      previous_context: index ? visible(items[index - 1].mod_text) : "",
      mod_english: en,
      current_chinese: zh,
      official_chinese: visible(row.official_chinese),
      next_context: index + 1 < items.length ? visible(items[index + 1].mod_text) : "",
      match_class: row.match_class,
      final_source: row.final_source,
      has_override: row.has_override,
      decision: "",
      corrected_zh: "",
    });
  });
}

const headers = ["category", "resource_key", "msg_id", "speaker", "flags", "previous_context", "mod_english", "current_chinese", "official_chinese", "next_context", "match_class", "final_source", "has_override", "decision", "corrected_zh"];
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `\ufeff${headers.join(",")}\r\n${candidates.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\r\n")}\r\n`, "utf8");

const byFlag = {};
const byCategory = {};
for (const row of candidates) {
  byCategory[row.category] = (byCategory[row.category] || 0) + 1;
  for (const flag of row.flags.split(";")) byFlag[flag] = (byFlag[flag] || 0) + 1;
}
console.log(JSON.stringify({ totalRows: rows.length, overrides: overrideRows.filter((row) => row.category !== "optional_mod_files").length, modifiedResources: modifiedResources.size, candidates: candidates.length, byFlag, byCategory, output: OUTPUT }, null, 2));
