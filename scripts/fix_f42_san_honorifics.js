const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const CATALOG = path.join(ROOT, "translations", "catalog");
const OVERRIDES = path.join(ROOT, "translations", "overrides.csv");
const UPDATED_AT = "2026-08-09T08:22:00.000Z";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
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
  return `${row.resource_key}|${row.msg_id}`;
}

const replacements = new Map(Object.entries({
  "EVENT_DATA/MESSAGE/E400/E422_001.BMD|MSG_007_0_0": [
    ["[fName]……", "[f 4 2]同学……"],
  ],
  "EVENT_DATA/MESSAGE/E400/E481_090.BMD|MSG_004_5_0": [
    ["咦？原来你认识芳泽同学啊。", "咦？[f 4 2]同学原来不知道吗？"],
  ],
  "EVENT_DATA/MESSAGE/E400/E481_095.BMD|MSG_005_5_0": [
    ["咦？原来你认识芳泽同学啊。", "咦？[f 4 2]同学原来不知道吗？"],
  ],
  "EVENT_DATA/MESSAGE/E400/E482_007.BMD|MSG_012_0_0": [
    ["那时候我们交换了一些意见，[n]让我觉得她的想法太有趣了。", "拍摄时，[f 4 2]同学和我交换了意见，[n]她的思考方式令我很感兴趣。"],
  ],
  "EVENT_DATA/MESSAGE/E400/E482_007.BMD|MSG_028_0_0": [
    ["那我再问你一次，[n]你对堇同学的见解有什么想法？", "那么我问问你，[f 4 2]同学。[n]你怎么看堇同学的意见？"],
  ],
  "EVENT_DATA/MESSAGE/E700/E706_090.BMD|MSG_000_0_0": [
    ["杏，[lName]……我很重吧？[n]谢谢你们。", "杏，[f 4 2]同学……我很重吧？[n]谢谢你们帮忙。"],
  ],
  "EVENT_DATA/MESSAGE/E700/E712_100.BMD|MSG_015_0_0": [
    ["你为什么会[n]帮爸爸帮到这个地步呢？", "[f 4 2]同学，你为什么要[n]这样帮助我爸爸？"],
  ],
  "EVENT_DATA/MESSAGE/E700/E718_071.BMD|MSG_020_0_0": [
    ["[fName]说得没错。", "明智的决定，[f 4 2]同学。"],
  ],
  "EVENT_DATA/MESSAGE/E500/E511_350.BMD|MSG_005_0_0": [
    ["[lName]同学", "[f 4 2]同学"],
  ],
  "EVENT_DATA/MESSAGE/E500/E511_520.BMD|MSG_025_0_0": [
    ["假设丸喜像我，或是[fName]一样", "假设丸喜像我和[f 4 2]同学一样"],
  ],
  "EVENT_DATA/MESSAGE/E500/E511_563.BMD|MSG_037_0_0": [
    ["直到跟[fName][n]见面为止", "直到再次见到[f 4 2]同学为止"],
  ],
  "EVENT_DATA/MESSAGE/E500/E511_563.BMD|MSG_052_0_0": [
    ["我有话要跟[fName]说。", "我想和[f 4 2]同学谈谈。"],
  ],
  "EVENT_DATA/MESSAGE/E600/E696_001.BMD|MSG_460_0_0": [
    ["[fName]", "[f 4 2]同学"],
  ],
  "EVENT_DATA/MESSAGE/E600/E696_001.BMD|MSG_490_0_0": [
    ["[fName]", "[f 4 2]同学"],
  ],
  "EVENT_DATA/MESSAGE/E600/E696_001.BMD|MSG_505_0_0": [
    ["[fName]", "[f 4 2]同学"],
  ],
  "EVENT_DATA/MESSAGE/E600/E696_001.BMD|MSG_600_0_0": [
    ["[fName]", "[f 4 2]同学"],
  ],
  "EVENT_DATA/MESSAGE/E600/E698_001.BMD|MSG_999_3_0": [
    ["[lName]，我会[n]一直支持你们的……！", "我会一直支持你的，[f 4 2]同学！"],
  ],
  "EVENT_DATA/MESSAGE/E900/E980_767.BMD|MSG_019_0_0": [
    ["第１回合就交给[fName]了。", "第１回合就交给[f 4 2]同学了。"],
  ],
  "EVENT_DATA/MESSAGE/E500/E511_210.BMD|MSG_018_0_0": [
    ["那天[f 4 2]到底会不会死", "那天[f 4 2]同学到底会不会死"],
  ],
}));

const additionallyDirty = new Set([
  "EVENT_DATA/MESSAGE/E500/E511_210.BMD|MSG_010_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_210.BMD|MSG_011_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_210.BMD|MSG_017_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_210.BMD|MSG_017_3_0",
  "EVENT_DATA/MESSAGE/E500/E511_210.BMD|MSG_017_5_0",
  "EVENT_DATA/MESSAGE/E500/E511_210.BMD|MSG_040_3_0",
  "EVENT_DATA/MESSAGE/E500/E511_210.BMD|MSG_040_5_0",
]);

const overrideRows = parseCsv(fs.readFileSync(OVERRIDES, "utf8"));
const overrideMap = new Map(overrideRows.map((row) => [key(row), row]));
const catalogMap = new Map();

for (const name of fs.readdirSync(CATALOG).filter((name) => name.endsWith(".csv.gz") && name !== "optional_mod_files.csv.gz")) {
  const rows = parseCsv(zlib.gunzipSync(fs.readFileSync(path.join(CATALOG, name))).toString("utf8"));
  for (const row of rows) {
    const rowKey = key(row);
    if (replacements.has(rowKey) && !catalogMap.has(rowKey)) catalogMap.set(rowKey, row);
  }
}

for (const [rowKey, changes] of replacements) {
  let row = overrideMap.get(rowKey);
  if (!row) {
    const catalog = catalogMap.get(rowKey);
    if (!catalog) throw new Error(`Catalog row not found: ${rowKey}`);
    row = {
      category: catalog.category,
      resource_key: catalog.resource_key,
      msg_id: catalog.msg_id,
      final_zh: catalog.final_zh,
      updated_at: "",
      compiled_at: "",
    };
    overrideRows.push(row);
    overrideMap.set(rowKey, row);
  }

  for (const [before, after] of changes) {
    if (row.final_zh.includes(after)) continue;
    if (!row.final_zh.includes(before)) throw new Error(`Expected text not found for ${rowKey}: ${before}`);
    row.final_zh = row.final_zh.replace(before, after);
  }
  if (!row.final_zh.includes("[f 4 2]同学")) throw new Error(`Honorific was not applied: ${rowKey}`);
  row.updated_at = UPDATED_AT;
  row.compiled_at = "";
}

for (const rowKey of additionallyDirty) {
  const row = overrideMap.get(rowKey);
  if (!row) throw new Error(`Dirty override row not found: ${rowKey}`);
  row.updated_at = UPDATED_AT;
  row.compiled_at = "";
}

const headers = ["category", "resource_key", "msg_id", "final_zh", "updated_at", "compiled_at"];
const body = overrideRows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\r\n");
fs.writeFileSync(OVERRIDES, `\ufeff${headers.join(",")}\r\n${body}\r\n`, "utf8");
console.log(JSON.stringify({ updated: replacements.size, totalOverrides: overrideRows.length }, null, 2));
