const fs = require("fs");
const path = require("path");

const file = path.resolve(__dirname, "..", "translations", "overrides.csv");

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
  const headers = rows.shift();
  headers[0] = headers[0].replace(/^\ufeff/, "");
  return { headers, rows };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const { headers, rows } = parseCsv(fs.readFileSync(file, "utf8"));
const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
const target = rows.find((row) =>
  row[indexes.category] === "battle" &&
  row[indexes.resource_key] === "BATTLE/MESSAGE/EN/NAVI_09.BMD" &&
  row[indexes.msg_id] === "btl_support_09_809",
);
if (!target) throw new Error("btl_support_09_809 override not found");
target[indexes.final_zh] = target[indexes.final_zh].replace("霞变成老鼠了", "堇变成老鼠了");
target[indexes.updated_at] = "2026-08-09T10:20:00.000Z";
target[indexes.compiled_at] = "";
const output = rows.map((row) => headers.map((_, index) => csvCell(row[index])).join(",")).join("\r\n");
fs.writeFileSync(file, `\ufeff${headers.join(",")}\r\n${output}\r\n`, "utf8");
console.log("fixed BATTLE/MESSAGE/EN/NAVI_09.BMD btl_support_09_809");
