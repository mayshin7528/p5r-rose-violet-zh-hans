const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OVERRIDES = path.join(ROOT, "translations", "overrides.csv");

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

const baselineText = fs.readFileSync(0, "utf8");
const newline = baselineText.includes("\r\n") ? "\r\n" : "\n";
const baseline = parseCsv(baselineText);
const current = parseCsv(fs.readFileSync(OVERRIDES, "utf8"));
const currentMap = new Map(current.map((row) => [key(row), row]));
const ordered = [];

for (const row of baseline) {
  const selected = currentMap.get(key(row));
  if (selected) {
    ordered.push(selected);
    currentMap.delete(key(row));
  }
}
ordered.push(...[...currentMap.values()].sort((a, b) => key(a).localeCompare(key(b))));

const headers = ["category", "resource_key", "msg_id", "final_zh", "updated_at", "compiled_at"];
const body = ordered.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join(newline);
fs.writeFileSync(OVERRIDES, `\ufeff${headers.join(",")}${newline}${body}${newline}`, "utf8");
console.log(JSON.stringify({ baseline: baseline.length, current: current.length, output: ordered.length }, null, 2));
