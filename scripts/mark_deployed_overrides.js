const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const overrideFile = path.join(root, "translations", "overrides.csv");
const statusFile = path.join(root, "build", "translation_patch", "resource_status.json");
const persistentStatusFile = path.join(root, "translations", "resource_status.json");
const buildReportFile = path.join(root, "build", "translation_patch", "build_report.json");
const persistentBuildReportFile = path.join(root, "translations", "build_report.json");

function parseCsv(text) {
  const values = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); values.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); values.push(row); }
  const headers = values.shift();
  if (headers[0]) headers[0] = headers[0].replace(/^\ufeff/, "");
  return { headers, rows: values.filter((cells) => cells.some(Boolean)).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])),
  ) };
}
function csvCell(value) { const text = String(value || ""); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

const parsed = parseCsv(fs.readFileSync(overrideFile, "utf8"));
const successful = new Set(JSON.parse(fs.readFileSync(statusFile, "utf8"))
  .filter((row) => row.status === "compiled" || row.status === "ready_msg_overlay")
  .map((row) => row.resourceKey));
const compiledAt = new Date().toISOString();
let marked = 0;
for (const row of parsed.rows) {
  if (!successful.has(row.resource_key)) continue;
  row.compiled_at = compiledAt;
  marked++;
}
const output = [parsed.headers.join(","), ...parsed.rows.map((row) => parsed.headers.map((header) => csvCell(row[header])).join(","))].join("\r\n") + "\r\n";
fs.writeFileSync(overrideFile, `\ufeff${output}`, "utf8");
const currentStatuses = JSON.parse(fs.readFileSync(statusFile, "utf8"));
const persistentStatuses = fs.existsSync(persistentStatusFile)
  ? JSON.parse(fs.readFileSync(persistentStatusFile, "utf8"))
  : [];
const mergedStatuses = new Map(persistentStatuses.map((row) => [row.resourceKey, row]));
for (const row of currentStatuses) mergedStatuses.set(row.resourceKey, row);
fs.writeFileSync(persistentStatusFile, JSON.stringify([...mergedStatuses.values()], null, 2), "utf8");
if (fs.existsSync(buildReportFile)) fs.copyFileSync(buildReportFile, persistentBuildReportFile);
console.log(JSON.stringify({
  overrides: parsed.rows.length,
  marked,
  unmarked: parsed.rows.length - marked,
  incrementalStatuses: currentStatuses.length,
  persistentStatuses: mergedStatuses.size,
  compiledAt,
}, null, 2));
