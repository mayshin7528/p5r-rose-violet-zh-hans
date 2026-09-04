const state = {
  page: 1, limit: 80, total: 0, rows: [], selected: new Set(), currentId: null,
  currentReviewed: false, busy: false, mode: "main", meta: null,
  importPatch: null, importPreview: null,
  masterUpdatePack: null, masterUpdatePreview: null,
};
const $ = (selector) => document.querySelector(selector);
const labels = {
  unreviewed: "未核对", ai_reviewed: "AI已核对", high_risk: "高危", reviewed: "已核对", compiled: "已编译", edited: "已编辑",
  compile_failed: "编译失败", skipped_untranslated_ascii: "整句仍为英文",
  blocked_by_resource_english: "同文件有未翻译句", preserved_existing_special: "特殊补丁",
  ready_msg_overlay: "MSG 覆盖",
};

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function toast(message, error = false) {
  const box = $("#toast");
  box.textContent = message;
  box.style.background = error ? "#9e1c2b" : "#22272b";
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.hidden = true; }, 6500);
}

function setBusy(busy, message = "") {
  state.busy = busy;
  $("#serverState").textContent = message || (busy ? "处理中" : "就绪");
  $("#compileSelected").disabled = busy || state.selected.size === 0;
  $("#saveTranslation").disabled = busy || state.currentReviewed;
  $("#compileCurrent").disabled = busy || state.currentReviewed;
  $("#toggleReviewed").disabled = busy;
  $("#exportReview").disabled = busy;
  $("#importReview").disabled = busy;
  $("#exportMasterUpdate").disabled = busy;
  $("#importMasterUpdate").disabled = busy;
}

function applyMeta(meta, initial = false) {
  state.meta = meta;
  state.mode = meta.mode || "main";
  document.body.classList.toggle("reviewer-mode", state.mode === "reviewer");
  document.body.classList.toggle("main-mode", state.mode !== "reviewer");
  $("#reviewerPanel").hidden = state.mode !== "reviewer";
  $("#mainPanel").hidden = state.mode === "reviewer";
  $("#appTitle").textContent = state.mode === "reviewer" ? "Rose 汉化便携审核器" : "Rose 汉化管理器";
  $("#summary").textContent = `${meta.total.toLocaleString()} 句 · ${meta.categories.length} 类 · ${Object.keys(meta.statusCounts).length} 种状态`;
  $("#reviewChangeCount").textContent = meta.reviewChangeCount ? `本次已记录 ${meta.reviewChangeCount} 条` : "尚无改动";
  if (!initial) return;
  for (const [category, count] of meta.categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = `${category} (${count.toLocaleString()})`;
    $("#category").append(option);
  }
  for (const [status, count] of Object.entries(meta.statusCounts).sort()) {
    let option = [...$("#status").options].find((item) => item.value === status);
    if (!option) {
      option = document.createElement("option");
      option.value = status;
      $("#status").append(option);
    }
    option.textContent = `${labels[status] || status} (${count.toLocaleString()})`;
  }
}

async function loadMeta(initial = false) {
  applyMeta(await api("/api/meta"), initial);
}

function renderRows() {
  $("#rows").innerHTML = state.rows.map((row) => `
    <tr data-id="${row.id}">
      <td class="check"><input class="row-check" type="checkbox" data-id="${row.id}" ${state.selected.has(row.id) ? "checked" : ""} aria-label="选择 ${escapeHtml(row.msgId)}"></td>
      <td><span class="badge ${escapeHtml(row.status)}">${escapeHtml(labels[row.status] || row.status)}</span></td>
      <td><span class="cell-path">${escapeHtml(row.resourceKey)}</span><span class="cell-id">${escapeHtml(row.msgId)}</span></td>
      <td>${escapeHtml(row.speaker) || '<span class="muted">无</span>'}</td>
      <td class="header-col"><div class="cell-header">${escapeHtml(row.modHeader) || '<span class="muted">无</span>'}</div></td>
      <td class="english-col"><div class="cell-text">${escapeHtml(row.modEnglish)}</div></td>
      <td><div class="cell-text">${escapeHtml(row.finalChinese)}</div></td>
      <td class="row-actions">
        <button class="row-action edit-row" type="button" data-id="${row.id}">${row.reviewed ? "查看" : "编辑"}</button>
        <button class="row-action review-row ${row.reviewed ? "is-reviewed" : ""}" type="button" data-id="${row.id}" data-reviewed="${row.reviewed}">${row.reviewed ? "取消核对" : "标为已核对"}</button>
      </td>
    </tr>`).join("");
  $("#empty").hidden = state.rows.length > 0;
  const pages = Math.max(1, Math.ceil(state.total / state.limit));
  $("#pageLabel").textContent = `第 ${state.page} / ${pages} 页 · ${state.total.toLocaleString()} 句`;
  $("#previous").disabled = state.page <= 1;
  $("#next").disabled = state.page >= pages;
  $("#selectPage").checked = state.rows.length > 0 && state.rows.every((row) => state.selected.has(row.id));
  updateSelection();
}

async function loadRows(resetPage = false) {
  if (resetPage) state.page = 1;
  const params = new URLSearchParams({ query: $("#query").value, category: $("#category").value, status: $("#status").value, page: state.page, limit: state.limit });
  setBusy(true, "载入中");
  try {
    const data = await api(`/api/rows?${params}`);
    state.total = data.total;
    state.rows = data.rows;
    renderRows();
  } catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
}

function updateSelection() {
  $("#selectedCount").textContent = state.selected.size;
  $("#compileSelected").disabled = state.busy || state.selected.size === 0;
}

async function openEditor(id) {
  setBusy(true, "读取中");
  try {
    const row = await api(`/api/row/${id}`);
    state.currentId = id;
    state.currentReviewed = row.reviewed;
    $("#editorId").textContent = row.msgId;
    $("#editorPath").textContent = row.resourceKey;
    $("#editorStatus").textContent = labels[row.status] || row.status;
    $("#editorSpeaker").textContent = row.speaker || "无说话人";
    $("#editorModHeader").value = row.modHeader || "";
    $("#editorEnglish").value = row.modEnglish;
    $("#editorTranslation").value = row.finalRaw;
    $("#editorTranslation").readOnly = row.reviewed;
    $("#toggleReviewed").textContent = row.reviewed ? "取消核对" : "标为已核对";
    $("#toggleReviewed").dataset.reviewed = String(row.reviewed);
    $("#saveTranslation").disabled = row.reviewed;
    $("#compileCurrent").disabled = row.reviewed;
    $("#editor").showModal();
  } catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
}

async function saveCurrent() {
  if (state.currentId === null) return;
  if (state.currentReviewed) throw new Error("该条目已经核对并锁定，不能再修改译文");
  const data = await api("/api/override", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: state.currentId, finalRaw: $("#editorTranslation").value }) });
  const index = state.rows.findIndex((row) => row.id === state.currentId);
  if (index >= 0) state.rows[index] = data.row;
  renderRows();
  await loadMeta(false);
  return data;
}

async function setReviewed(id, reviewed) {
  const data = await api("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, reviewed }) });
  const index = state.rows.findIndex((row) => row.id === id);
  if (index >= 0) state.rows[index] = data.row;
  if (state.currentId === id) {
    state.currentReviewed = data.row.reviewed;
    $("#editorStatus").textContent = labels[data.row.status] || data.row.status;
    $("#editorTranslation").readOnly = data.row.reviewed;
    $("#toggleReviewed").textContent = data.row.reviewed ? "取消核对" : "标为已核对";
    $("#toggleReviewed").dataset.reviewed = String(data.row.reviewed);
    $("#saveTranslation").disabled = data.row.reviewed;
    $("#compileCurrent").disabled = data.row.reviewed;
  }
  await Promise.all([loadMeta(false), loadRows(false)]);
  return data;
}

async function compile(ids) {
  if (state.mode === "reviewer") throw new Error("便携审核器不包含编译和部署功能");
  setBusy(true, "编译中");
  try {
    const result = await api("/api/compile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    toast(`处理 ${result.resources} 个资源\n部署 ${result.deployed} 个文件\n${JSON.stringify(result.statusCounts)}`);
    state.selected.clear();
    await Promise.all([loadRows(false), loadMeta(false)]);
  } catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
}

function fileNameFromResponse(response, fallbackPrefix = "rose-review") {
  const match = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/i);
  return match?.[1] || `${fallbackPrefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

async function downloadResponse(response, fallbackPrefix) {
  if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileNameFromResponse(response, fallbackPrefix);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return link.download;
}

async function exportReview() {
  setBusy(true, "正在生成审核文件");
  try {
    const reviewer = $("#reviewerName").value.trim();
    const response = await fetch("/api/export-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewer }) });
    const filename = await downloadResponse(response, "rose-review");
    toast(`已保存 ${filename}\n把这个 JSON 发回给补丁维护者即可`);
  } catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
}

async function exportMasterUpdate() {
  setBusy(true, "正在生成主库更新包");
  try {
    const response = await fetch("/api/export-master-update", { method: "POST" });
    const filename = await downloadResponse(response, "rose-master-update");
    toast(`已保存 ${filename}\n把这个更新包发给便携版测试员即可`);
  } catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
}

function renderImportPreview(preview) {
  const auto = preview.auto || 0;
  const conflicts = (preview.items || []).filter((item) => item.state === "conflict");
  const missing = preview.missing || 0;
  $("#importSummary").innerHTML = `<strong>${escapeHtml(preview.reviewer || "未署名审核人")}</strong> · 导出于 ${escapeHtml(preview.exportedAt || "未知时间")}<br>自动合并 ${auto} 条 · 需要决定 ${conflicts.length} 条 · 主库中不存在 ${missing} 条`;
  $("#conflictList").innerHTML = conflicts.length ? conflicts.map((item, index) => `
    <article class="conflict-card" data-key="${escapeHtml(item.decisionKey)}">
      <header><strong>${escapeHtml(item.resourceKey)} / ${escapeHtml(item.msgId)}</strong><span>${escapeHtml(item.speaker || "无说话人")}</span></header>
      <div class="conflict-english">${escapeHtml(item.modEnglish || "")}</div>
      <div class="compare-grid">
        <label><span>保留本地 · ${escapeHtml(item.localUpdatedAt || "无时间")}</span><textarea readonly>${escapeHtml(item.localChinese || "")}</textarea></label>
        <label><span>采用测试员 · ${escapeHtml(item.testerUpdatedAt || "无时间")}</span><textarea readonly>${escapeHtml(item.testerChinese || "")}</textarea></label>
      </div>
      <div class="conflict-choice">
        <label><input type="radio" name="conflict-${index}" value="local">保留本地</label>
        <label><input type="radio" name="conflict-${index}" value="tester">采用测试员</label>
      </div>
    </article>`).join("") : '<div class="no-conflicts">没有文本冲突，可以直接应用。</div>';
  $("#importDialog").showModal();
}

async function previewImport(file) {
  const patch = JSON.parse(await file.text());
  const preview = await api("/api/import-review/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patch }) });
  state.importPatch = patch;
  state.importPreview = preview;
  renderImportPreview(preview);
}

async function applyImport() {
  const decisions = {};
  const cards = [...$("#conflictList").querySelectorAll(".conflict-card")];
  for (const card of cards) {
    const selected = card.querySelector("input[type=radio]:checked");
    if (!selected) throw new Error("请为每个冲突项选择保留本地或采用测试员版本");
    decisions[card.dataset.key] = selected.value;
  }
  setBusy(true, "正在导入");
  try {
    const result = await api("/api/import-review/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patch: state.importPatch, decisions }) });
    $("#importDialog").close();
    toast(`已导入 ${result.applied} 条，保留本地 ${result.keptLocal} 条，主库中不存在 ${result.missing} 条`);
    await Promise.all([loadMeta(false), loadRows(false)]);
  } catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
}

function renderMasterUpdatePreview(preview) {
  const conflicts = (preview.items || []).filter((item) => item.state === "conflict");
  $("#masterUpdateSummary").innerHTML = `主库生成于 <strong>${escapeHtml(preview.generatedAt || "未知时间")}</strong><br>更新文件 ${preview.files} 个 · 保留并重整本地记录 ${preview.pendingChanges} 条 · 自动处理 ${preview.auto} 条 · 需要决定 ${conflicts.length} 条 · 当前目录中不存在 ${preview.missing} 条`;
  $("#masterUpdateConflictList").innerHTML = conflicts.length ? conflicts.map((item, index) => `
    <article class="conflict-card" data-key="${escapeHtml(item.decisionKey)}">
      <header><strong>${escapeHtml(item.resourceKey)} / ${escapeHtml(item.msgId)}</strong><span>${escapeHtml(item.speaker || "无说话人")}</span></header>
      <div class="conflict-english">${escapeHtml(item.modEnglish || "")}</div>
      <div class="compare-grid">
        <label><span>保留我的审核 · ${escapeHtml(item.testerUpdatedAt || "无时间")}</span><textarea readonly>${escapeHtml(item.testerChinese || "")}</textarea></label>
        <label><span>采用新主库 · ${escapeHtml(item.masterUpdatedAt || "无时间")}</span><textarea readonly>${escapeHtml(item.masterChinese || "")}</textarea></label>
      </div>
      <div class="conflict-choice">
        <label><input type="radio" name="master-conflict-${index}" value="tester">保留我的审核</label>
        <label><input type="radio" name="master-conflict-${index}" value="master">采用新主库</label>
      </div>
    </article>`).join("") : '<div class="no-conflicts">没有文本冲突，可以直接更新主库。</div>';
  $("#masterUpdateDialog").showModal();
}

async function previewMasterUpdate(file) {
  setBusy(true, "正在校验更新包");
  try {
    const pack = JSON.parse(await file.text());
    const preview = await api("/api/import-master-update/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack }) });
    state.masterUpdatePack = pack;
    state.masterUpdatePreview = preview;
    renderMasterUpdatePreview(preview);
  } finally { setBusy(false); }
}

function waitForReviewerRestart() {
  let attempts = 0;
  const poll = async () => {
    attempts++;
    try {
      const response = await fetch(`/api/meta?restart=${Date.now()}`, { cache: "no-store" });
      if (response.ok && attempts > 1) { location.reload(); return; }
    } catch {}
    if (attempts < 45) setTimeout(poll, 1000);
    else toast("主库已写入，但审核器未能自动恢复。请关闭窗口后重新运行 start_reviewer.cmd。", true);
  };
  setTimeout(poll, 1200);
}

async function applyMasterUpdate() {
  const decisions = {};
  const cards = [...$("#masterUpdateConflictList").querySelectorAll(".conflict-card")];
  for (const card of cards) {
    const selected = card.querySelector("input[type=radio]:checked");
    if (!selected) throw new Error("请为每个冲突项选择保留我的审核或采用新主库");
    decisions[card.dataset.key] = selected.value;
  }
  setBusy(true, "正在更新主库");
  try {
    const result = await api("/api/import-master-update/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack: state.masterUpdatePack, decisions }) });
    $("#masterUpdateDialog").close();
    toast(`主库已更新：保留我的译文 ${result.keptTester} 条，采用主库 ${result.adoptedMaster} 条。审核器正在重启...`);
    waitForReviewerRestart();
  } catch (error) {
    if (error instanceof TypeError) waitForReviewerRestart();
    else throw error;
  } finally { setBusy(false); }
}

let searchTimer;
$("#query").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadRows(true), 260); });
$("#category").addEventListener("change", () => loadRows(true));
$("#status").addEventListener("change", () => loadRows(true));
$("#refresh").addEventListener("click", () => loadRows(false));
$("#previous").addEventListener("click", () => { state.page--; loadRows(false); });
$("#next").addEventListener("click", () => { state.page++; loadRows(false); });
$("#selectPage").addEventListener("change", (event) => { for (const row of state.rows) event.target.checked ? state.selected.add(row.id) : state.selected.delete(row.id); renderRows(); });
$("#rows").addEventListener("change", (event) => {
  if (!event.target.classList.contains("row-check")) return;
  const id = Number(event.target.dataset.id);
  event.target.checked ? state.selected.add(id) : state.selected.delete(id);
  updateSelection();
});
$("#rows").addEventListener("click", (event) => {
  const editButton = event.target.closest(".edit-row");
  if (editButton) return openEditor(Number(editButton.dataset.id));
  const reviewButton = event.target.closest(".review-row");
  if (!reviewButton || reviewButton.disabled) return;
  const id = Number(reviewButton.dataset.id);
  const reviewed = reviewButton.dataset.reviewed === "true";
  setBusy(true, reviewed ? "取消核对中" : "标记核对中");
  setReviewed(id, !reviewed).then(() => toast(reviewed ? "已取消核对" : "已核对"))
    .catch((error) => toast(error.message, true)).finally(() => setBusy(false));
});
$("#toggleReviewed").addEventListener("click", async () => {
  if (state.currentId === null) return;
  setBusy(true, state.currentReviewed ? "取消核对中" : "标记核对中");
  try { await setReviewed(state.currentId, !state.currentReviewed); $("#editor").close(); toast(state.currentReviewed ? "已核对" : "已取消核对"); }
  catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
});
$("#saveTranslation").addEventListener("click", async () => {
  setBusy(true, "保存中");
  try { await saveCurrent(); toast("译文已保存"); }
  catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
});
$("#compileCurrent").addEventListener("click", async () => {
  setBusy(true, "保存中");
  try { await saveCurrent(); $("#editor").close(); await compile([state.currentId]); }
  catch (error) { toast(error.message, true); setBusy(false); }
});
$("#compileSelected").addEventListener("click", () => compile([...state.selected]));
$("#exportReview").addEventListener("click", exportReview);
$("#exportMasterUpdate").addEventListener("click", exportMasterUpdate);
$("#importMasterUpdate").addEventListener("click", () => $("#importMasterUpdateFile").click());
$("#importMasterUpdateFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  try { await previewMasterUpdate(file); }
  catch (error) { toast(`无法读取主库更新包：${error.message}`, true); }
});
$("#applyMasterUpdate").addEventListener("click", () => applyMasterUpdate().catch((error) => toast(error.message, true)));
$("#importReview").addEventListener("click", () => $("#importReviewFile").click());
$("#importReviewFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  try { await previewImport(file); }
  catch (error) { toast(`无法读取审核文件：${error.message}`, true); }
});
$("#applyImport").addEventListener("click", () => applyImport().catch((error) => toast(error.message, true)));

loadMeta(true).then(() => loadRows(true)).catch((error) => toast(error.message, true));
