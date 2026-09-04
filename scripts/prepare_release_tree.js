const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const CATALOG = path.join(ROOT, "translations", "catalog");
const STATUS = path.join(ROOT, "translations", "resource_status.json");
const BUILD_OUTPUT = path.join(ROOT, "build", "translation_patch", "output");
const ORIGINAL = path.resolve(process.env.ROSE_ORIGINAL_MOD || "F:/Reloaded-II/Mods/p5rpc.kasumi.roseandviolet");

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
  const headers = rows.shift() || [];
  if (headers[0]) headers[0] = headers[0].replace(/^\ufeff/, "");
  return rows.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
  );
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function portableRelative(file) {
  const prefix = file.startsWith("original://") ? "original://" : file.startsWith("reference://") ? "reference://" : "";
  return prefix ? file.slice(prefix.length).replaceAll("/", path.sep) : "";
}

function releasePaths(record, modPath) {
  const relative = portableRelative(modPath);
  if (!relative) return [];
  if (record.type === "bmd") {
    const msg = relative.toLowerCase().endsWith(".msg") ? relative : `${relative}.msg`;
    return [msg.replace(/\.msg$/i, ""), msg];
  }
  if (record.type === "bf") {
    return [relative.replace(/\.msg$/i, ".BF"), relative.replace(/\.BF$/i, ".msg")];
  }
  return [relative];
}

const modPaths = new Map();
for (const file of fs.readdirSync(CATALOG).filter((name) => name.endsWith(".csv.gz"))) {
  const csv = zlib.gunzipSync(fs.readFileSync(path.join(CATALOG, file))).toString("utf8");
  for (const row of parseCsv(csv)) if (!modPaths.has(row.resource_key)) modPaths.set(row.resource_key, row.mod_path);
}

let synced = 0;
for (const source of walk(BUILD_OUTPUT)) {
  const relative = path.relative(BUILD_OUTPUT, source);
  if (!fs.existsSync(path.join(ORIGINAL, relative))) continue;
  const destination = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  synced++;
}

let removed = 0;
for (const record of JSON.parse(fs.readFileSync(STATUS, "utf8"))) {
  if (record.status !== "skipped_untranslated_ascii") continue;
  for (const relative of releasePaths(record, modPaths.get(record.resourceKey) || "")) {
    const destination = path.resolve(ROOT, relative);
    if (!destination.startsWith(ROOT + path.sep)) throw new Error(`Release path escaped repository: ${destination}`);
    if (!fs.existsSync(destination) || fs.statSync(destination).isDirectory()) continue;
    fs.rmSync(destination);
    removed++;
  }
}

console.log(JSON.stringify({ synced, removed, statusResources: JSON.parse(fs.readFileSync(STATUS, "utf8")).length }, null, 2));
