const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { spawn } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const TRANSLATION_ROOT = path.join(REPO_ROOT, "translations");
const CATEGORY_ROOT = path.join(TRANSLATION_ROOT, "catalog");
const REVIEW_FILES = [];
const OVERRIDE_FILE = path.join(TRANSLATION_ROOT, "overrides.csv");
const ORIGINAL_MOD_ROOT = path.resolve(process.env.ROSE_ORIGINAL_MOD || "F:/Reloaded-II/Mods/p5rpc.kasumi.roseandviolet");
const REFERENCE_MOD_ROOT = path.resolve(process.env.ROSE_REFERENCE_MOD || "F:/Rose/references/violet_mod_decompiled");
const FLOW_OVERRIDE_ROOT = path.join(REPO_ROOT, "references", "flow_overrides");
const BUILD_ROOT = process.env.ROSE_BUILD_ROOT
  ? path.resolve(process.env.ROSE_BUILD_ROOT)
  : path.join(REPO_ROOT, "build", "translation_patch");
const SOURCE_ROOT = path.join(BUILD_ROOT, "sources");
const OUTPUT_ROOT = path.join(BUILD_ROOT, "output");
const COMPILER = path.resolve(process.env.ROSE_COMPILER || "F:/Rose/AtlusScriptTools/AtlusScriptCompiler.exe");
const ENCODING = "P5R_CHS_ROSE";

function decodeCsvCell(raw) {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replaceAll('""', '"');
  }
  return raw;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cellStart = 0;
  let quoted = false;
  let i = 0;
  while (i <= text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        i += 2;
        continue;
      }
      if (ch === '"') quoted = false;
      i++;
      continue;
    }
    if (ch === '"' && i === cellStart) {
      quoted = true;
      i++;
      continue;
    }
    if (ch === ',' || ch === '\r' || ch === '\n' || i === text.length) {
      row.push(decodeCsvCell(text.slice(cellStart, i)));
      if (ch === ',') {
        i++;
        cellStart = i;
        continue;
      }
      rows.push(row);
      row = [];
      if (i === text.length) break;
      if (ch === '\r' && text[i + 1] === '\n') i += 2;
      else i++;
      cellStart = i;
      continue;
    }
    i++;
  }
  if (rows.length && rows.at(-1).length === 1 && rows.at(-1)[0] === "" && text.endsWith("\n")) {
    rows.pop();
  }
  const headers = rows.shift() || [];
  if (headers[0]) headers[0] = headers[0].replace(/^\ufeff/, "");
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function readCsv(file) {
  const bytes = fs.readFileSync(file);
  return parseCsv(file.endsWith(".gz") ? zlib.gunzipSync(bytes).toString("utf8") : bytes.toString("utf8"));
}

function resolveModPath(file) {
  if (file.startsWith("original://")) return path.join(ORIGINAL_MOD_ROOT, file.slice("original://".length));
  if (file.startsWith("reference://")) return path.join(REFERENCE_MOD_ROOT, file.slice("reference://".length));
  return file;
}

function reviewKey(row) {
  return [row.category, row.resource_key, row.msg_id].join("\u0000");
}

function hasHan(text) {
  return /[\u3400-\u9fff]/.test(text || "");
}

function isStructuralPlaceholder(text) {
  return /^(?:(?:dummy|ダミー)(?:\s+|$))+$/i.test(visibleText(text));
}

function isFullyEnglishVisible(text) {
  const visible = visibleText(text);
  return !isStructuralPlaceholder(text) && /[A-Za-z]{2,}/.test(visible) && !hasHan(visible);
}

function visibleText(block) {
  return (block || "")
    .replace(/^\[(?:msg|sel)\s+[^\r\n]+\]\s*/gm, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function selectedReviewText(row) {
  if (hasHan(visibleText(row.review_edit))) return { text: row.review_edit, source: "review_edit" };
  if (hasHan(visibleText(row.draft_final_zh))) return { text: row.draft_final_zh, source: "draft_final_zh" };
  if (hasHan(visibleText(row.suggested_final_zh))) return { text: row.suggested_final_zh, source: "suggested_final_zh" };
  return { text: "", source: "" };
}

function classifyResource(resourceKey, targetPath, modPath) {
  const key = (resourceKey || "").replaceAll("\\", "/");
  const target = (targetPath || "").replaceAll("\\", "/");
  if (/FEmulator\/BF\//i.test(target) && /\.msg$/i.test(target)) return "femulator_msg";
  if (/\.msg$/i.test(modPath || "") && fs.existsSync((modPath || "").replace(/\.msg$/i, ".BF"))) return "bf";
  if (/\.BMD(?:\.msg)?$/i.test(key) || /\.BMD(?:\.msg)?$/i.test(target)) return "bmd";
  if (/\.BF(?:\.msg)?$/i.test(key) || /\.BF(?:\.msg)?$/i.test(target)) return "bf";
  if (/\.msg$/i.test(target)) return "standalone_msg";
  if (/\.(TBL|FTD|PAK|BIN|CTD|MTD)$/i.test(key) || /\.(TBL|FTD|PAK|BIN|CTD|MTD)$/i.test(target)) return "container_or_table";
  return "other";
}

function normalizeNewlines(text) {
  return (text || "").replace(/\r?\n/g, "\r\n").trim();
}

function headerInfo(block) {
  const header = normalizeNewlines(block).split("\r\n", 1)[0];
  const match = header.match(/^\[(msg|sel)[ \t]+([^ \t\]\r\n]+)/);
  return match ? { kind: match[1], id: match[2], header } : null;
}

function trailingBracketExpression(header) {
  if (!header.endsWith("]")) return "";
  const withoutHeaderClose = header.slice(0, -1).trimEnd();
  if (!withoutHeaderClose.endsWith("]")) return "";
  let depth = 0;
  for (let index = withoutHeaderClose.length - 1; index >= 0; index--) {
    const char = withoutHeaderClose[index];
    if (char === "]") depth++;
    else if (char === "[") {
      depth--;
      if (depth === 0) return withoutHeaderClose.slice(index);
    }
  }
  return "";
}

function mergedHeader(modHeader, translatedHeader) {
  if (modHeader.kind === "sel") return modHeader.header;
  const modSpeakerExpression = trailingBracketExpression(modHeader.header);
  let speakerExpression = /^\[\[.*\]\]$/.test(modSpeakerExpression)
    ? modSpeakerExpression
    : normalizeSpeakerExpression(trailingBracketExpression(translatedHeader.header));
  return speakerExpression
    ? `[msg ${modHeader.id} ${speakerExpression}]`
    : `[msg ${modHeader.id}]`;
}

function normalizeSpeakerExpression(expression) {
  if (!expression) return expression;
  let content = expression.trim();
  while (content.startsWith("[") && content.endsWith("]")) {
    content = content.slice(1, -1).trim();
  }
  const normalized = content.replace(/[!-~]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0xfee0));
  return `[${normalized}]`;
}

function normalizeVisiblePunctuation(body) {
  const replacements = new Map([
    ["!", "！"], ["?", "？"], [",", "，"], [":", "："], [";", "；"],
    ["(", "（"], [")", "）"], ["/", "／"], ["%", "％"], ["+", "＋"], ["=", "＝"],
    ["-", "－"], ["'", "＇"], ['"', "＂"],
  ]);
  const escaped = [];
  const protectedBody = body
    .replaceAll("\\[", "［")
    .replaceAll("\\]", "］")
    .replace(/\\\\/g, (value) => {
    escaped.push(value);
    return "\ue000";
  });
  const normalizedBody = protectedBody.split(/(\[[^\]]*\])/g).map((part) => {
    if (part.startsWith("[") && part.endsWith("]")) return part;
    return part
      .replace(/\.{3,}/g, "……")
      .replace(/\.{1,2}/g, "。")
      .replace(/[A-Za-z]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0))
      .replace(/[0-9]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0))
      .replaceAll("_", "＿")
      .replaceAll("·", "・")
      .replace(/[\u201c\u2018]/g, "「")
      .replace(/[\u201d\u2019]/g, "」")
      .replace(/\u2014/g, "－")
      .replace(/\u007f/g, "")
      .replaceAll("霊", "灵")
      .replaceAll("発", "发")
      .replaceAll("祐", "佑")
      .replaceAll("狛犬", "守护犬")
      .replaceAll("天目一箇", "天目一目")
      .replaceAll("誰", "谁")
      .replaceAll("態", "态")
      .replaceAll("現", "现")
      .replaceAll("気", "气")
      .replaceAll("導", "导")
      .replace(/[!?,:;()\/%+=\-'\"]/g, (char) => replacements.get(char) || char);
  }).join("");
  return normalizedBody.replace(/\ue000/g, () => escaped.shift() || "");
}

function parseMessageBlocks(text) {
  const source = normalizeNewlines((text || "").replace(/^\ufeff/, ""));
  const starts = [...source.matchAll(/^\[(?:msg|sel)[ \t]+/gm)].map((match) => match.index);
  return starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length).trim());
}

function messageKey(info) {
  return info ? `${info.kind}\u0000${info.id}` : "";
}

function completeMergedBlocks(group) {
  const replacements = new Map();
  const speakerTranslations = new Map();
  const fallbackBlocks = [];
  for (const entry of group.entries) {
    const merged = mergeTranslationIntoModBlock(entry.modText, entry.selectedText);
    if (!merged.ok) return { ok: false, reason: `${entry.msgId}:${merged.reason}`, blocks: [] };
    const info = headerInfo(entry.modText);
    const key = messageKey(info);
    if (!replacements.has(key)) replacements.set(key, []);
    replacements.get(key).push(merged.text);
    fallbackBlocks.push(merged.text);

    const modInfo = headerInfo(entry.modText);
    const translatedInfo = headerInfo(entry.selectedText);
    const modSpeaker = modInfo ? trailingBracketExpression(modInfo.header) : "";
    const translatedSpeaker = translatedInfo ? trailingBracketExpression(translatedInfo.header) : "";
    if (modSpeaker && translatedSpeaker) {
      speakerTranslations.set(modSpeaker, normalizeSpeakerExpression(translatedSpeaker));
    }
  }

  if (!fs.existsSync(group.modPath)) return { ok: true, reason: "", blocks: fallbackBlocks };
  const originalBlocks = parseMessageBlocks(fs.readFileSync(group.modPath, "utf8"));
  if (!originalBlocks.length) return { ok: true, reason: "", blocks: fallbackBlocks };

  const blocks = [];
  for (const originalBlock of originalBlocks) {
    const info = headerInfo(originalBlock);
    const queue = replacements.get(messageKey(info));
    if (queue && queue.length) {
      blocks.push(queue.shift());
      continue;
    }
    const firstLineEnd = originalBlock.indexOf("\r\n");
    let body = firstLineEnd >= 0 ? originalBlock.slice(firstLineEnd + 2) : "";
    if (!isStructuralPlaceholder(body) && /[A-Za-z]/.test(visibleText(body))) {
      return { ok: false, reason: `${info?.id || "unknown"}:untranslated_preserved_block`, blocks: [] };
    }
    body = normalizeVisiblePunctuation(body);
    if (info?.kind === "sel") {
      blocks.push(`${info.header}\r\n${body}`.trim());
      continue;
    }
    const originalSpeaker = info ? trailingBracketExpression(info.header) : "";
    const translatedSpeaker = speakerTranslations.get(originalSpeaker) || "";
    const header = translatedSpeaker
      ? `[msg ${info.id} ${translatedSpeaker}]`
      : `[msg ${info.id}]`;
    blocks.push(`${header}\r\n${body}`.trim());
  }
  for (const queue of replacements.values()) blocks.push(...queue);
  return { ok: true, reason: "", blocks };
}

function controlQueues(block) {
  const queues = new Map();
  const body = normalizeNewlines(block).replace(/^\[(?:msg|sel)[^\r\n]*\]\r?\n?/, "");
  const pattern = /\[([A-Za-z]+)(?:[ \t][^\]]*)?\]/g;
  for (const match of body.matchAll(pattern)) {
    const command = match[1].toLowerCase();
    if (command === "n") continue;
    if (!queues.has(command)) queues.set(command, []);
    queues.get(command).push(match[0]);
  }
  return queues;
}

function mergeTranslationIntoModBlock(modBlock, translatedBlock) {
  const modHeader = headerInfo(modBlock);
  const translatedHeader = headerInfo(translatedBlock);
  if (!modHeader || !translatedHeader || modHeader.kind !== translatedHeader.kind) {
    return { ok: false, reason: "header_parse_or_kind_mismatch", text: "" };
  }
  const queues = controlQueues(modBlock);
  let merged = normalizeNewlines(translatedBlock);
  const headerEnd = merged.indexOf("\r\n");
  const header = mergedHeader(modHeader, translatedHeader);
  let body = headerEnd >= 0 ? merged.slice(headerEnd + 2) : "";
  body = body.replace(/\[([A-Za-z]+)(?:[ \t][^\]]*)?\]/g, (tag, rawCommand) => {
    const command = rawCommand.toLowerCase();
    if (command === "n") return tag;
    const queue = queues.get(command);
    if (!queue || !queue.length) return tag;
    const exactIndex = queue.indexOf(tag);
    if (exactIndex >= 0) {
      queue.splice(exactIndex, 1);
      return tag;
    }
    return queue.shift();
  });
  body = normalizeVisiblePunctuation(body);
  return { ok: true, reason: "", text: `${header}\r\n${body}`.trim() };
}

function relativeOutputPaths(group) {
  const modPath = path.resolve(group.modPath);
  let relative;
  if (modPath.toLowerCase().startsWith(ORIGINAL_MOD_ROOT.toLowerCase() + path.sep)) {
    relative = path.relative(ORIGINAL_MOD_ROOT, modPath);
  } else if (modPath.toLowerCase().startsWith(REFERENCE_MOD_ROOT.toLowerCase() + path.sep)) {
    relative = path.relative(REFERENCE_MOD_ROOT, modPath);
  } else {
    return null;
  }

  if (group.type === "bmd") {
    const msgRelative = relative.toLowerCase().endsWith(".msg") ? relative : `${relative}.msg`;
    return { binaryRelative: msgRelative.replace(/\.msg$/i, ""), msgRelative };
  }
  if (group.type === "bf") {
    return { binaryRelative: relative.replace(/\.msg$/i, ".BF"), msgRelative: relative.replace(/\.BF$/i, ".msg") };
  }
  return { binaryRelative: "", msgRelative: relative };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function compileProcess(input, outFormat, workId) {
  return new Promise((resolve) => {
    const args = [input, "-Compile", "-Library", "p5r", "-Encoding", ENCODING, "-OutFormat", outFormat];
    const cwd = path.join(BUILD_ROOT, "compiler_logs", String(workId));
    fs.mkdirSync(cwd, { recursive: true });
    const child = spawn(COMPILER, args, { cwd, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", (error) => resolve({ code: -1, output: error.message }));
    child.on("close", (code) => {
      const decoded = output.replaceAll("\u0000", "");
      const unsupported = decoded.match(/Encoding .* does not support character:[^\r\n]*/i)?.[0];
      resolve({ code: code ?? -1, output: unsupported || decoded.slice(-4000) });
    });
  });
}

function sanitizeDecompiledFlow(source) {
  const numericProcedures = [...source.matchAll(/\bvoid\s+``(\d+)``\s*\(/g)].map((match) => match[1]);
  let sanitized = source;
  for (const numericName of new Set(numericProcedures)) {
    const replacement = `proc_numeric_${numericName}`;
    sanitized = sanitized.replace(
      new RegExp(`\\bvoid\\s+\`\`${numericName}\`\`\\s*\\(`, "g"),
      `void ${replacement}(`,
    );
    sanitized = sanitized.replace(
      new RegExp(`(?<![A-Za-z0-9_\`])${numericName}\\s*\\(`, "g"),
      `${replacement}(`,
    );
  }
  return sanitized;
}

async function runWithConcurrency(tasks, worker, concurrency) {
  const results = new Array(tasks.length);
  let next = 0;
  let completed = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= tasks.length) return;
      results[index] = await worker(tasks[index], index);
      completed++;
      if (completed % 100 === 0 || completed === tasks.length) {
        console.error(`compile_progress=${completed}/${tasks.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, run));
  return results;
}

function buildSourceFiles(resourceGroups) {
  const allowAscii = process.argv.includes("--allow-ascii");
  fs.rmSync(BUILD_ROOT, { recursive: true, force: true });
  fs.mkdirSync(SOURCE_ROOT, { recursive: true });
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const tasks = [];
  const records = [];

  for (const group of resourceGroups.values()) {
    const record = {
      resourceKey: group.resourceKey,
      type: group.type,
      messages: group.messages,
      asciiMessages: group.asciiMessages,
      status: "",
      reason: "",
      outputs: [],
    };
    records.push(record);

    if (group.asciiMessages > 0 && !allowAscii) {
      record.status = "skipped_untranslated_ascii";
      record.reason = `${group.asciiMessages} message blocks still contain ASCII text`;
      continue;
    }
    if (!group.entries.length) {
      record.status = "skipped_no_entries";
      continue;
    }

    const paths = relativeOutputPaths(group);
    if (!paths) {
      record.status = "failed_path_mapping";
      record.reason = group.modPath;
      continue;
    }
    const completed = completeMergedBlocks(group);
    if (!completed.ok) {
      record.status = "failed_message_merge";
      record.reason = completed.reason;
      continue;
    }

    const msgPath = path.join(SOURCE_ROOT, paths.msgRelative);
    fs.mkdirSync(path.dirname(msgPath), { recursive: true });
    fs.writeFileSync(msgPath, `\ufeff${completed.blocks.join("\r\n\r\n")}\r\n`, "utf8");

    if (group.type === "femulator_msg" || group.type === "standalone_msg") {
      const output = path.join(OUTPUT_ROOT, paths.msgRelative);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.copyFileSync(msgPath, output);
      record.status = "ready_msg_overlay";
      record.outputs.push(paths.msgRelative);
      continue;
    }

    if (group.type === "bmd") {
      tasks.push({ group, record, input: msgPath, outFormat: "V1BE", expected: `${msgPath}.bmd`, paths });
      record.status = "pending_compile";
      continue;
    }

    if (group.type === "bf") {
      const defaultFlowSource = group.modPath.replace(/\.msg$/i, ".BF");
      const overrideFlowSource = path.join(FLOW_OVERRIDE_ROOT, `${group.resourceKey}.flow`);
      const flowSource = fs.existsSync(overrideFlowSource) ? overrideFlowSource : defaultFlowSource;
      if (!fs.existsSync(flowSource)) {
        record.status = "failed_missing_flow";
        record.reason = flowSource;
        continue;
      }
      const flowPath = msgPath.replace(/\.msg$/i, ".flow");
      const flowText = fs.readFileSync(flowSource, "utf8").replace(
        /import\("[^"]+\.msg"\);/,
        `import("${path.basename(msgPath)}");`,
      );
      fs.writeFileSync(flowPath, sanitizeDecompiledFlow(flowText), "utf8");
      tasks.push({ group, record, input: flowPath, outFormat: "V3BE", expected: `${flowPath}.bf`, paths });
      record.status = "pending_compile";
      continue;
    }

    record.status = "skipped_unsupported_type";
  }
  return { tasks, records };
}

async function compileTasks(tasks, limit) {
  const selected = limit > 0 ? tasks.slice(0, limit) : tasks;
  const results = await runWithConcurrency(selected, async (task, index) => {
    const result = await compileProcess(task.input, task.outFormat, index);
    if (result.code !== 0 || !fs.existsSync(task.expected)) {
      task.record.status = "compile_failed";
      task.record.reason = result.output || `exit=${result.code}`;
      return task.record;
    }
    const binaryOutput = path.join(OUTPUT_ROOT, task.paths.binaryRelative);
    fs.mkdirSync(path.dirname(binaryOutput), { recursive: true });
    fs.copyFileSync(task.expected, binaryOutput);
    task.record.outputs.push(task.paths.binaryRelative);
    if (task.group.type === "bmd") {
      const msgOutput = path.join(OUTPUT_ROOT, task.paths.msgRelative);
      fs.mkdirSync(path.dirname(msgOutput), { recursive: true });
      fs.copyFileSync(task.input, msgOutput);
      task.record.outputs.push(task.paths.msgRelative);
    }
    task.record.status = "compiled";
    task.record.reason = "";
    return task.record;
  }, 6);
  if (limit > 0) {
    for (const task of tasks.slice(limit)) {
      task.record.status = "not_run_limit";
      task.record.reason = `compile limit ${limit}`;
    }
  }
  return results;
}

function writeBuildReport(records) {
  const statuses = new Map();
  for (const record of records) increment(statuses, record.status);
  const report = {
    generatedAt: new Date().toISOString(),
    outputRoot: OUTPUT_ROOT,
    statuses: Object.fromEntries([...statuses].sort()),
    outputFiles: fs.existsSync(OUTPUT_ROOT)
      ? fs.readdirSync(OUTPUT_ROOT, { recursive: true }).filter((item) => fs.statSync(path.join(OUTPUT_ROOT, item)).isFile()).length
      : 0,
    failures: records.filter((record) => /failed|unsupported/.test(record.status)),
    skippedAscii: records.filter((record) => record.status === "skipped_untranslated_ascii"),
  };
  writeJson(path.join(BUILD_ROOT, "build_report.json"), report);
  writeJson(path.join(BUILD_ROOT, "resource_status.json"), records);
  return report;
}

function increment(map, key, amount = 1) {
  map.set(key || "(empty)", (map.get(key || "(empty)") || 0) + amount);
}

async function main() {
  const reviews = new Map();
  const reviewStats = new Map();
  for (const file of REVIEW_FILES) {
    for (const row of readCsv(file)) {
      const selected = selectedReviewText(row);
      reviews.set(reviewKey(row), { ...selected, decision: row.review_decision || "" });
      increment(reviewStats, `decision:${row.review_decision || "blank"}`);
      increment(reviewStats, `selected:${selected.source || "none"}`);
    }
  }
  const overrides = new Map();
  if (fs.existsSync(OVERRIDE_FILE)) {
    for (const row of readCsv(OVERRIDE_FILE)) {
      if (row.final_zh) overrides.set(reviewKey(row), row.final_zh);
    }
  }

  const resourceGroups = new Map();
  const matchClasses = new Map();
  const finalSources = new Map();
  let rows = 0;
  let rowsWithMod = 0;
  let rowsWithFinal = 0;
  let reviewOverlays = 0;
  let unresolvedEnglish = 0;

  for (const file of fs.readdirSync(CATEGORY_ROOT).filter((name) => name.endsWith(".csv.gz")).sort()) {
    for (const row of readCsv(path.join(CATEGORY_ROOT, file))) {
      rows++;
      increment(matchClasses, row.match_class);
      increment(finalSources, row.final_source);
      if (!row.mod_path || !visibleText(row.mod_text || row.mod_english)) continue;
      rowsWithMod++;
      const resolvedModPath = resolveModPath(row.mod_path);

      const key = reviewKey(row);
      const override = overrides.get(key);
      const review = reviews.get(key);
      const selected = override
        ? { text: override, source: "translation_override", decision: "" }
        : review && review.text
          ? review
          : { text: row.final_zh || "", source: "category_final_zh", decision: "" };
      if (review && review.text) reviewOverlays++;
      if (visibleText(selected.text)) rowsWithFinal++;
      if (isFullyEnglishVisible(selected.text)) unresolvedEnglish++;

      const resourceKey = row.resource_key || row.mod_path;
      if (!resourceGroups.has(resourceKey)) {
        resourceGroups.set(resourceKey, {
          resourceKey,
          targetPath: row.target_patch_path || "",
          modPath: resolvedModPath,
          category: row.category || path.basename(file, ".csv"),
          type: classifyResource(resourceKey, row.target_patch_path, resolvedModPath),
          messages: 0,
          translated: 0,
          reviewOverlay: 0,
          asciiMessages: 0,
          hanMessages: 0,
          entries: [],
        });
      }
      const group = resourceGroups.get(resourceKey);
      group.messages++;
      if (visibleText(selected.text)) group.translated++;
      if (isFullyEnglishVisible(selected.text)) group.asciiMessages++;
      if (hasHan(visibleText(selected.text))) group.hanMessages++;
      if (review && review.text) group.reviewOverlay++;
      if (!group.targetPath && row.target_patch_path) group.targetPath = row.target_patch_path;
      if (!group.modPath && row.mod_path) group.modPath = resolvedModPath;
      group.entries.push({
        msgId: row.msg_id,
        modText: row.mod_text || row.mod_english,
        selectedText: selected.text,
        selectedSource: selected.source,
      });
    }
  }

  const resourceTypes = new Map();
  for (const group of resourceGroups.values()) increment(resourceTypes, group.type);
  const deployableResources = [...resourceGroups.values()].filter(
    (group) => group.asciiMessages === 0 && group.translated === group.messages,
  );
  const report = {
    reviewRows: reviews.size,
    reviewStats: Object.fromEntries([...reviewStats].sort()),
    categoryRows: rows,
    rowsWithMod,
    rowsWithFinal,
    reviewOverlays,
    unresolvedEnglish,
    uniqueModResources: resourceGroups.size,
    deployableResources: deployableResources.length,
    resourcesWithAsciiVisibleText: resourceGroups.size - deployableResources.length,
    resourceTypes: Object.fromEntries([...resourceTypes].sort()),
    matchClasses: Object.fromEntries([...matchClasses].sort()),
    finalSources: Object.fromEntries([...finalSources].sort()),
    incompleteResources: [...resourceGroups.values()].filter((group) => group.translated < group.messages).slice(0, 100).map(({ entries, ...group }) => group),
    asciiResourceSamples: [...resourceGroups.values()].filter((group) => group.asciiMessages > 0).slice(0, 50).map(({ entries, ...group }) => group),
    sampleResources: [...resourceGroups.values()].slice(0, 25).map(({ entries, ...group }) => group),
  };
  if (!process.argv.includes("--build")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const resourceListArg = process.argv.find((arg) => arg.startsWith("--resource-list="));
  let selectedResourceGroups = resourceGroups;
  if (resourceListArg) {
    const resourceListPath = path.resolve(resourceListArg.slice("--resource-list=".length));
    const selectedKeys = new Set(fs.readFileSync(resourceListPath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    selectedResourceGroups = new Map([...resourceGroups].filter(([key]) => selectedKeys.has(key)));
  }
  const { tasks, records } = buildSourceFiles(selectedResourceGroups);
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) || 0 : 0;
  await compileTasks(tasks, limit);
  const buildReport = writeBuildReport(records);
  console.log(JSON.stringify({
    audit: {
      reviewRows: report.reviewRows,
      categoryRows: report.categoryRows,
      uniqueModResources: report.uniqueModResources,
      deployableResources: report.deployableResources,
      resourcesWithAsciiVisibleText: report.resourcesWithAsciiVisibleText,
      resourceTypes: report.resourceTypes,
    },
    build: {
      generatedAt: buildReport.generatedAt,
      outputRoot: buildReport.outputRoot,
      statuses: buildReport.statuses,
      outputFiles: buildReport.outputFiles,
      failures: buildReport.failures.length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
