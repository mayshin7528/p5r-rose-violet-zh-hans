const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_MANAGER = path.join(ROOT, "tools", "translation-manager");
const SOURCE_TRANSLATIONS = path.join(ROOT, "translations");
const OUTPUT = path.join(ROOT, "dist", "Rose-Translation-Reviewer");

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectory(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (entry) => !entry.endsWith("reviewer_session.json"),
  });
}

function writeFile(relativePath, content) {
  const destination = path.join(OUTPUT, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content, "utf8");
}

function ensureSource(relativePath) {
  const source = path.join(ROOT, relativePath);
  if (!fs.existsSync(source)) throw new Error(`Missing portable source: ${source}`);
  return source;
}

if (!OUTPUT.startsWith(path.join(ROOT, "dist") + path.sep)) {
  throw new Error(`Unsafe portable output path: ${OUTPUT}`);
}

fs.rmSync(OUTPUT, { recursive: true, force: true });
fs.mkdirSync(OUTPUT, { recursive: true });

copyFile(process.execPath, path.join(OUTPUT, "node.exe"));
copyFile(ensureSource(path.join("tools", "translation-manager", "server.js")), path.join(OUTPUT, "tools", "translation-manager", "server.js"));
copyDirectory(ensureSource(path.join("tools", "translation-manager", "public")), path.join(OUTPUT, "tools", "translation-manager", "public"));
copyDirectory(ensureSource(path.join("translations", "catalog")), path.join(OUTPUT, "translations", "catalog"));
copyFile(ensureSource(path.join("translations", "overrides.csv")), path.join(OUTPUT, "translations", "overrides.csv"));

const statusFile = path.join(SOURCE_TRANSLATIONS, "resource_status.json");
if (fs.existsSync(statusFile)) copyFile(statusFile, path.join(OUTPUT, "translations", "resource_status.json"));

const snapshot = {
  format: "rose-review-snapshot-v1",
  created_at: new Date().toISOString(),
  catalog: "translations/catalog",
  overrides: "translations/overrides.csv",
};
writeFile("translations/review_snapshot.json", `${JSON.stringify(snapshot, null, 2)}\n`);

writeFile("start_reviewer.cmd", `@echo off\r
cd /d "%~dp0"\r
set "ROSE_MANAGER_MODE=reviewer"\r
set "ROSE_MANAGER_PORT=4179"\r
start "" /min powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4179/'"\r
:restart\r
node.exe tools\\translation-manager\\server.js\r
if errorlevel 23 goto restart\r
pause\r
`);

writeFile("README.txt", `Rose & Violet 汉化审核便携版\r
\r
1. 双击 start_reviewer.cmd。\r
2. 在页面顶部填写审核人名字。\r
3. 搜索文本、修改译文，并按需要标记“已核对”。\r
4. 点击顶部的大号“保存审核结果”按钮。\r
5. 把生成的 rose-review-YYYYMMDD-HHMMSS.json 发给维护者。\r
\r
维护者发来 rose-master-update-*.json 后，点击“导入主库更新包”。\r
本地尚未导出的审核记录会保留；双方都改过的句子会让你选择版本。\r
应用后审核器会自动重启并显示新主库。\r
\r
本包已经包含完整文本目录和打包时的当前译文，不需要另找 overrides.csv。\r
它不会修改维护者的主仓库。你的审核会话仅保存在本包内的\r
translations/reviewer_session.json，并导出为带时间戳的增量 JSON。\r
\r
发回 JSON 即可，不要把整个便携包发回。\r
如果 4179 端口已被占用，请先关闭之前打开的审核器窗口。\r
`);

const catalogCount = fs.readdirSync(path.join(OUTPUT, "translations", "catalog")).length;
console.log(JSON.stringify({ output: OUTPUT, catalogFiles: catalogCount, snapshot }, null, 2));
