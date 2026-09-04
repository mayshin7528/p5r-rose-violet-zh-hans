import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1")), "..");
const auditFile = path.join(root, "docs", "reports", "third_semester_line_audit_20260809.csv");
const overridesFile = path.join(root, "translations", "overrides.csv");
const outputDir = path.join(root, "outputs", "third-semester-audit-20260809");
const outputFile = path.join(outputDir, "第三学期逐句审核_20260809.xlsx");

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
  return rows.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
  );
}

function visible(text) {
  return String(text || "")
    .replace(/^\[(?:msg|sel)\s+[^\r\n]+\]\s*/m, "")
    .replace(/\[f 4 1\]|\[lName\]/g, "〔动态姓氏〕")
    .replace(/\[f 4 2\]|\[fName\]/g, "〔动态名字〕")
    .replace(/\[f 4 3\]/g, "〔动态全名〕")
    .replace(/\[n\]/g, "\n")
    .replace(/\[[^\]]*\]/g, "")
    .trim();
}

const auditRows = parseCsv(await fs.readFile(auditFile, "utf8"));
const overrideRows = parseCsv(await fs.readFile(overridesFile, "utf8"));
const changedRows = auditRows.filter((row) => row.action_result.startsWith("已改"));
const battleRows = overrideRows
  .filter((row) => row.category === "battle" && row.resource_key === "BATTLE/MESSAGE/EN/NAVI_09.BMD" && /^btl_support_09_(?:78[9]|79\d|80\d|81[0-8])$/.test(row.msg_id))
  .sort((a, b) => a.msg_id.localeCompare(b.msg_id));

const workbook = Workbook.create();
const summary = workbook.worksheets.add("总览");
const audit = workbook.worksheets.add("逐句审核");
const changes = workbook.worksheets.add("修正明细");
const battle = workbook.worksheets.add("战斗状态");

for (const sheet of [summary, audit, changes, battle]) sheet.showGridLines = false;

const titleFormat = { fill: "#1F2937", font: { bold: true, color: "#FFFFFF", size: 16 }, verticalAlignment: "center" };
const headerFormat = { fill: "#374151", font: { bold: true, color: "#FFFFFF" }, verticalAlignment: "center", wrapText: true };
const sectionFormat = { fill: "#E5E7EB", font: { bold: true, color: "#111827" } };

summary.mergeCells("A1:F2");
summary.getRange("A1").values = [["P5R Violet Mod 第三学期逐句审核"]];
summary.getRange("A1:F2").format = titleFormat;
summary.getRange("A4:B8").values = [
  ["审核范围", "EVENT_DATA/MESSAGE/E500/E511_*.BMD"],
  ["资源文件", new Set(auditRows.map((row) => row.resource)).size],
  ["文本总数", auditRows.length],
  ["审核日期", "2026-08-09"],
  ["编译/部署", "本轮未执行"],
];
summary.getRange("A4:A8").format = sectionFormat;
summary.getRange("D4:E4").values = [["处理结论", "数量"]];
summary.getRange("D4:E4").format = headerFormat;
const actionCounts = [...new Set(auditRows.map((row) => row.action_result))].map((action) => [action, auditRows.filter((row) => row.action_result === action).length]);
summary.getRangeByIndexes(4, 3, actionCounts.length, 2).values = actionCounts;
summary.getRange("A10:F10").merge();
summary.getRange("A10").values = [["审核规则"]];
summary.getRange("A10:F10").format = headerFormat;
summary.getRange("A11:F16").merge(true);
summary.getRange("A11:F16").values = [
  ["1. 主角是芳泽霞；Mod 中 Sumire 永远是芳泽堇。"],
  ["2. Mod 英文改写剧情时按 Mod 翻译，不机械继承官中。"],
  ["3. 动态姓名保留控制码；-san 等称谓按英文和中文语境处理。"],
  ["4. Cognitive Psience 固定译为“认知诃学”。"],
  ["5. 本轮仅更新译文源与报告，不编译、不部署。"],
  ["6. 战斗实测的‘霞眩晕/绝望’与当前源文本不一致，需下一轮重新编译验证。"],
];
summary.getRange("A11:F16").format = { wrapText: true, verticalAlignment: "center", fill: "#F9FAFB" };
summary.getRange("A18:F18").merge();
summary.getRange("A18").values = [["战斗状态结论"]];
summary.getRange("A18:F18").format = headerFormat;
summary.getRange("A19:F21").merge(true);
summary.getRange("A19:F21").values = [
  ["NAVI_09 的眩晕、绝望等堇专属状态源文本均为“堇”。"],
  ["btl_support_09_809 原为“霞变成老鼠了”，本轮已修正为“堇变成老鼠了”。"],
  ["游戏仍显示“霞”说明部署文件较旧；本轮遵照要求未重新编译。"],
];
summary.getRange("A19:F21").format = { wrapText: true, fill: "#FFF7ED" };
summary.getRange("A1:F21").format.font = { name: "Microsoft YaHei" };
summary.getRange("A:A").format.columnWidth = 24;
summary.getRange("B:B").format.columnWidth = 48;
summary.getRange("C:C").format.columnWidth = 4;
summary.getRange("D:D").format.columnWidth = 40;
summary.getRange("E:E").format.columnWidth = 12;
summary.getRange("F:F").format.columnWidth = 4;

const columns = [
  ["资源", "resource"], ["ID", "msg_id"], ["Mod说话人", "mod_speaker"], ["最终说话人", "final_speaker"],
  ["Mod英文", "mod_english"], ["官方中文", "official_chinese"], ["审核前中文", "chinese_before_audit"], ["最终中文", "final_chinese"],
  ["Mod变化分类", "mod_change_class"], ["处理结论", "action_result"], ["语义结论", "semantic_result"], ["说话人结论", "speaker_result"],
  ["控制码结论", "control_code_result"], ["风险标记", "risk_flags"], ["处理原因", "reason"], ["目标路径", "path"],
  ["译文更新时间", "override_updated_at"], ["编译时间", "compiled_at"],
];

function populateAuditSheet(sheet, rows, tableName) {
  const matrix = [columns.map(([label]) => label), ...rows.map((row) => columns.map(([, key]) => row[key] || ""))];
  sheet.getRangeByIndexes(0, 0, matrix.length, columns.length).values = matrix;
  sheet.getRangeByIndexes(0, 0, 1, columns.length).format = headerFormat;
  sheet.getRangeByIndexes(1, 0, rows.length, columns.length).format = { verticalAlignment: "top", wrapText: true, font: { name: "Microsoft YaHei", size: 9 } };
  sheet.tables.add(`A1:R${rows.length + 1}`, true, tableName).style = "TableStyleMedium2";
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(2);
  const widths = [42, 20, 16, 16, 54, 54, 54, 54, 22, 28, 22, 26, 22, 28, 48, 54, 24, 24];
  widths.forEach((width, index) => sheet.getRangeByIndexes(0, index, rows.length + 1, 1).format.columnWidth = width);
  sheet.getRange(`J2:J${rows.length + 1}`).conditionalFormats.add("containsText", { text: "已改", format: { fill: "#FDE68A", font: { bold: true, color: "#92400E" } } });
  sheet.getRange(`J2:J${rows.length + 1}`).conditionalFormats.add("containsText", { text: "Mod有改", format: { fill: "#DBEAFE", font: { color: "#1E40AF" } } });
}

populateAuditSheet(audit, auditRows, "ThirdSemesterAudit");
populateAuditSheet(changes, changedRows, "ThirdSemesterChanges");

const battleMatrix = [["资源", "ID", "当前源文本", "更新时间", "编译时间", "结论"], ...battleRows.map((row) => [
  row.resource_key, row.msg_id, visible(row.final_zh), row.updated_at, row.compiled_at,
  row.msg_id === "btl_support_09_809" ? "本轮修正：霞→堇" : "源文本已使用堇",
])];
battle.getRangeByIndexes(0, 0, battleMatrix.length, 6).values = battleMatrix;
battle.getRange("A1:F1").format = headerFormat;
battle.getRangeByIndexes(1, 0, battleRows.length, 6).format = { wrapText: true, verticalAlignment: "top", font: { name: "Microsoft YaHei", size: 10 } };
battle.getRange(`D2:E${battleMatrix.length}`).format.numberFormat = "yyyy-mm-dd hh:mm";
battle.tables.add(`A1:F${battleMatrix.length}`, true, "SumireBattleStatus").style = "TableStyleMedium2";
battle.freezePanes.freezeRows(1);
[44, 24, 64, 25, 25, 30].forEach((width, index) => battle.getRangeByIndexes(0, index, battleMatrix.length, 1).format.columnWidth = width);
battle.getRange(`F2:F${battleMatrix.length}`).conditionalFormats.add("containsText", { text: "本轮修正", format: { fill: "#FDE68A", font: { bold: true, color: "#92400E" } } });

await fs.mkdir(outputDir, { recursive: true });
const previews = [
  ["总览", "A1:F21", "preview-summary.png"],
  ["逐句审核", "A1:J12", "preview-audit.png"],
  ["修正明细", "A1:J12", "preview-changes.png"],
  ["战斗状态", `A1:F${Math.min(14, battleMatrix.length)}`, "preview-battle.png"],
];
for (const [sheetName, range, fileName] of previews) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, fileName), new Uint8Array(await preview.arrayBuffer()));
}
const inspection = await workbook.inspect({ kind: "table", range: "总览!A1:F21", include: "values,formulas", tableMaxRows: 24, tableMaxCols: 8 });
console.log(inspection.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "formula error scan" });
console.log(errors.ndjson);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputFile);
console.log(JSON.stringify({ outputFile, auditRows: auditRows.length, changedRows: changedRows.length, battleRows: battleRows.length }, null, 2));
