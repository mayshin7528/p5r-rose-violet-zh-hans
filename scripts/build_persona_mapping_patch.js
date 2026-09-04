const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  parseNameTableFull,
  serializeNameTableFull,
  loadCharset,
  decodeChs,
} = require("./audit_name_tables.js");

const ROOT = path.resolve(__dirname, "..");
const BUILD = path.join(ROOT, "build", "persona_mapping");
const OUTPUT = path.join(BUILD, "output");
const COMPILER = "F:/Rose/AtlusScriptTools/AtlusScriptCompiler.exe";
const CHARSET_PATH = "F:/Rose/AtlusScriptTools/Charsets/P5R_CHS_ROSE.tsv";
const ROSE_NAME = "F:/Reloaded-II/Mods/p5rpc.kasumi.roseandviolet/P5REssentials/CPK/EN.CPK/BATTLE/TABLE/NAME.TBL";
const OFFICIAL_NAME = "F:/Rose/extracted/BATTLE/TABLE/NAME.TBL";
const DEPLOYED_MYTH = "F:/Reloaded-II/Mods/p5rpc.kasumi.roseandviolet.zh-hans/FEmulator/PAK/INIT/DATMSG.PAK/datMyth.bmd";
const OFFICIAL_FHIT = "F:/Rose/extracted/FIELD/HIT/FHIT_022_001_00.BF";
const REFERENCE = "F:/Rose/references/violet_mod_decompiled/P5REssentials/CPK/EN.CPK";

const charset = loadCharset(CHARSET_PATH);

function encodeChs(text) {
  const chunks = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code < 0x80) {
      chunks.push(Buffer.from([code]));
      continue;
    }
    let found = null;
    for (let row = 0; row < charset.length && !found; row++) {
      const column = charset[row].indexOf(char);
      if (column >= 0) found = [0x80 + Math.floor(row / 8), 0x60 + (row % 8) * 16 + column];
    }
    if (!found) throw new Error(`P5R_CHS_ROSE does not contain: ${char}`);
    chunks.push(Buffer.from(found));
  }
  return Buffer.concat(chunks);
}

function withTerminator(bytes, templateRaw) {
  let nulls = 0;
  for (let index = templateRaw.length - 1; index >= 0 && templateRaw[index] === 0; index--) nulls++;
  return Buffer.concat([bytes, Buffer.alloc(Math.max(1, nulls))]);
}

function rebuildNameTable() {
  const officialBytes = fs.readFileSync(OFFICIAL_NAME);
  const official = parseNameTableFull(OFFICIAL_NAME);
  const roundTrip = serializeNameTableFull(official);
  if (!roundTrip.equals(officialBytes)) throw new Error("Official NAME.TBL failed byte-exact round-trip verification");
  const customPersona = new Map([
    [201, "安娜塔西娅"],
    [220, "安娜塔西娅"],
    [363, "玫瑰公主"],
  ]);
  for (const [index, text] of customPersona) {
    official[4].chunks[index] = withTerminator(encodeChs(text), official[4].chunks[index]);
  }

  const output = path.join(OUTPUT, "P5REssentials", "CPK", "EN.CPK", "BATTLE", "TABLE", "NAME.TBL");
  const localizedOutput = path.join(OUTPUT, "FEmulator", "L10N", "zh-Hans", "NAME.TBL");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(path.dirname(localizedOutput), { recursive: true });
  fs.copyFileSync(ROSE_NAME, output);
  fs.writeFileSync(localizedOutput, serializeNameTableFull(official));
  const parsed = parseNameTableFull(localizedOutput);
  if (parsed.length !== 19) throw new Error(`NAME.TBL group count is ${parsed.length}, expected 19`);
  for (const [index, expected] of customPersona) {
    const zero = parsed[4].chunks[index].indexOf(0);
    const bytes = zero < 0 ? parsed[4].chunks[index] : parsed[4].chunks[index].subarray(0, zero);
    const actual = decodeChs(bytes, charset);
    if (actual !== expected) throw new Error(`NAME.TBL verification failed at ${index}: ${actual}`);
  }
  return [output, localizedOutput];
}

function runCompiler(args, cwd) {
  const result = spawnSync(COMPILER, args, { cwd, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = Buffer.concat([result.stdout || Buffer.alloc(0), result.stderr || Buffer.alloc(0)]).toString("utf16le");
    throw new Error(output);
  }
}

function decompile(input, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  runCompiler([input, "-Decompile", "-Library", "p5r", "-Encoding", "P5R_CHS_ROSE", "-Out", output], path.dirname(output));
}

function compile(input, format) {
  runCompiler([input, "-Compile", "-Library", "p5r", "-Encoding", "P5R_CHS_ROSE", "-OutFormat", format], path.dirname(input));
  return format === "V1BE" ? `${input}.bmd` : `${input}.bf`;
}

function replaceMessage(source, id, replacement) {
  const pattern = new RegExp(`\\[msg ${id}(?: [^\\r\\n]+)?\\]\\r?\\n[\\s\\S]*?(?=\\r?\\n\\r?\\n(?:\\[(?:msg|sel) )|$)`);
  if (!pattern.test(source)) throw new Error(`Message not found: ${id}`);
  return source.replace(pattern, replacement);
}

function normalizeVisibleAscii(source) {
  return source.split(/(\r?\n)/).map((line) => {
    if (/^\[(?:msg|sel)\s/.test(line)) return line;
    return line.split(/(\[[^\]]*\])/g).map((part) => {
      if (part.startsWith("[") && part.endsWith("]")) return part;
      return part.replace(/[!-~]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0));
    }).join("");
  }).join("");
}

function buildMyth() {
  const source = path.join(BUILD, "sources", "datMyth.msg");
  decompile(DEPLOYED_MYTH, source);
  let text = fs.readFileSync(source, "utf8");
  text = text.replaceAll("布莱尔", "玫瑰公主");
  text = normalizeVisibleAscii(text);
  fs.writeFileSync(source, text, "utf8");
  const compiled = compile(source, "V1BE");
  const output = path.join(OUTPUT, "FEmulator", "PAK", "INIT", "DATMSG.PAK", "datMyth.bmd");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(compiled, output);
  return output;
}

function buildMhit() {
  const sourceDir = path.join(BUILD, "sources", "mhit");
  fs.mkdirSync(sourceDir, { recursive: true });
  const flow = path.join(sourceDir, "MHIT_022_010.flow");
  const msg = path.join(sourceDir, "MHIT_022_010.msg");
  fs.copyFileSync(path.join(REFERENCE, "FIELD", "MY_PALACE", "HIT", "MHIT_022_010.BF"), flow);
  fs.writeFileSync(msg, `\ufeff[msg ITEM_MSG [安娜塔西娅]]\r\n[s]ＲＯＳＥ的反抗意志产生的心之像。[n]辛德瑞拉的继妹为寻求真正的理解而蒙受耻辱，[n]却也因此得到了姐姐的爱。[n][w][e]\r\n\r\n[sel YESNO_SEL top]\r\n[s]是[e]\r\n[s]否[e]\r\n`, "utf8");
  const compiled = compile(flow, "V3BE");
  const output = path.join(OUTPUT, "P5REssentials", "CPK", "EN.CPK", "FIELD", "MY_PALACE", "HIT", "MHIT_022_010.BF");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(compiled, output);
  return output;
}

function buildFhit() {
  const sourceDir = path.join(BUILD, "sources", "fhit");
  fs.mkdirSync(sourceDir, { recursive: true });
  const officialFlow = path.join(sourceDir, "official.flow");
  decompile(OFFICIAL_FHIT, officialFlow);
  const officialMsg = path.join(sourceDir, "official.msg");
  const flow = path.join(sourceDir, "FHIT_022_001_00.flow");
  const msg = path.join(sourceDir, "FHIT_022_001_00.msg");
  fs.copyFileSync(path.join(REFERENCE, "FIELD", "HIT", "FHIT_022_001_00.BF"), flow);
  let text = fs.readFileSync(officialMsg, "utf8");
  text = replaceMessage(text, "Arsene_MSG", "[msg Arsene_MSG [安娜塔西娅]]\r\n[s]ＲＯＳＥ的反抗意志产生的心之像。[n]辛德瑞拉的继妹为寻求真正的理解而蒙受耻辱，[n]却也因此得到了姐姐的爱。[n][w][e]");
  text = normalizeVisibleAscii(text);
  fs.writeFileSync(msg, text, "utf8");
  const compiled = compile(flow, "V3BE");
  const output = path.join(OUTPUT, "P5REssentials", "CPK", "EN.CPK", "FIELD", "HIT", "FHIT_022_001_00.BF");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(compiled, output);
  return output;
}

fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(OUTPUT, { recursive: true });
const outputs = [...rebuildNameTable(), buildMyth(), buildMhit(), buildFhit()];
console.log(JSON.stringify({ outputs }, null, 2));
