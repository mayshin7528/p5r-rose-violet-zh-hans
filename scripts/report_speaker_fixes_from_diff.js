const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "docs", "reports", "说话人标签修复明细_20260809.csv");
const diff = fs.readFileSync(0, "utf8");

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function collect(prefix) {
  const rows = new Map();
  for (const line of diff.split(/\r?\n/)) {
    if (!line.startsWith(prefix) || line.startsWith(`${prefix}${prefix}${prefix}`)) continue;
    const match = line.slice(1).match(/^([^,]+),([^,]+),([^,]+),"\[msg\s+[^\s\]]+\s+\[([^\]]+)\]\]/);
    if (!match) continue;
    const [, category, resourceKey, msgId, speaker] = match;
    rows.set([category, resourceKey, msgId].join("\u0000"), { category, resource_key: resourceKey, msg_id: msgId, speaker });
  }
  return rows;
}

const removed = collect("-");
const added = collect("+");
const output = [];
for (const [key, before] of removed) {
  const after = added.get(key);
  if (!after || before.speaker === after.speaker) continue;
  if (!/[A-Za-z]{2,}/.test(before.speaker) || /[A-Za-z]{2,}/.test(after.speaker)) continue;
  output.push({
    category: before.category,
    resource_key: before.resource_key,
    msg_id: before.msg_id,
    before_speaker: before.speaker,
    after_speaker: after.speaker,
  });
}

const headers = ["category", "resource_key", "msg_id", "before_speaker", "after_speaker"];
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `\ufeff${headers.join(",")}\r\n${output.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\r\n")}\r\n`, "utf8");
console.log(JSON.stringify({ speakerFixes: output.length, output: OUTPUT }, null, 2));
