const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC = path.join(__dirname, "public");
const MODE = process.env.ROSE_MANAGER_MODE === "reviewer" ? "reviewer" : "main";
const TRANSLATION_ROOT = process.env.ROSE_MANAGER_DATA_ROOT || path.join(ROOT, "translations");
const CATEGORY_ROOT = path.join(TRANSLATION_ROOT, "catalog");
const OVERRIDE_FILE = path.join(TRANSLATION_ROOT, "overrides.csv");
const REVIEW_SESSION_FILE = path.join(TRANSLATION_ROOT, "reviewer_session.json");
const SNAPSHOT_FILE = path.join(TRANSLATION_ROOT, "review_snapshot.json");
const STATUS_FILE = path.join(TRANSLATION_ROOT, "resource_status.json");
const BUILD_SCRIPT = path.join(ROOT, "scripts", "build_translation_patch.js");
const MAIN_BUILD = path.join(ROOT, "build", "translation_patch");
const MANAGER_BUILD = path.join(ROOT, "build", "translation_manager");
const ORIGINAL_MOD = process.env.ROSE_ORIGINAL_MOD || "F:/Reloaded-II/Mods/p5rpc.kasumi.roseandviolet";
const INSTALLED_MOD = process.env.ROSE_INSTALLED_MOD || "F:/Reloaded-II/Mods/p5rpc.kasumi.roseandviolet.zh-hans";
const CACHE = process.env.ROSE_CACHE || "F:/Reloaded-II/Mods/p5rpc.modloader/Cache/P5R_zh-Hans";
const PORT = Number(process.env.ROSE_MANAGER_PORT || 4178);

function decodeCsvCell(raw) {
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1).replaceAll('""', '"');
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
      if (ch === '"' && text[i + 1] === '"') { i += 2; continue; }
      if (ch === '"') quoted = false;
      i++;
      continue;
    }
    if (ch === '"' && i === cellStart) { quoted = true; i++; continue; }
    if (ch === "," || ch === "\r" || ch === "\n" || i === text.length) {
      row.push(decodeCsvCell(text.slice(cellStart, i)));
      if (ch === ",") { i++; cellStart = i; continue; }
      rows.push(row);
      row = [];
      if (i === text.length) break;
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      cellStart = i;
      continue;
    }
    i++;
  }
  if (rows.length && rows.at(-1).every((cell) => !cell)) rows.pop();
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

function rowKey(row) {
  return [row.category, row.resourceKey || row.resource_key, row.msgId || row.msg_id].join("\u0000");
}

function visibleText(block) {
  return String(block || "")
    .replace(/^\[(?:msg|sel)\s+[^\r\n]+\]\s*/m, "")
    .replace(/\[f 4 1\]/g, "〔动态姓氏〕")
    .replace(/\[f 4 2\]/g, "〔动态名字〕")
    .replace(/\[f 4 3\]/g, "〔动态全名〕")
    .replace(/\[n\]/g, "\n")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function isFullyEnglishVisible(text) {
  return /[A-Za-z]{2,}/.test(text || "") && !/[\u3400-\u9fff]/.test(text || "");
}

function speakerOf(block) {
  const header = String(block || "").split(/\r?\n/, 1)[0];
  const match = header.match(/\[([^\[\]]+)\]\]$/);
  return match ? match[1] : "";
}

function headerOf(block) {
  return String(block || "").split(/\r?\n/, 1)[0].trim();
}

function loadStatusMap() {
  const map = new Map();
  if (!fs.existsSync(STATUS_FILE)) return map;
  for (const row of JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"))) map.set(row.resourceKey, row.status);
  return map;
}

function loadOverrides(file = OVERRIDE_FILE) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const row of parseCsv(fs.readFileSync(file, "utf8"))) map.set(rowKey(row), row);
  return map;
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function saveJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\r\n`, "utf8");
  fs.renameSync(temp, file);
}

function saveOverrides() {
  const headers = ["category", "resource_key", "msg_id", "final_zh", "updated_at", "compiled_at", "reviewed_at", "ai_reviewed_at", "high_risk_at"];
  const lines = [headers, ...[...overrides.values()].sort((a, b) => rowKey(a).localeCompare(rowKey(b))).map((row) => [
    row.category, row.resource_key, row.msg_id, row.final_zh, row.updated_at, row.compiled_at || "", row.reviewed_at || "",
    row.ai_reviewed_at || "", row.high_risk_at || "",
  ])].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const temp = `${OVERRIDE_FILE}.tmp`;
  fs.writeFileSync(temp, `\ufeff${lines}`, "utf8");
  fs.renameSync(temp, OVERRIDE_FILE);
}

let resourceStatuses = loadStatusMap();
const baseOverrides = loadOverrides();
const reviewSession = MODE === "reviewer" ? loadJson(REVIEW_SESSION_FILE, { reviewer: "", changes: [] }) : { reviewer: "", changes: [] };
const reviewChanges = new Map((reviewSession.changes || []).map((row) => [rowKey(row), row]));
const overrides = MODE === "reviewer" ? new Map(baseOverrides) : baseOverrides;
if (MODE === "reviewer") {
  for (const change of reviewChanges.values()) {
    overrides.set(rowKey(change), {
      category: change.category,
      resource_key: change.resource_key,
      msg_id: change.msg_id,
      final_zh: change.final_zh,
      updated_at: change.updated_at || "",
      compiled_at: change.base_compiled_at || "",
      reviewed_at: change.reviewed_at || "",
      ai_reviewed_at: change.ai_reviewed_at || "",
      high_risk_at: change.high_risk_at || "",
    });
  }
}
const rows = [];
const rowsById = new Map();
const rowsByKey = new Map();
const categories = new Map();

for (const name of fs.readdirSync(CATEGORY_ROOT).filter((file) => file.endsWith(".csv.gz")).sort()) {
  const categoryName = name.replace(/\.csv\.gz$/, "");
  const csv = zlib.gunzipSync(fs.readFileSync(path.join(CATEGORY_ROOT, name))).toString("utf8");
  for (const source of parseCsv(csv)) {
    if (!source.mod_path || !source.resource_key) continue;
    const category = source.category || categoryName;
    const key = [category, source.resource_key, source.msg_id].join("\u0000");
    const override = overrides.get(key);
    const baseOverride = baseOverrides.get(key);
    const finalZh = override?.final_zh || source.final_zh || "";
    const id = rows.length;
    const row = {
      id,
      category,
      resourceKey: source.resource_key,
      msgId: source.msg_id,
      speaker: speakerOf(finalZh || source.mod_text),
      modHeader: headerOf(source.mod_text || source.mod_english),
      modEnglish: visibleText(source.mod_text || source.mod_english),
      officialChinese: visibleText(source.official_chinese),
      finalChinese: visibleText(finalZh),
      finalRaw: finalZh,
      targetPath: source.target_patch_path || "",
      modPath: source.mod_path,
      matchClass: source.match_class || "",
      hasOverride: Boolean(override),
      dirty: Boolean(override && !override.compiled_at),
      reviewed: Boolean(override?.reviewed_at),
      aiReviewed: !override?.reviewed_at && Boolean(override?.ai_reviewed_at),
      highRisk: !override?.reviewed_at && Boolean(override?.high_risk_at),
      baseFinalRaw: baseOverride?.final_zh || source.final_zh || "",
      baseUpdatedAt: baseOverride?.updated_at || "",
      baseCompiledAt: baseOverride?.compiled_at || "",
      baseReviewedAt: baseOverride?.reviewed_at || "",
      baseAIReviewedAt: baseOverride?.ai_reviewed_at || "",
      baseHighRiskAt: baseOverride?.high_risk_at || "",
    };
    rows.push(row);
    rowsById.set(id, row);
    rowsByKey.set(key, row);
    categories.set(category, (categories.get(category) || 0) + 1);
  }
}

function saveReviewSession() {
  const value = {
    format: "rose-review-session",
    version: 1,
    reviewer: reviewSession.reviewer || "",
    updated_at: new Date().toISOString(),
    changes: [...reviewChanges.values()].sort((a, b) => rowKey(a).localeCompare(rowKey(b))),
  };
  saveJsonAtomic(REVIEW_SESSION_FILE, value);
}

function reviewerRecord(row, finalRaw, reviewedAt, updatedAt = new Date().toISOString()) {
  return {
    category: row.category,
    resource_key: row.resourceKey,
    msg_id: row.msgId,
    base_final_zh: row.baseFinalRaw,
    base_updated_at: row.baseUpdatedAt,
    base_compiled_at: row.baseCompiledAt,
    base_reviewed_at: row.baseReviewedAt,
    base_ai_reviewed_at: row.baseAIReviewedAt,
    base_high_risk_at: row.baseHighRiskAt,
    final_zh: finalRaw,
    updated_at: updatedAt,
    reviewed_at: reviewedAt || "",
    ai_reviewed_at: "",
    high_risk_at: "",
  };
}

function statusOf(row) {
  if (row.reviewed) return "reviewed";
  if (row.highRisk) return "high_risk";
  if (row.aiReviewed) return "ai_reviewed";
  if (row.dirty) return "edited";
  const resourceStatus = resourceStatuses.get(row.resourceKey) || "compiled";
  if (resourceStatus === "skipped_untranslated_ascii" && !isFullyEnglishVisible(row.finalChinese)) {
    return "blocked_by_resource_english";
  }
  return resourceStatus;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function sendDownloadJson(res, filename, value) {
  const body = `${JSON.stringify(value, null, 2)}\r\n`;
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function encodedUpdateFile(relativePath, buffer, compress = false) {
  const payload = compress ? zlib.gzipSync(buffer, { level: 9 }) : buffer;
  return {
    path: relativePath.replaceAll("\\", "/"),
    encoding: compress ? "gzip-base64" : "base64",
    size: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    data: payload.toString("base64"),
  };
}

function decodeUpdateFile(entry) {
  if (!entry || typeof entry.path !== "string" || typeof entry.data !== "string") throw new Error("主库更新包包含无效文件");
  const encoded = Buffer.from(entry.data, "base64");
  const buffer = entry.encoding === "gzip-base64" ? zlib.gunzipSync(encoded) : encoded;
  if (entry.encoding !== "base64" && entry.encoding !== "gzip-base64") throw new Error(`不支持的更新包编码：${entry.encoding}`);
  if (Number(entry.size) !== buffer.length) throw new Error(`更新包文件大小校验失败：${entry.path}`);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  if (hash !== entry.sha256) throw new Error(`更新包文件校验失败：${entry.path}`);
  return buffer;
}

function createMasterUpdatePack() {
  const files = [];
  for (const name of fs.readdirSync(CATEGORY_ROOT).filter((file) => file.endsWith(".csv.gz")).sort()) {
    files.push(encodedUpdateFile(`catalog/${name}`, fs.readFileSync(path.join(CATEGORY_ROOT, name))));
  }
  files.push(encodedUpdateFile("overrides.csv", fs.readFileSync(OVERRIDE_FILE), true));
  if (fs.existsSync(STATUS_FILE)) files.push(encodedUpdateFile("resource_status.json", fs.readFileSync(STATUS_FILE), true));
  const indexRows = [["category", "resource_key", "msg_id", "final_zh", "updated_at", "compiled_at", "reviewed_at", "ai_reviewed_at", "high_risk_at"]];
  for (const row of rows) {
    const record = overrides.get(rowKey(row));
    indexRows.push([
      row.category, row.resourceKey, row.msgId, row.finalRaw,
      record?.updated_at || row.baseUpdatedAt || "",
      record?.compiled_at || row.baseCompiledAt || "",
      record?.reviewed_at || row.baseReviewedAt || "",
      record?.ai_reviewed_at || row.baseAIReviewedAt || "",
      record?.high_risk_at || row.baseHighRiskAt || "",
    ]);
  }
  const indexCsv = Buffer.from(indexRows.map((values) => values.map(csvCell).join(",")).join("\r\n") + "\r\n", "utf8");
  files.push(encodedUpdateFile("master_index.csv", indexCsv, true));
  return { format: "rose-master-update", version: 1, generated_at: new Date().toISOString(), files };
}

function validateMasterUpdatePack(pack) {
  if (!pack || pack.format !== "rose-master-update" || pack.version !== 1 || !Array.isArray(pack.files)) return false;
  const paths = new Set(pack.files.map((entry) => entry?.path));
  return paths.has("overrides.csv") && paths.has("master_index.csv") && [...paths].some((name) => /^catalog\/[^/]+\.csv\.gz$/.test(name));
}

function unpackMasterUpdate(pack) {
  if (!validateMasterUpdatePack(pack)) throw new Error("不是有效的 Rose 主库更新包");
  const allowed = /^(?:overrides\.csv|resource_status\.json|master_index\.csv|catalog\/[^/]+\.csv\.gz)$/;
  const files = new Map();
  for (const entry of pack.files) {
    if (!allowed.test(entry.path) || files.has(entry.path)) throw new Error(`更新包路径无效或重复：${entry.path}`);
    files.set(entry.path, decodeUpdateFile(entry));
  }
  return files;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 128 * 1024 * 1024) { reject(new Error("Request body too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function runBuild(resourceKeys) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.join(__dirname, "runtime"), { recursive: true });
    const listFile = path.join(__dirname, "runtime", "resource-list.txt");
    fs.writeFileSync(listFile, `${resourceKeys.join("\r\n")}\r\n`, "utf8");
    const args = [BUILD_SCRIPT, "--build", `--resource-list=${listFile}`];
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      windowsHide: true,
      env: { ...process.env, ROSE_BUILD_ROOT: MANAGER_BUILD },
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(output.slice(-5000) || `Build exited ${code}`)));
  });
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file); else files.push(file);
    }
  };
  visit(root);
  return files;
}

function deployManagerBuild() {
  const output = path.join(MANAGER_BUILD, "output");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(MANAGER_BUILD, "backups", stamp);
  let deployed = 0;
  let skipped = 0;
  for (const file of walk(output)) {
    const relative = path.relative(output, file);
    if (!fs.existsSync(path.join(ORIGINAL_MOD, relative))) { skipped++; continue; }
    for (const [label, root] of [["workspace", ROOT], ["installed", INSTALLED_MOD]]) {
      const destination = path.join(root, relative);
      if (fs.existsSync(destination)) {
        const backupFile = path.join(backup, label, relative);
        fs.mkdirSync(path.dirname(backupFile), { recursive: true });
        fs.copyFileSync(destination, backupFile);
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(file, destination);
    }
    deployed++;
  }
  let cacheBackup = "";
  if (fs.existsSync(CACHE)) {
    cacheBackup = `${CACHE}.before_manager_${stamp}`;
    fs.renameSync(CACHE, cacheBackup);
  }
  return { deployed, skippedNoOriginalCounterpart: skipped, backup, cacheBackup };
}

function publicRow(row) {
  return { ...row, status: statusOf(row), finalRaw: undefined, baseFinalRaw: undefined };
}

function updateRowFromRecord(row, record) {
  row.finalRaw = record.final_zh;
  row.finalChinese = visibleText(record.final_zh);
  row.speaker = speakerOf(record.final_zh);
  row.hasOverride = true;
  row.dirty = !record.compiled_at;
  row.reviewed = Boolean(record.reviewed_at);
  row.aiReviewed = !row.reviewed && Boolean(record.ai_reviewed_at);
  row.highRisk = !row.reviewed && Boolean(record.high_risk_at);
}

function isUnreviewed(row) {
  return !row.reviewed && !row.aiReviewed && !row.highRisk;
}

function validateReviewPatch(patch) {
  return patch && patch.format === "rose-review-patch" && patch.version === 1 && Array.isArray(patch.changes);
}

function reviewChangeKey(change) {
  return rowKey(change);
}

function reviewDecisionKey(key) {
  return Buffer.from(key, "utf8").toString("base64url");
}

function previewReviewPatch(patch) {
  const items = [];
  for (const change of patch.changes) {
    const key = reviewChangeKey(change);
    const decisionKey = reviewDecisionKey(key);
    const row = rowsByKey.get(key);
    if (!row) {
      items.push({ decisionKey, state: "missing", category: change.category, resourceKey: change.resource_key, msgId: change.msg_id });
      continue;
    }
    const localFinal = row.finalRaw;
    const testerFinal = String(change.final_zh ?? "");
    const baseFinal = String(change.base_final_zh ?? "");
    const sameFinal = localFinal === testerFinal;
    const localMatchesBase = localFinal === baseFinal;
    const testerChangedText = testerFinal !== baseFinal;
    const state = !testerChangedText || sameFinal || localMatchesBase ? "auto" : "conflict";
    const action = testerChangedText ? "apply_tester" : "review_only";
    items.push({
      decisionKey,
      state,
      rowId: row.id,
      category: row.category,
      resourceKey: row.resourceKey,
      msgId: row.msgId,
      speaker: row.speaker,
      modHeader: row.modHeader,
      modEnglish: row.modEnglish,
      baseChinese: visibleText(baseFinal),
      localChinese: row.finalChinese,
      testerChinese: visibleText(testerFinal),
      localUpdatedAt: overrides.get(key)?.updated_at || "",
      testerUpdatedAt: change.updated_at || patch.exported_at || "",
      testerReviewed: Boolean(change.reviewed_at),
      testerChangedText,
      action,
      recommendation: (change.updated_at || "") > (overrides.get(key)?.updated_at || "") ? "tester" : "local",
    });
  }
  return items;
}

function previewMasterUpdate(pack) {
  const files = unpackMasterUpdate(pack);
  const nextOverrides = new Map(parseCsv(files.get("overrides.csv").toString("utf8")).map((record) => [rowKey(record), record]));
  const nextMasterRows = new Map(parseCsv(files.get("master_index.csv").toString("utf8")).map((record) => [rowKey(record), record]));
  const items = [];
  for (const change of reviewChanges.values()) {
    const key = rowKey(change);
    const row = rowsByKey.get(key);
    if (!row) {
      items.push({ decisionKey: reviewDecisionKey(key), state: "missing", category: change.category, resourceKey: change.resource_key, msgId: change.msg_id });
      continue;
    }
    const oldBase = String(change.base_final_zh ?? row.baseFinalRaw ?? "");
    const testerFinal = String(change.final_zh ?? oldBase);
    const nextRecord = nextMasterRows.get(key);
    const masterFinal = String(nextRecord?.final_zh ?? row.baseFinalRaw ?? "");
    const testerChangedText = testerFinal !== oldBase;
    const masterChangedText = masterFinal !== oldBase;
    const conflict = testerChangedText && masterChangedText && testerFinal !== masterFinal;
    items.push({
      decisionKey: reviewDecisionKey(key),
      state: conflict ? "conflict" : "auto",
      category: row.category,
      resourceKey: row.resourceKey,
      msgId: row.msgId,
      speaker: row.speaker,
      modEnglish: row.modEnglish,
      testerChinese: visibleText(testerFinal),
      masterChinese: visibleText(masterFinal),
      testerUpdatedAt: change.updated_at || "",
      masterUpdatedAt: nextRecord?.updated_at || pack.generated_at || "",
      testerChangedText,
      masterChangedText,
    });
  }
  return { files, nextOverrides, nextMasterRows, items };
}

function writeMasterUpdateFiles(files, generatedAt) {
  const nextCatalog = new Map([...files].filter(([name]) => name.startsWith("catalog/")));
  fs.mkdirSync(CATEGORY_ROOT, { recursive: true });
  for (const existing of fs.readdirSync(CATEGORY_ROOT).filter((name) => name.endsWith(".csv.gz"))) {
    if (!nextCatalog.has(`catalog/${existing}`)) fs.rmSync(path.join(CATEGORY_ROOT, existing));
  }
  for (const [relative, buffer] of files) {
    if (relative === "master_index.csv") continue;
    const destination = relative.startsWith("catalog/")
      ? path.join(CATEGORY_ROOT, path.basename(relative))
      : relative === "overrides.csv" ? OVERRIDE_FILE : STATUS_FILE;
    const temp = `${destination}.tmp`;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(temp, buffer);
    fs.renameSync(temp, destination);
  }
  saveJsonAtomic(SNAPSHOT_FILE, {
    format: "rose-review-snapshot-v1",
    created_at: generatedAt,
    catalog: "translations/catalog",
    overrides: "translations/overrides.csv",
  });
}

async function api(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/meta") {
    const statusCounts = {};
    for (const row of rows) statusCounts[statusOf(row)] = (statusCounts[statusOf(row)] || 0) + 1;
    statusCounts.unreviewed = rows.reduce((count, row) => count + (isUnreviewed(row) ? 1 : 0), 0);
    return sendJson(res, 200, {
      mode: MODE,
      total: rows.length,
      categories: [...categories].sort(),
      statusCounts,
      reviewer: reviewSession.reviewer || "",
      reviewChangeCount: reviewChanges.size,
      snapshot: loadJson(SNAPSHOT_FILE, null),
    });
  }
  if (req.method === "GET" && url.pathname === "/api/rows") {
    const query = (url.searchParams.get("query") || "").trim().toLocaleLowerCase();
    const category = url.searchParams.get("category") || "";
    const status = url.searchParams.get("status") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const limit = Math.min(200, Math.max(20, Number(url.searchParams.get("limit") || 80)));
    const matches = [];
    for (const row of rows) {
      if (category && row.category !== category) continue;
      if (status === "unreviewed" && !isUnreviewed(row)) continue;
      if (status && status !== "unreviewed" && statusOf(row) !== status) continue;
      if (query && !`${row.resourceKey}\n${row.msgId}\n${row.speaker}\n${row.modEnglish}\n${row.finalChinese}`.toLocaleLowerCase().includes(query)) continue;
      matches.push(row);
    }
    const start = (page - 1) * limit;
    return sendJson(res, 200, { page, limit, total: matches.length, rows: matches.slice(start, start + limit).map(publicRow) });
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/row/")) {
    const row = rowsById.get(Number(url.pathname.split("/").at(-1)));
    if (!row) return sendJson(res, 404, { error: "Row not found" });
    return sendJson(res, 200, { ...publicRow(row), finalRaw: row.finalRaw });
  }
  if (req.method === "POST" && url.pathname === "/api/override") {
    const body = await readBody(req);
    const row = rowsById.get(Number(body.id));
    if (!row || typeof body.finalRaw !== "string") return sendJson(res, 400, { error: "Invalid row or translation" });
    if (row.reviewed) return sendJson(res, 409, { error: "该条目已经核对并锁定，不能再修改译文" });
    const now = new Date().toISOString();
    const current = overrides.get(rowKey(row));
    const record = MODE === "reviewer"
      ? reviewerRecord(row, body.finalRaw, "", now)
      : {
        category: row.category,
        resource_key: row.resourceKey,
        msg_id: row.msgId,
        final_zh: body.finalRaw,
        updated_at: now,
        compiled_at: "",
        reviewed_at: "",
        ai_reviewed_at: "",
        high_risk_at: (row.aiReviewed || row.highRisk) ? (current?.high_risk_at || now) : "",
      };
    overrides.set(rowKey(record), MODE === "reviewer" ? { ...record, compiled_at: "" } : record);
    updateRowFromRecord(row, { ...record, compiled_at: "" });
    if (MODE === "reviewer") {
      reviewChanges.set(rowKey(record), record);
      saveReviewSession();
    } else saveOverrides();
    return sendJson(res, 200, { ok: true, row: publicRow(row) });
  }
  if (req.method === "POST" && url.pathname === "/api/review") {
    const body = await readBody(req);
    const row = rowsById.get(Number(body.id));
    if (!row || typeof body.reviewed !== "boolean") return sendJson(res, 400, { error: "Invalid row or review state" });
    if (row.reviewed && body.reviewed) return sendJson(res, 200, { ok: true, row: publicRow(row) });
    const key = rowKey(row);
    let record = MODE === "reviewer" ? reviewChanges.get(key) : overrides.get(key);
    if (!record) {
      record = MODE === "reviewer"
        ? reviewerRecord(row, row.finalRaw, "")
        : {
          category: row.category,
          resource_key: row.resourceKey,
          msg_id: row.msgId,
          final_zh: row.finalRaw,
          updated_at: "",
          compiled_at: row.dirty ? "" : new Date().toISOString(),
          reviewed_at: "",
          ai_reviewed_at: "",
          high_risk_at: "",
        };
      overrides.set(key, record);
      row.hasOverride = true;
    }
    record.reviewed_at = body.reviewed ? new Date().toISOString() : "";
    record.ai_reviewed_at = "";
    record.high_risk_at = "";
    if (MODE === "reviewer") {
      record.updated_at = new Date().toISOString();
      reviewChanges.set(key, record);
    }
    updateRowFromRecord(row, record);
    if (MODE === "reviewer") saveReviewSession(); else saveOverrides();
    return sendJson(res, 200, { ok: true, row: publicRow(row) });
  }
  if (req.method === "POST" && url.pathname === "/api/ai-status") {
    if (MODE !== "main") return sendJson(res, 403, { error: "Only available in main mode" });
    const body = await readBody(req);
    const row = rowsById.get(Number(body.id));
    if (!row || !["ai_reviewed", "high_risk", ""].includes(body.status)) return sendJson(res, 400, { error: "Invalid row or AI review state" });
    if (row.reviewed) return sendJson(res, 409, { error: "该条目已经人工核对，不能由 AI 状态覆盖" });
    const key = rowKey(row);
    const now = new Date().toISOString();
    const record = overrides.get(key) || {
      category: row.category,
      resource_key: row.resourceKey,
      msg_id: row.msgId,
      final_zh: row.finalRaw,
      updated_at: "",
      compiled_at: row.dirty ? "" : now,
      reviewed_at: "",
    };
    record.reviewed_at = "";
    record.ai_reviewed_at = body.status === "ai_reviewed" ? now : "";
    record.high_risk_at = body.status === "high_risk" ? now : "";
    overrides.set(key, record);
    updateRowFromRecord(row, record);
    saveOverrides();
    return sendJson(res, 200, { ok: true, row: publicRow(row) });
  }
  if (req.method === "POST" && url.pathname === "/api/export-review") {
    if (MODE !== "reviewer") return sendJson(res, 403, { error: "Only available in reviewer mode" });
    const body = await readBody(req);
    reviewSession.reviewer = String(body.reviewer || reviewSession.reviewer || "").trim();
    saveReviewSession();
    const exportedAt = new Date().toISOString();
    const payload = {
      format: "rose-review-patch",
      version: 1,
      reviewer: reviewSession.reviewer,
      snapshot_created_at: loadJson(SNAPSHOT_FILE, {})?.created_at || "",
      exported_at: exportedAt,
      changes: [...reviewChanges.values()].sort((a, b) => rowKey(a).localeCompare(rowKey(b))),
    };
    const stamp = exportedAt.replace(/[:.]/g, "-");
    return sendDownloadJson(res, `rose-review-${stamp}.json`, payload);
  }
  if (req.method === "POST" && url.pathname === "/api/export-master-update") {
    if (MODE !== "main") return sendJson(res, 403, { error: "Only available in main mode" });
    const pack = createMasterUpdatePack();
    const stamp = pack.generated_at.replace(/[:.]/g, "-");
    return sendDownloadJson(res, `rose-master-update-${stamp}.json`, pack);
  }
  if (req.method === "POST" && url.pathname === "/api/import-master-update/preview") {
    if (MODE !== "reviewer") return sendJson(res, 403, { error: "Only available in reviewer mode" });
    const body = await readBody(req);
    const pack = body.pack || body;
    const preview = previewMasterUpdate(pack);
    return sendJson(res, 200, {
      generatedAt: pack.generated_at || "",
      files: preview.files.size,
      pendingChanges: reviewChanges.size,
      auto: preview.items.filter((item) => item.state === "auto").length,
      conflicts: preview.items.filter((item) => item.state === "conflict").length,
      missing: preview.items.filter((item) => item.state === "missing").length,
      items: preview.items,
    });
  }
  if (req.method === "POST" && url.pathname === "/api/import-master-update/apply") {
    if (MODE !== "reviewer") return sendJson(res, 403, { error: "Only available in reviewer mode" });
    const body = await readBody(req);
    const pack = body.pack;
    const decisions = body.decisions || {};
    const preview = previewMasterUpdate(pack);
    const conflicts = preview.items.filter((item) => item.state === "conflict");
    const unresolved = conflicts.filter((item) => !["tester", "master"].includes(decisions[item.decisionKey]));
    if (unresolved.length) return sendJson(res, 409, { error: `还有 ${unresolved.length} 条冲突没有选择` });

    let keptTester = 0;
    let adoptedMaster = 0;
    let rebased = 0;
    for (const change of reviewChanges.values()) {
      const key = rowKey(change);
      const row = rowsByKey.get(key);
      if (!row) continue;
      const item = preview.items.find((candidate) => candidate.decisionKey === reviewDecisionKey(key));
      const nextRecord = preview.nextMasterRows.get(key);
      const masterFinal = String(nextRecord?.final_zh ?? row.baseFinalRaw ?? "");
      const testerChangedText = String(change.final_zh ?? "") !== String(change.base_final_zh ?? "");
      const choice = item?.state === "conflict" ? decisions[item.decisionKey] : (testerChangedText ? "tester" : "master");
      if (choice === "master") {
        change.final_zh = masterFinal;
        adoptedMaster++;
      } else {
        keptTester++;
      }
      change.base_final_zh = masterFinal;
      change.base_updated_at = nextRecord?.updated_at || "";
      change.base_compiled_at = nextRecord?.compiled_at || "";
      change.base_reviewed_at = nextRecord?.reviewed_at || "";
      change.base_ai_reviewed_at = nextRecord?.ai_reviewed_at || "";
      change.base_high_risk_at = nextRecord?.high_risk_at || "";
      rebased++;
    }
    writeMasterUpdateFiles(preview.files, pack.generated_at || new Date().toISOString());
    saveReviewSession();
    sendJson(res, 200, { ok: true, keptTester, adoptedMaster, rebased, restartRequired: true });
    setTimeout(() => process.exit(23), 500);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/import-review/preview") {
    if (MODE !== "main") return sendJson(res, 403, { error: "Only available in main mode" });
    const body = await readBody(req);
    const patch = body.patch || body;
    if (!validateReviewPatch(patch)) return sendJson(res, 400, { error: "不是有效的 Rose 审核 JSON" });
    const items = previewReviewPatch(patch);
    return sendJson(res, 200, {
      reviewer: patch.reviewer || "",
      exportedAt: patch.exported_at || "",
      total: items.length,
      auto: items.filter((item) => item.state === "auto").length,
      conflicts: items.filter((item) => item.state === "conflict").length,
      missing: items.filter((item) => item.state === "missing").length,
      items,
    });
  }
  if (req.method === "POST" && url.pathname === "/api/import-review/apply") {
    if (MODE !== "main") return sendJson(res, 403, { error: "Only available in main mode" });
    const body = await readBody(req);
    const patch = body.patch;
    const decisions = body.decisions || {};
    if (!validateReviewPatch(patch)) return sendJson(res, 400, { error: "不是有效的 Rose 审核 JSON" });
    let applied = 0;
    let keptLocal = 0;
    let missing = 0;
    let unresolved = 0;
    for (const change of patch.changes) {
      const key = reviewChangeKey(change);
      const row = rowsByKey.get(key);
      if (!row) { missing++; continue; }
      const localFinal = row.finalRaw;
      const testerFinal = String(change.final_zh ?? "");
      const baseFinal = String(change.base_final_zh ?? "");
      const testerChangedText = testerFinal !== baseFinal;
      if (!testerChangedText) {
        const current = overrides.get(key);
        const record = {
          category: row.category,
          resource_key: row.resourceKey,
          msg_id: row.msgId,
          final_zh: localFinal,
          updated_at: current?.updated_at || row.baseUpdatedAt || "",
          compiled_at: current?.compiled_at || row.baseCompiledAt || "",
          reviewed_at: change.reviewed_at || "",
          ai_reviewed_at: change.reviewed_at ? "" : (current?.ai_reviewed_at || ""),
          high_risk_at: change.reviewed_at ? "" : (current?.high_risk_at || ""),
        };
        overrides.set(key, record);
        updateRowFromRecord(row, record);
        applied++;
        continue;
      }
      const conflict = localFinal !== testerFinal && localFinal !== baseFinal;
      const choice = conflict ? decisions[reviewDecisionKey(key)] : "tester";
      if (conflict && choice !== "tester" && choice !== "local") { unresolved++; continue; }
      if (choice === "local") { keptLocal++; continue; }
      const current = overrides.get(key);
      const finalChanged = localFinal !== testerFinal;
      const record = {
        category: row.category,
        resource_key: row.resourceKey,
        msg_id: row.msgId,
        final_zh: testerFinal,
        updated_at: finalChanged ? (change.updated_at || new Date().toISOString()) : (current?.updated_at || change.updated_at || ""),
        compiled_at: finalChanged ? "" : (current?.compiled_at || row.baseCompiledAt || ""),
        reviewed_at: change.reviewed_at || "",
        ai_reviewed_at: "",
        high_risk_at: change.reviewed_at ? "" : (finalChanged ? (change.updated_at || new Date().toISOString()) : (current?.high_risk_at || "")),
      };
      overrides.set(key, record);
      updateRowFromRecord(row, record);
      applied++;
    }
    saveOverrides();
    return sendJson(res, 200, { ok: unresolved === 0, applied, keptLocal, missing, unresolved });
  }
  if (req.method === "POST" && url.pathname === "/api/compile") {
    if (MODE !== "main") return sendJson(res, 403, { error: "便携审核版不能编译或部署" });
    const body = await readBody(req);
    const selectedRows = [...new Set((body.ids || []).map(Number))].map((id) => rowsById.get(id)).filter(Boolean);
    const resourceKeys = [...new Set(selectedRows.map((row) => row.resourceKey))];
    if (!resourceKeys.length) return sendJson(res, 400, { error: "No rows selected" });
    await runBuild(resourceKeys);
    const statusFile = path.join(MANAGER_BUILD, "resource_status.json");
    const records = JSON.parse(fs.readFileSync(statusFile, "utf8"));
    fs.copyFileSync(statusFile, STATUS_FILE);
    for (const record of records) resourceStatuses.set(record.resourceKey, record.status);
    const deploy = deployManagerBuild();
    const successful = new Set(records.filter((record) => record.status === "compiled" || record.status === "ready_msg_overlay").map((record) => record.resourceKey));
    const compiledAt = new Date().toISOString();
    for (const row of rows) {
      if (!successful.has(row.resourceKey)) continue;
      row.dirty = false;
      const override = overrides.get(rowKey(row));
      if (override) override.compiled_at = compiledAt;
    }
    saveOverrides();
    const statusCounts = records.reduce((all, row) => {
      all[row.status] = (all[row.status] || 0) + 1;
      return all;
    }, {});
    return sendJson(res, 200, { resources: resourceKeys.length, statusCounts, ...deploy });
  }
  return false;
}

const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      const handled = await api(req, res, url);
      if (handled === false) sendJson(res, 404, { error: "API not found" });
      return;
    }
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.resolve(PUBLIC, relative);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end("Not found"); return;
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Content-Length": body.length });
    res.end(body);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Rose Translation Manager: http://127.0.0.1:${PORT}`);
  console.log(`Loaded ${rows.length} text rows.`);
});
