const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_FILE = path.join(ROOT, "translations", "catalog", "event_other.csv.gz");
const OVERRIDES_FILE = path.join(ROOT, "translations", "overrides.csv");
const UPDATED_AT = "2026-08-09T08:55:00.000Z";

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

function key(resource, msgId) {
  return `event_other\u0000${resource}\u0000${msgId}`;
}

function replaceHeader(line, speaker) {
  if (!speaker || line.startsWith("[sel ")) return line;
  const match = line.match(/^\[msg\s+(\S+)/);
  if (!match) throw new Error(`Unsupported header: ${line}`);
  return `[msg ${match[1]} [${speaker}]]`;
}

function replacePage(line, body) {
  const prefixMatch = line.match(/^((?:\[[^\]]+\])+)/);
  if (!prefixMatch) throw new Error(`Missing control-code prefix: ${line}`);
  const prefix = prefixMatch[1];
  let encodedBody = body
    .replaceAll("〔动态姓氏〕", "[f 4 1]")
    .replaceAll("〔动态名字〕", "[f 4 2]")
    .replaceAll("〔动态全名〕", "[f 4 3]");
  for (const token of ["[f 4 1]", "[f 4 2]", "[f 4 3]"]) {
    if (prefix.endsWith(token) && encodedBody.startsWith(token)) encodedBody = encodedBody.slice(token.length);
  }
  let suffixIndex = line.lastIndexOf("[f 1 ");
  let suffix;
  if (suffixIndex >= 0) suffix = line.slice(suffixIndex);
  else {
    suffixIndex = line.lastIndexOf("[e]");
    if (suffixIndex < 0) throw new Error(`Missing message suffix: ${line}`);
    suffix = line.slice(suffixIndex);
  }
  const separator = suffix.startsWith("[f 1 ") ? "[n]" : "";
  return `${prefix}${encodedBody}${separator}${suffix}`;
}

function rebuildMessage(source, speaker, pages) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  lines[0] = replaceHeader(lines[0], speaker);
  const pageIndexes = lines.map((line, index) => line.startsWith("[s]") ? index : -1).filter((index) => index >= 0);
  if (pageIndexes.length !== pages.length) {
    throw new Error(`${lines[0]} expected ${pageIndexes.length} translated pages, received ${pages.length}`);
  }
  pageIndexes.forEach((lineIndex, pageIndex) => { lines[lineIndex] = replacePage(lines[lineIndex], pages[pageIndex]); });
  return lines.join("\r\n");
}

const fixes = [
  ["EVENT_DATA/MESSAGE/E500/E511_010.BMD", "MSG_007_3_0", "芳泽 堇", ["太好了！", "姐姐，猜猜怎么了？就是今天！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_010.BMD", "MSG_010_0_0", "芳泽 堇", ["谢谢姐姐！能和姐姐一起去，[n]一定会很开心！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_030.BMD", "MSG_021_0_0", "芳泽 堇", ["对了，姐姐。[n]你刚才在神社许了什么愿？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_030.BMD", "MSG_025_0_0", "芳泽 堇", ["这才是我熟悉的姐姐。[n]总是把别人放在自己前面。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_030.BMD", "MSG_034_0_0", "芳泽 堇", ["姐姐也一起来吧。大家肯定也想见你。[n]跟我一起去车站吧！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_040.BMD", "MSG_002_0_0", "芳泽 伸一", ["霞！我的小星星！[n]见到你真是太好了！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_040.BMD", "MSG_002_0_1", "芳泽 伸一", ["霞！我的小星星！[n]见到你真是太好了！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_040.BMD", "MSG_003_0_0", "芳泽 堇", ["看吧，爸爸？姐姐一点都没变。", "她最近是安静了一些，[n]不过我们偶尔还是会一起训练。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_040.BMD", "MSG_014_0_0", "芳泽 堇", ["那我们走吧，姐姐！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_080.BMD", "MSG_033_0_0", "芳泽 堇", ["姐姐！？是我！", "我现在在台场，然后……呃……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_140.BMD", "MSG_005_0_0", "堇的声音", ["……姐姐？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_145.BMD", "MSG_009_0_0", "明智 吾郎", ["堇同学，你还能走吗？", "不管现在发生了什么，[n]想弄清真相，我们就必须继续前进。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_250.BMD", "MSG_001_0_0", "明智 吾郎", ["是我。我发现了一件事，[n]觉得应该马上告诉你。", "我联系了堇同学的教练打听情况，[n]她以为堇从昨天起就在『集训』。", "看来丸喜真的能随心所欲地[n]改变现实世界……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_270.BMD", "SEL_006_0_0", "", ["铃井学姐，你还好吗？", "最近过得怎么样？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_280.BMD", "MSG_000_0_0", "喜多川 佑介", ["你也来了啊，霞。[n]我正打算联系你。", "你看看。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_280.BMD", "MSG_020_0_0", "喜多川 佑介", ["霞，我……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_290.BMD", "MSG_000_3_0", "新岛 冴", ["霞，真巧。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_290.BMD", "MSG_007_0_0", "新岛 真", ["姐姐！", "我才没有缠着爸爸！[n]是他问我生日想吃什么！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_290.BMD", "SEL_013_0_0", "", ["完全没关系。", "我是来找学姐的。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_300.BMD", "MSG_023_0_0", "佐仓 双叶", ["你说对吧，霞？你也知道[n]惣治郎的咖喱有多好吃！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_310.BMD", "SEL_003_0_0", "", ["学姐在忙什么？", "是来谈生意的吗？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_310.BMD", "MSG_002_0_0", "奥村 春", ["哎呀，霞？没想到会在这里遇见你。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_310.BMD", "MSG_016_0_0", "奥村 春", ["霞，要不要一起做点什么？", "我们还有一点时间，[n]不如找个地方喝杯咖啡吧。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_390.BMD", "MSG_005_6_0", "芳泽 堇", ["姐姐也都亲眼看到了……[n]你的人生会变成这样，都是我的错……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_400.BMD", "MSG_012_0_0", "坂本 龙司", ["我们得先阻止她，对吧，ＲＯＳＥ？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_410.BMD", "MSG_015_0_0", "丸喜 拓人", ["不过在那之前，我想我们之间[n]应该还有商量的余地。", "而且现在比起解决这件事，[n]还是先照顾堇同学更重要。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_480.BMD", "MSG_044_0_0", "新岛 真", ["从霞告诉我们的情况来看，[n]我们和明智的最终目标确实一致，[n]但是……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_540.BMD", "MSG_019_0_0", "芳泽 堇", ["姐姐……我该怎么办？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_550.BMD", "MSG_008_0_0", "芳泽 堇", ["我不能再像依赖姐姐那样，[n]一直依赖别人……", "我想过自己选择的人生！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_550.BMD", "MSG_029_0_0", "高卷 杏", ["啊，对了！英文的『堇』就是[n]『ＶＩＯＬＥＴ』……听起来太棒了！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_550.BMD", "SEL_025_0_0", "", ["阿拉贝斯克。", "ＶＩＯＬＥＴ。", "食欲。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_566.BMD", "SEL_006_0_0", "", ["……", "真学姐说得也许没错……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_040.BMD", "MND_015_0_0", "", ["和家人一起度过了一段时光……", "……", "……这是梦吗……？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_070.BMD", "MND_033_0_0", "", ["摩尔加纳本该是一只猫……[n]而且若叶也不该出现在这里……", "还有昨天的爸爸妈妈……[n]这到底是怎么回事……？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_070.BMD", "MSG_045_0_0", "摩尔加纳", ["哦哦，原来如此！她这么害羞，[n]是因为要去约会啊！", "嘿嘿，开玩笑的。别担心……", "甜点就由吾辈来帮你看着。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_140.BMD", "MSG_000_0_0", "芳泽 霞", ["妈妈……", "是我……你的小星星……", "我想告诉你……爸爸那边正在准备。[n]他们会把爸爸送过来，让你们最后[n]还能在一起……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_250.BMD", "MSG_022_0_0", "摩尔加纳", ["吾、吾辈都道歉了！[n]怎么可能对女士做那种事！", "虽然……也不是第一次了吧？[n]吾辈趴在你身上时，你总是很讨厌……", "等等……趴在你身上……？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_345.BMD", "MSG_023_0_0", "坂本 龙司", ["……就是啊。", "霞一定是想告诉我们什么重要的事，[n]而且她现在肯定还在某处为此努力。", "我绝不会丢下她，[n]只顾着逃避……不管那是什么。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_350.BMD", "MSG_031_5_0", "芳泽 堇", ["为什么……已经这么痛苦了，[n]为什么还不能让我逃避！？", "我只会拖累姐姐……[n]姐姐的人生被毁，全都是我的错！", "我不想过那样的人生！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_430.BMD", "MSG_007_0_0", "喜多川 佑介", ["而且，他救了你的命，[n]可你那天却又遇上了狮童……", "一下子发生这么多事，[n]我实在无法接受。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "MSG_017_0_0", "丸喜 拓人", ["原来如此……", "更准确地说，应该问：[n]『你们两人还有疑问吗？』"]],
  ["EVENT_DATA/MESSAGE/E500/E511_320.BMD", "SEL_022_0_0", "", ["这个世界是错的。这不是真正的幸福。", "我只是希望他们幸福……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_559.BMD", "MSG_005_0_0", "摩尔加纳", ["再仔细看看。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_060.BMD", "SEL_005_0_0", "", ["变、变态！滚出我的房间！", "你、你在这里做什么！？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_250.BMD", "SEL_002_0_0", "", ["太可怕了……", "难以相信这一切都是他造成的……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_080.BMD", "SEL_010_0_0", "", ["这背后一定还有隐情。", "他们说你是无辜的……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_570.BMD", "MSG_000_0_0", "丸喜 拓人", ["谢谢你们能来。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_470.BMD", "SEL_002_0_0", "", ["该道谢的是我。", "不来才失礼。", "请别这么见外。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_562.BMD", "MSG_000_6_0", "丸喜 拓人", ["这样啊……不，这是个好消息。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "MSG_000_6_0", "丸喜 拓人", ["这样啊……不，这是个好消息。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_559.BMD", "MSG_014_0_0", "坂本 龙司", ["我们才不会那么做！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "SEL_074_0_0", "", ["我说错了。", "我不想失去你……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_110.BMD", "SEL_001_0_0", "", ["我们只是对这里有点好奇。", "你们的主人是谁？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_300.BMD", "MSG_038_3_0", "一色 若叶", ["咦——喂！双叶！别突然跑掉啊！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_320.BMD", "MSG_024_0_0", "明智 吾郎", ["这不叫幸福。他只是在操控他们，[n]给他们编造漂亮的谎言。", "要是你打算逃避，就尽早告诉我。[n]我可不想关键时刻再出什么意外。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "MSG_019_0_0", "摩尔加纳", ["明智……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_220.BMD", "MSG_008_0_0", "明智 吾郎", ["『她的愿望』吗？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_553.BMD", "MSG_003_0_0", "芳泽 堇", ["什么！？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_620.BMD", "MSG_009_0_0", "丸喜 拓人", ["没有任何人会受苦……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_615.BMD", "SEL_005_0_0", "", ["来跳最后一支舞吧。", "对不起，丸喜先生。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_270.BMD", "MSG_026_0_0", "高卷 杏", ["有件事……我记得自己曾经被逼到[n]甚至想过一死了之，[n]可后来我遇见了大家，然后……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_030.BMD", "SEL_022_0_0", "", ["希望自己变得更优秀。", "希望朋友们幸福。", "希望成为更有魅力的女性。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_030.BMD", "SEL_033_0_0", "", ["爸爸？你在说什么？", "我没听错吧……？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_040.BMD", "SEL_006_0_0", "", ["好、好啊……", "听、听起来真不错……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_070.BMD", "SEL_052_0_0", "", ["你也感觉到了？", "这一切都不对劲！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_080.BMD", "SEL_027_0_0", "", ["我们一起面对。", "有什么计划吗，明智先生？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_250.BMD", "SEL_009_0_0", "", ["这么说，丸喜就是……", "谢谢你，明智先生。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_260.BMD", "SEL_010_0_0", "", ["最近顺利吗？", "能重返田径场真是太好了。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_280.BMD", "SEL_009_0_0", "", ["斑目先生听起来真体贴……", "没有比这更好的事了。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_280.BMD", "SEL_016_0_0", "", ["我相信你。", "一定能成为优秀的作品。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_290.BMD", "SEL_024_0_0", "", ["已经很接近了……", "我相信你。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_300.BMD", "SEL_024_0_0", "", ["这是惣治郎做的吗？", "这是他的拿手菜！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_320.BMD", "SEL_001_0_0", "", ["请告诉我们吧。", "当然。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_320.BMD", "SEL_005_0_0", "", ["他的研究陷入了停滞。", "是什么阻碍了他？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_320.BMD", "SEL_010_0_0", "", ["他们不只是认知存在吗？", "什么意思？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_330.BMD", "SEL_002_0_0", "", ["看起来很顺利。", "我有点担心他们……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_350.BMD", "SEL_022_5_0", "", ["我需要考虑一下。", "对不起，明智先生。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_390.BMD", "SEL_003_0_0", "", ["请住手。", "我不想再和你战斗了。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_480.BMD", "SEL_015_0_0", "", ["还有宝物等着我们去偷。", "潜入宫殿吧。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_520.BMD", "SEL_040_0_0", "", ["是我们在无意识中许下了愿望。", "丸喜先生听见了我们的愿望……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_520.BMD", "SEL_078_0_0", "", ["他还是想要『拯救』我们。", "他并不想伤害我们。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_560.BMD", "SEL_005_0_1", "", ["还没有。", "不……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_560.BMD", "SEL_012_0_0", "", ["好，见面吧。", "没错。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_562.BMD", "SEL_003_0_0", "", ["要是真有就好了……", "我们不会接受虚假的现实。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_562.BMD", "SEL_005_0_0", "", ["……你也失去过重要的人，对吧？", "就像留美小姐那样？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_562.BMD", "SEL_029_5_0", "", ["我需要再想想。", "我已经决定了。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_562.BMD", "SEL_033_0_0", "", ["等等，这是你的。", "你是不是忘了什么？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "SEL_003_0_0", "", ["要是真有就好了……", "我们不会接受虚假的现实。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "SEL_005_0_0", "", ["……你也失去过重要的人，对吧？", "就像留美小姐那样？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "SEL_023_0_0", "", ["明智先生……？", "我们两个人？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "SEL_036_0_0", "", ["你发现了吗？", "你早就知道了……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "SEL_047_0_0", "", ["等等，这是你的。", "你是不是忘了什么？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "SEL_056_0_0", "", ["我不想让你死。", "可是那样的话，你就会……！", "……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "SEL_060_0_0", "", ["这根本不是什么『小事』！", "事情没那么简单！我做不到……", "明智先生，求你了……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_563.BMD", "SEL_069_0_0", "", ["我们会夺走丸喜的心。", "我不能让你死。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_565.BMD", "SEL_005_0_0", "", ["只能继续向前了。", "该结束这一切了。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_570.BMD", "SEL_002_0_0", "", ["已经没有『如果』了。", "我们现在已经不再迷惘。", "抱歉，最后还是走到了这一步。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_625.BMD", "SEL_012_0_0", "", ["我们一起回去。", "我不会让事情就这样结束。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_630.BMD", "SEL_013_0_0", "", ["必须调查印象空间。", "这里暂时已经没事了。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_010.BMD", "MSG_001_0_0", "芳泽 堇", ["早上好，〔动态名字〕。", "你还在睡吗？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_070.BMD", "MSG_034_0_0", "一色 若叶", ["怎么了，〔动态名字〕？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_070.BMD", "MSG_046_0_0", "摩尔加纳", ["你现在是这么说，等她回来发现甜点没了，[n]肯定会怀疑是家里人干的。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_080.BMD", "MSG_024_0_0", "明智 吾郎", ["你居然会这么谨慎，真不像平时的作风。[n]不过我们现在恐怕没有时间慢慢来了。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_080.BMD", "MSG_037_0_0", "芳泽 堇", ["〔动态名字〕，虽然有点突然……[n]你现在能马上来台场吗？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_090.BMD", "MSG_000_0_0", "芳泽 堇", ["〔动态名字〕！还有……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_120.BMD", "MSG_009_0_0", "明智 吾郎", ["除非你们受不了和一个『毫不留情的人』[n]并肩作战。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_210.BMD", "MSG_038_0_0", "芳泽 堇", ["对不起，〔动态名字〕……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_020.BMD", "MSG_003_0_0", "佐仓 惣治郎", ["今后也请你和双叶，还有我好好相处。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_020.BMD", "MSG_013_0_0", "佐仓 惣治郎", ["我是谁？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_060.BMD", "MSG_009_0_0", "佐仓 惣治郎", ["你们两个还在睡吗？再不下来，[n]午饭可就要凭空消失了……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_150.BMD", "MSG_009_0_0", "采访者", ["太棒了！", "最后一个问题——趁现在这个机会，[n]你有没有什么话想对谁说？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_250.BMD", "SEL_024_0_0", "", ["沿着这个思路继续想。", "拜托了，摩尔加纳。我知道你能做到。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_320.BMD", "MSG_006_0_0", "新岛 真", ["很有可能。", "不过以我们目前掌握的情况，[n]还不能确定原因。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_345.BMD", "MSG_004_0_0", "佐仓 双叶", ["所以，她不在这里吗？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_390.BMD", "MSG_004_0_0", "芳泽 堇", ["〔动态名字〕……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_393.BMD", "MSG_011_0_0", "芳泽 堇", ["不，我……我做不到……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_480.BMD", "MSG_030_0_0", "明智 吾郎", ["我没有进行过任何形式的电子监视。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_540.BMD", "MSG_023_7_0", "芳泽 堇", ["〔动态名字〕，你有时候真的很坚决……", "不过你说得完全正确。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_550.BMD", "MSG_022_0_0", "坂本 龙司", ["总不能只有你一个人用真名吧？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_560.BMD", "MSG_004_0_1", "芳泽 堇", ["嗯！", "对了，〔动态名字〕……[n]我有件事想问你。", "丸喜老师联系过你吗？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_620.BMD", "MSG_002_0_0", "丸喜 拓人", ["所以，为什么！？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_030.BMD", "MSG_025_0_0", "芳泽 堇", ["这才是我熟悉的〔动态名字〕。[n]总是把别人放在自己前面。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_040.BMD", "MSG_003_0_0", "芳泽 堇", ["看吧，爸爸？〔动态名字〕一点都没变。", "她最近是安静了一些，[n]不过我们偶尔还是会一起训练。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_040.BMD", "MSG_014_0_0", "芳泽 堇", ["那我们走吧，〔动态名字〕！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_135.BMD", "MSG_002_0_0", "芳泽 堇", ["这声音……", "等等……是〔动态名字〕吗？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_140.BMD", "MSG_005_0_0", "堇的声音", ["……〔动态名字〕？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_140.BMD", "MSG_007_0_0", "", ["天啊……不能让堇看到我这副样子……", "振作一点，〔动态名字〕……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_210.BMD", "MSG_014_0_0", "芳泽 堇", ["〔动态名字〕被捕后、我进入秀尽学园前，[n]我接受了丸喜老师的心理咨询。", "那时，我对他说……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_210.BMD", "MSG_015_0_0", "芳泽 堇", ["如果〔动态名字〕的梦想因为我而无法实现……", "那我想变得和〔动态名字〕一样，[n]替她实现梦想。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_280.BMD", "MSG_000_0_0", "喜多川 祐介", ["你也来了啊，〔动态名字〕。[n]我正打算联系你。", "你看看。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_300.BMD", "MSG_023_0_0", "佐仓 双叶", ["你说对吧，〔动态名字〕？你也知道[n]惣治郎的咖喱有多好吃！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_310.BMD", "MSG_002_0_0", "奥村 春", ["哎呀，〔动态名字〕？[n]没想到会在这里遇见你。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_310.BMD", "MSG_016_0_0", "奥村 春", ["〔动态名字〕，要不要一起做点什么？", "我们还有一点时间，[n]不如找个地方喝杯咖啡吧。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_350.BMD", "MSG_022_3_0", "明智 吾郎", ["不……〔动态名字〕，告诉我你不是认真的……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_350.BMD", "MSG_028_0_0", "芳泽 堇", ["你不是认真的，对吧？拜托了……[n]求求你，〔动态名字〕……[n]我不想这样活下去！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_390.BMD", "MSG_005_6_0", "芳泽 堇", ["〔动态名字〕也都亲眼看到了……[n]你的人生会变成这样，都是我的错……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_480.BMD", "MSG_044_0_0", "新岛 真", ["从〔动态名字〕告诉我们的情况来看，[n]我们和明智的最终目标确实一致，[n]但是……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_520.BMD", "MSG_023_0_0", "奥村 春", ["这么说，丸喜改变堇同学的[n]性格和记忆也是……", "还有他为了救〔动态名字〕的命，[n]而对堇同学做的事……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_565.BMD", "MSG_004_5_0", "坂本 龙司", ["我们要去宫殿找丸喜算账，[n]然后回到原本的现实——[n]对吧，〔动态名字〕？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_030.BMD", "MSG_023_0_0", "新岛 真", ["呵呵，毕竟我们刚刚遇见了大家——[n]说不定那就是你的愿望！"]],
  ["EVENT_DATA/MESSAGE/E500/E511_080.BMD", "MSG_011_0_0", "明智 吾郎", ["我同意。不管怎么解释，[n]我获释这件事都实在太不寻常了。"]],
  ["EVENT_DATA/MESSAGE/E500/E511_080.BMD", "SEL_014_0_0", "", ["一色小姐……", "摩尔加纳……"]],
  ["EVENT_DATA/MESSAGE/E500/E511_290.BMD", "SEL_019_0_0", "", ["你和冴小姐相处得好吗？", "爸爸支持你吗？"]],
  ["EVENT_DATA/MESSAGE/E500/E511_320.BMD", "SEL_028_0_0", "", ["和明智先生去体育馆。", "和明智先生去台场。"]],
];

const catalogRows = parseCsv(zlib.gunzipSync(fs.readFileSync(CATALOG_FILE)).toString("utf8"));
const catalog = new Map(catalogRows.map((row) => [key(row.resource_key, row.msg_id), row]));
const overrides = parseCsv(fs.readFileSync(OVERRIDES_FILE, "utf8"));
const indexes = new Map(overrides.map((row, index) => [key(row.resource_key, row.msg_id), index]));

for (const [resource, msgId, fixedSpeaker, pages] of fixes) {
  const record = catalog.get(key(resource, msgId));
  if (!record) throw new Error(`Catalog row not found: ${resource} ${msgId}`);
  const finalZh = rebuildMessage(record.mod_text, fixedSpeaker, pages);
  const output = { category: "event_other", resource_key: resource, msg_id: msgId, final_zh: finalZh, updated_at: UPDATED_AT, compiled_at: "" };
  const existingIndex = indexes.get(key(resource, msgId));
  if (existingIndex === undefined) {
    indexes.set(key(resource, msgId), overrides.length);
    overrides.push(output);
  } else overrides[existingIndex] = output;
}

const headers = ["category", "resource_key", "msg_id", "final_zh", "updated_at", "compiled_at"];
const body = overrides.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\r\n");
fs.writeFileSync(OVERRIDES_FILE, `\ufeff${headers.join(",")}\r\n${body}\r\n`, "utf8");
console.log(JSON.stringify({ fixed: fixes.length, overrides: overrides.length }, null, 2));
