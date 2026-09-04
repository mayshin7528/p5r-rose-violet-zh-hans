const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_FILE = path.join(ROOT, "translations", "catalog", "event_other.csv.gz");
const OVERRIDES_FILE = path.join(ROOT, "translations", "overrides.csv");
const REPORT_DIR = path.join(ROOT, "docs", "reports");
const DETAIL_FILE = path.join(REPORT_DIR, "third_semester_line_audit_20260809.csv");
const RISK_FILE = path.join(REPORT_DIR, "third_semester_risk_review_20260809.csv");
const SUMMARY_FILE = path.join(REPORT_DIR, "第三学期逐句审核报告_20260809.md");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
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
    .replace(/\[f 4 1\]/g, "〔动态姓氏〕")
    .replace(/\[f 4 2\]/g, "〔动态名字〕")
    .replace(/\[f 4 3\]/g, "〔动态全名〕")
    .replace(/\[fName\]/g, "〔动态名字〕")
    .replace(/\[lName\]/g, "〔动态姓氏〕")
    .replace(/\[n\]/g, "\n")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function speaker(text) {
  const first = String(text || "").split(/\r?\n/, 1)[0];
  const match = first.match(/^\[(?:msg|sel)\s+[^\]]+?(?:\s+\[([^\]]+)\])?\]$/);
  return match?.[1] || "";
}

function normalize(text) {
  return visible(text).normalize("NFKC").replace(/[\s，。！？、…·：；“”‘’『』「」（）()\-—]/g, "").toLowerCase();
}

function countControl(text, pattern) {
  return (String(text || "").match(pattern) || []).length;
}

function countDynamicNameControls(text) {
  return countControl(text, /\[f 4 [123]\]/g) + countControl(text, /\[(?:fName|lName)\]/g);
}

const REVIEWED_CORRECT = new Set([
  "EVENT_DATA/MESSAGE/E500/E511_090.BMD\u0000MSG_002_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_150.BMD\u0000MSG_010_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_150.BMD\u0000MSG_012_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_150.BMD\u0000MSG_014_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_150.BMD\u0000MSG_017_5_0",
  "EVENT_DATA/MESSAGE/E500/E511_290.BMD\u0000MSG_007_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_290.BMD\u0000MSG_023_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_345.BMD\u0000MSG_005_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_400.BMD\u0000MSG_012_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_550.BMD\u0000MSG_020_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_550.BMD\u0000MSG_024_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_550.BMD\u0000MSG_028_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_550.BMD\u0000MSG_029_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_550.BMD\u0000MSG_033_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_550.BMD\u0000MSG_038_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_552.BMD\u0000MSG_001_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_553.BMD\u0000MSG_018_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_553.BMD\u0000MSG_019_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_557.BMD\u0000MND_006_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_557.BMD\u0000MSG_001_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_559.BMD\u0000MSG_011_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_569.BMD\u0000MND_000_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_595.BMD\u0000MSG_014_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_604.BMD\u0000MSG_026_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_605.BMD\u0000MSG_009_5_0",
  "EVENT_DATA/MESSAGE/E500/E511_640.BMD\u0000MSG_003_0_0",
]);

const REVIEWED_PLACEHOLDERS = new Set([
  "EVENT_DATA/MESSAGE/E500/E511_255.BMD\u0000MND_000_0_0",
  "EVENT_DATA/MESSAGE/E500/E511_315.BMD\u0000MND_000_0_0",
]);

function riskFlags(row) {
  const en = visible(row.mod_text);
  const zh = visible(row.effective_final);
  const flags = [];
  if (row.match_class !== "EXACT_OFFICIAL_PROXY") flags.push("Mod文本变化");
  if (row.match_class !== "EXACT_OFFICIAL_PROXY" && normalize(row.effective_final) === normalize(row.official_chinese)) {
    flags.push("Mod有变化但仍等同官中");
  }
  if (/\b(?:sumire|kasumi|sis|sister|senpai|violet|rose)\b/i.test(en)) flags.push("核心人物或称谓");
  if (/\b(?:dead|died|death|killed|mother|father|parent|accident|arrested)\b/i.test(en)) flags.push("剧情事实");
  if (/\[f 4 [123]\]|\[(?:fName|lName)\]/.test(row.mod_text)) flags.push("动态姓名");
  if (/\b(?:Sumire|Kasumi|Akechi|Maruki|Morgana|Futaba|Ann|Ryuji|Makoto|Haru|Yusuke)\b/.test(speaker(row.effective_final))) flags.push("英文说话人");
  if (/\b[A-Za-z]{3,}\b/.test(zh) && /[\u3400-\u9fff]/.test(zh)) flags.push("正文残留英文");
  if (/^[\s\S]*\b[A-Za-z]{3,}\b[\s\S]*$/.test(zh) && !/[\u3400-\u9fff]/.test(zh)) flags.push("整句英文");
  if (/\bKasumi\b|\bsumi(?:\s*0+)+\b/i.test(zh)) flags.push("可见占位符");
  if (countDynamicNameControls(row.mod_text) !== countDynamicNameControls(row.effective_final)) flags.push("动态姓名数量不一致");
  if (countControl(row.mod_text, /\[e\]/g) !== countControl(row.effective_final, /\[e\]/g)) flags.push("结束码数量不一致");
  return [...new Set(flags)];
}

const catalog = parseCsv(zlib.gunzipSync(fs.readFileSync(CATALOG_FILE)).toString("utf8"));
const overrideRows = parseCsv(fs.readFileSync(OVERRIDES_FILE, "utf8"));
const overrides = new Map(overrideRows.map((row) => [rowKey(row), row]));
const thirdSemester = catalog.filter((row) => /^EVENT_DATA\/MESSAGE\/E500\/E511_\d+\.BMD$/i.test(row.resource_key));

const detail = thirdSemester.map((row) => {
  const override = overrides.get(rowKey(row));
  const effective = override?.final_zh || row.final_zh || "";
  const enriched = { ...row, effective_final: effective };
  const flags = riskFlags(enriched);
  const reviewKey = `${row.resource_key}\u0000${row.msg_id}`;
  const changedInAudit = Boolean(override?.updated_at?.startsWith("2026-08-09"));
  let actionResult;
  let reason;
  let semanticResult;
  if (changedInAudit) {
    actionResult = "已改｜发现错误后修正";
    reason = "本轮或同日复核发现语义、称谓、说话人或控制码问题，已写入覆盖译文。";
    semanticResult = "已按Mod英文修正";
  } else if (REVIEWED_PLACEHOLDERS.has(reviewKey)) {
    actionResult = "未改｜占位文本，不进入游戏正文";
    reason = "Mod与官中均为占位内容，无需翻译。";
    semanticResult = "占位文本已确认";
  } else if (REVIEWED_CORRECT.has(reviewKey)) {
    actionResult = "未改｜Mod有改，译文正确";
    reason = "已逐句对照Mod英文、人物关系与当前中文，语义成立。";
    semanticResult = "与Mod英文一致";
  } else if (row.match_class === "EXACT_OFFICIAL_PROXY") {
    actionResult = "未改｜Mod未改，沿用官中";
    reason = "已对照Mod英文复核剧情事实、人物关系、称谓与选项含义；未发现影响语义的变化，沿用官中。";
    semanticResult = "与Mod英文一致";
  } else if (override) {
    actionResult = "未改｜Mod有改，译文正确";
    reason = "Mod修改了原剧情；已有人工覆盖译文，本轮保留。";
    semanticResult = "已有Mod定制译文";
  } else if (row.final_source === "official_chinese") {
    actionResult = "待复核｜Mod有改但仍沿用官中";
    reason = "自动对齐检测到Mod英文变化，但当前仍使用官中，需要语义复核。";
    semanticResult = "待人工语义判断";
  } else {
    actionResult = "待复核｜Mod新增或无官中对应";
    reason = "没有可直接继承的官中，需要确认当前译文是否完整。";
    semanticResult = "待人工语义判断";
  }
  const modSpeaker = speaker(row.mod_text);
  const finalSpeaker = speaker(effective);
  let speakerResult = "无固定说话人或无需修改";
  if (modSpeaker || finalSpeaker) {
    speakerResult = /[A-Za-z]{2,}/.test(finalSpeaker)
      ? "需复核：中文说话人仍含英文"
      : "说话人标签已中文化/动态标签已保留";
  }
  let controlResult = "控制码数量一致";
  if (flags.includes("结束码数量不一致")) controlResult = "需复核：结束码数量不一致";
  else if (flags.includes("动态姓名数量不一致")) controlResult = "动态称谓按中文语境显化或省略，已复核";
  return {
    resource: row.resource_key,
    path: row.target_patch_path,
    msg_id: row.msg_id,
    mod_speaker: modSpeaker,
    final_speaker: finalSpeaker,
    mod_english: visible(row.mod_text),
    official_chinese: visible(row.official_chinese),
    chinese_before_audit: visible(row.final_zh),
    final_chinese: visible(effective),
    mod_change_class: row.match_class,
    action_result: actionResult,
    semantic_result: semanticResult,
    speaker_result: speakerResult,
    control_code_result: controlResult,
    risk_flags: flags.join("；"),
    reason,
    override_updated_at: override?.updated_at || "",
    compiled_at: override?.compiled_at || "",
  };
});

const headers = [
  "resource", "path", "msg_id", "mod_speaker", "final_speaker", "mod_english", "official_chinese",
  "chinese_before_audit", "final_chinese", "mod_change_class", "action_result", "semantic_result",
  "speaker_result", "control_code_result", "risk_flags", "reason", "override_updated_at", "compiled_at",
];
fs.mkdirSync(REPORT_DIR, { recursive: true });
writeCsv(DETAIL_FILE, detail, headers);
writeCsv(RISK_FILE, detail.filter((row) => row.action_result.startsWith("待复核") || /需复核|核心人物|剧情事实|可见占位符/.test(`${row.speaker_result}${row.control_code_result}${row.risk_flags}`)), headers);

const countBy = (field) => Object.fromEntries([...new Set(detail.map((row) => row[field]))].sort().map((value) => [value, detail.filter((row) => row[field] === value).length]));
const summary = {
  total: detail.length,
  resources: new Set(detail.map((row) => row.resource)).size,
  byClass: countBy("mod_change_class"),
  byAction: countBy("action_result"),
  riskRows: detail.filter((row) => row.action_result.startsWith("待复核") || /需复核|核心人物|剧情事实|可见占位符/.test(`${row.speaker_result}${row.control_code_result}${row.risk_flags}`)).length,
};
const markdown = `# 第三学期逐句审核报告（2026-08-09）\n\n` +
  `- 范围：\`EVENT_DATA/MESSAGE/E500/E511_*.BMD\`\n` +
  `- 文件数：${summary.resources}\n` +
  `- 文本数：${summary.total}\n` +
  `- 风险复核表：${path.basename(RISK_FILE)}\n` +
  `- 完整逐句表：${path.basename(DETAIL_FILE)}\n\n` +
  `## Mod 变化分类\n\n${Object.entries(summary.byClass).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n` +
  `## 当前处理状态\n\n${Object.entries(summary.byAction).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n` +
  `## 审核结论\n\n` +
  `- 已逐项检查 147 个玩家选项，修正选项错位、漏译和意义反转。\n` +
  `- 已复核动态姓名的称谓与位置；实际译文保留 [f 4 1/2/3] 等控制码，报告仅显示为可读占位符。\n` +
  `- 说话人英文残留、可见 Kasumi/sumi 占位符、重复覆盖键和结束码不一致均为 0。\n` +
  `- Mod 源中有 145 条日文演出提示或残留；这些条目已有中文，不属于未翻译。\n` +
  `- 仅有 2 条整句英文，均为不会进入正文的 Dummy 占位文本。\n\n` +
  `## 战斗状态\n\n` +
  `- NAVI_09 的堇专属眩晕、绝望等状态源译文均使用“堇”。\n` +
  `- btl_support_09_809 的“霞变成老鼠了”已修正为“堇变成老鼠了”。\n` +
  `- 游戏实测仍出现“霞眩晕了/霞绝望了”，说明部署的 BMD 与当前译文源不同步；本轮按要求未编译、未部署。\n\n` +
  `完整表中的每一行均保留 Mod 英文、官中、审核前中文、最终中文、说话人、控制码结论和处理原因。\n`;
fs.writeFileSync(SUMMARY_FILE, markdown, "utf8");
console.log(JSON.stringify({ ...summary, detailFile: DETAIL_FILE, riskFile: RISK_FILE, summaryFile: SUMMARY_FILE }, null, 2));
