const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outputRoot = path.join(root, "build", "translation_patch", "output");
const originalRoot = process.env.ROSE_ORIGINAL_MOD || "F:/Reloaded-II/Mods/p5rpc.kasumi.roseandviolet";
const installedRoot = process.env.ROSE_INSTALLED_MOD || "F:/Reloaded-II/Mods/p5rpc.kasumi.roseandviolet.zh-hans";
const noBackup = process.argv.includes("--no-backup");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
const backupRoot = path.join(root, "build", "deployment_backups", `translation_patch_${stamp}`);

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

let deployed = 0;
let backedUp = 0;
let skippedExtra = 0;
let unchanged = 0;
for (const source of walk(outputRoot)) {
  const relative = path.relative(outputRoot, source);
  if (!fs.existsSync(path.join(originalRoot, relative))) {
    skippedExtra++;
    continue;
  }
  const destination = path.join(installedRoot, relative);
  if (fs.existsSync(destination)) {
    if (fs.readFileSync(source).equals(fs.readFileSync(destination))) {
      unchanged++;
      continue;
    }
    if (!noBackup) {
      const backup = path.join(backupRoot, relative);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(destination, backup);
      backedUp++;
    }
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  deployed++;
}

console.log(JSON.stringify({ deployed, backedUp, unchanged, skippedExtra, backupRoot }, null, 2));
