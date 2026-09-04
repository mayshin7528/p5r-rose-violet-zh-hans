const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CATALOG = path.join(ROOT, "translations", "catalog");
const OVERRIDES = path.join(ROOT, "translations", "overrides.csv");
const REPORT = path.join(ROOT, "docs", "reports", "最终汉化修复明细_20260809.csv");
const SPEAKER_REPORT = path.join(ROOT, "docs", "reports", "说话人标签修复明细_20260809.csv");
const UPDATED_AT = "2026-08-09T08:00:00.000Z";

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
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

function rowKey(row) {
  return [row.category, row.resource_key, row.msg_id].join("\u0000");
}

function shortKey(row) {
  return `${row.resource_key}|${row.msg_id}`;
}

function visible(text) {
  return String(text || "")
    .replace(/^\[(?:msg|sel)\s+[^\r\n]+\]\s*/m, "")
    .replace(/\[f 4 1\]/g, "〔动态姓氏〕")
    .replace(/\[f 4 2\]/g, "〔动态名字〕")
    .replace(/\[f 4 3\]/g, "〔动态全名〕")
    .replace(/\[fName\]/g, "〔动态名字〕")
    .replace(/\[sumi[^\]]*\]/g, "堇")
    .replace(/\[n\]/g, "\n")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function speakerOf(text) {
  return String(text || "").split(/\r?\n/, 1)[0].match(/\[([^\[\]]+)\]\]$/)?.[1] || "";
}

function replaceSpeaker(text, translatedSpeaker) {
  const lines = String(text || "").split(/\r?\n/);
  lines[0] = lines[0].replace(/\s+\[[^\[\]]+\]\]$/, ` [${translatedSpeaker}]]`);
  return lines.join("\r\n");
}

const fixes = new Map(Object.entries({
  "EVENT_DATA/MESSAGE/E100/E114_001.BMD|SEL_003_0_0": [
    "和我共舞吧，安娜塔西娅！",
    "让我再见到她……！",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_007.BMD|MSG_011_0_0": [
    "对了。二年级是去电视台参加社会实践的。",
    "这么说，我们俩都是在电视台遇见你的。真是奇妙的巧合！",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_040.BMD|MSG_009_0_0": [
    "班上也是这样。因为我是特招生，大家常常对我有所顾忌。",
    "学校也期待我在接下来的比赛中取得好成绩。",
    "他们甚至说，清扫活动我不参加也没关系……",
    "可我就是不喜欢被特殊对待。",
    "唉……全校都在为我们的事大惊小怪……为什么就不能让我们清静一点呢？",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_050.BMD|MSG_001_0_0": [
    "我正想找你，可是不知道你在哪个班……",
    "明天考试结束后，如果你有时间，要不要一起去涩谷逛逛？",
    "我还没什么机会在市区走走，所以想和你一起去。",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_050.BMD|MSG_003_0_0": [
    "太好了！",
    "那考试结束后，我去你的教室找你。",
    "明天见！",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_060.BMD|MSG_001_0_0": [
    "谢谢你今天陪我过来。",
    "我们已经很久没像这样一起逛街了吧？",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_060.BMD|MSG_003_0_0": [
    "嗯……其实我本来不想提这件事……",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_060.BMD|MSG_004_0_0": [
    "我本来想早点问你的，可最近学校和训练都太忙了……",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_060.BMD|MSG_012_0_0": [
    "啊，是花店！这些花真漂亮！",
    "[f 4 2]很喜欢花吧？小时候还经常把花别在头发上呢。",
    "这么一想，你的发带也有点像花……",
    "也许我也该像你一样扎个马尾。",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_060.BMD|MSG_021_0_0": [
    "我吗？我是没关系，不过……",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_060.BMD|MSG_024_0_0": [
    "算了，当我没说吧。反正也不是什么重要的事。",
    "今天还是要谢谢你。和你一起逛，果然开心多了。",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_060.BMD|MSG_026_0_0": [
    "以后有机会再一起逛街吧？",
    "明天学校见！",
  ],
  "EVENT_DATA/MESSAGE/E400/E482_070.BMD|MSG_004_0_0": [
    "谢谢你！你还在这里，我就放心……",
    "啊……我是说……我今天晚些时候还要训练，得先去拿运动服……",
    "那我们在商场门口见吧！",
  ],
  "EVENT_DATA/MESSAGE/E400/E483_091.BMD|MSG_011_0_0": [
    "那时正好赶上身体发育，我本来就很难适应……",
    "但因为姐姐一直陪在我身边，我才能坚持下去……",
  ],
  "EVENT_DATA/MESSAGE/E400/E485_070.BMD|MSG_013_5_0": [
    "在我看来，真正有问题的是你们两个人的午餐。",
    "想锻炼好身体，就得认真吃饭。你们真的该改善一下饮食了。",
    "尤其是你，[f 4 2]。最近真的太放纵自己了。",
  ],
  "EVENT_DATA/MESSAGE/E400/E485_340.BMD|MSG_036_0_0": [
    "谢谢你！",
  ],
  "EVENT_DATA/MESSAGE/E700/E703_090.BMD|MSG_033_2_0": [
    "我原以为，你很中意和杉村的婚事……",
    "所以我才坚持要尽快完婚，好让你得到足够的支持……",
    "不过看来，[f 4 1]同学才是一直支持着你的人。",
    "能有这么好的朋友，你真是有福气。",
  ],
  "EVENT_DATA/MESSAGE/E700/E704_080.BMD|MSG_039_0_0": [
    "听我说，我以前在田径社的时候，也和你差不多。",
    "我就想证明自己、赢下比赛，还想让女孩子们喊我『坂本学长』什么的……",
    "无意冒犯啊，[f 4 2]……",
    "但就算怀着那些心思……我也确实想为队友出一份力。",
    "跑步虽说是个人项目，可要是没有想去鼓舞的队友，谁会拼到吐还继续跑啊。",
    "我真正想说的是，想要成功，就不能只为了自己，也得为别人做点什么。",
  ],
  "EVENT_DATA/MESSAGE/E700/E718_072.BMD|MSG_006_0_0": [
    "说到底，我大概只是想向所有人证明，我不是什么一无是处的废物。",
    "尤其是你，[f 4 1]同学。我一直想为泄露你的犯罪记录向你道歉。",
    "即使知道我对你做过什么，你却始终对我那么温柔。",
    "我、我知道你大概不会有同样的感觉……可、可我真的很喜欢你。",
    "你是第一个愿意接受真实的我的女孩……",
    "可我一直害怕你会发现，我不过是个一无是处的废物……就像秋山说的那样……",
    "我原以为……只要像你们一样出名，让你对我刮目相看……说不定你也会喜欢上我。",
    "结果却变成了这样……",
    "我只是个自私的失败者，拼命攀附着你们的人气……",
    "我根本不配与英勇的怪盗团并肩作战。",
    "我也配不上你。居然妄想你会喜欢我这种无名小卒，真是太蠢了……",
    "……总之，谢谢你一直以来的照顾！再见！",
  ],
  "EVENT_DATA/MESSAGE/E700/E718_072.BMD|MSG_014_0_0": [
    "不过，我不想再让网站只是用来宣传了。",
    "最重要的是，它应该成为真正陷入困境之人的避风港。",
    "经历过鸭志田的事后，我知道要站出来反抗不公有多难……",
    "所以……只要还有向怪盗团求助的声音，我就会帮他们把声音传达出去。",
    "还有，[f 4 1]同学……即使你对我没有同样的感觉……",
    "谢谢你没有放弃我……也谢谢你让我明白了什么才是重要的。",
  ],
  "EVENT_DATA/MESSAGE/E700/E722_032.BMD|MSG_011_0_0": [
    "我给你准备了能缓解疲劳的鸡肉和鸡蛋，还加了豆类，配的是糙米。",
    "你毕竟还是体操选手，必须控制体重。高蛋白、低脂肪才是原则！",
    "当然，还有补充体力的铁，以及恢复精力的维生素Ｂ！",
  ],
  "EVENT_DATA/MESSAGE/E500/E511_135.BMD|MSG_002_0_0": [
    "这声音……",
    "等等……是你吗，[f 4 2]？",
  ],
  "EVENT_DATA/MESSAGE/E500/E511_520.BMD|MSG_088_0_0": [
    "等她整理好自己的心情后，我们再把这边的情况告诉她吧。",
    "知道这些以后要怎么做，就由她自己决定。",
    "而且……[f 4 2]和她之间，应该也有很多话要说。",
  ],
  "EVENT_DATA/MESSAGE/E500/E511_562.BMD|MSG_000_8_0": [
    "……你知道吗，我也希望事实真是如此。",
    "可是人不可能永远坚强下去，[f 4 1]同学。",
    "有你帮助，她或许还能多坚持一阵子，可等她到达极限时……",
  ],
  "EVENT_DATA/MESSAGE/E500/E511_563.BMD|MSG_000_8_0": [
    "……你知道吗，我也希望事实真是如此。",
    "可是人不可能永远坚强下去，[f 4 1]同学。",
    "有你帮助，她或许还能多坚持一阵子，可等她到达极限时……",
  ],
  "EVENT_DATA/MESSAGE/E800/E826_221.BMD|MSG_004_0_0": [
    "嗯……应该是吧。",
    "说起来，姐姐一直都不太擅长应付高处……",
    "不过既然是姐姐带我来的，看来现在已经没事了。",
  ],
  "EVENT_DATA/MESSAGE/E800/E826_221.BMD|MSG_005_0_0": [
    "这、这当然会被骂吧？而且……",
    "说起来，姐姐一直都不太擅长应付高处……",
    "别担心，只要我们别乱动，它就不会摇起来。",
  ],
  "EVENT_DATA/MESSAGE/E300/E393_014.BMD|SEL_032_0_0": [
    "希望如此……",
    "这是为了我们的梦想。",
    "我还想再见妹妹一面……",
  ],
  "EVENT_DATA/MESSAGE/E600/E696_001.BMD|SEL_557_0_0": [
    "没什么特别的。",
    "堇呢？",
  ],
  "EVENT_DATA/MESSAGE/E800/E826_221.BMD|SEL_002_0_0": [
    "我、我知道，妹妹……",
    "可你不是很擅长应付高处吗……",
    "那就别摇了。",
  ],
  "FIELD/PARTY/SUPPORT|FIND_SEED_PC10_mes01": [
    "ＲＯＳＥ，这里有欲石！要拿走吗？",
  ],
  "FIELD/NPC/FNPC192_015_00|SAFETY_MES_YOSHIZAWA_11_": [
    "谢谢你带我一起来，ＲＯＳＥ！我保证不会拖后腿！",
  ],
  "FIELD/KF_EVENT/NPC/ENPC127_202_00|MSG_013_0_0": [
    "你是说我们学校那个有前科的女生吗？听说要是被她盯上就糟了……",
    "听说她会给人注射药物，再把人卖给出价最高的买家……这是真的吗？",
  ],
  "FIELD/NPC/FNPC002_002_02|MSG_GRT_main_All_001_04_": [
    "听说有个因伤害罪被起诉的女生，转学到二年级了……",
  ],
  "FIELD/NPC/FNPC002_002_02|MSG_GRT_main_All_501_05_": [
    "听说有个因伤害罪被起诉的女生，转学到二年级了……",
  ],
  "FIELD/NPC/FNPC002_002_02|MSG_NEWSTUDENT_F01_006_0_2": [
    "出了那个可怕的女生和鸭志田的事，谁还能专心考试啊……",
  ],
  "EVENT_DATA/MESSAGE/E700/E707_050.BMD|MSG_002_0_0": [
    "池田学长！最近怎么样？",
  ],
  "EVENT_DATA/MESSAGE/E700/E707_050.BMD|MSG_007_0_0": [
    "嗯，还过得去……",
    "学长呢？还在跑步吗？",
  ],
  "EVENT_DATA/MESSAGE/E700/E713_090.BMD|MSG_006_0_0": [
    "他是美和的主治医生。",
    "正好是我大学时的学长。",
    "因为药已经快要完成了，我就把一切都告诉了他。",
  ],
  "CAMP/CHAT/SCRIPTCHAT_184|MSG_000_0_0": [
    "我在论坛上找到一个蛮不讲理的男性投诉者。",
    "听说他冲进一家饰品店，大闹了一场。",
    "『我把这家店的东西送给女朋友，结果她却把我甩了！』",
    "……这关店家什么事啊？怎么看都是他自己的问题吧。",
  ],
  "CAMP/CHAT/SCRIPTCHAT_199|MSG_009_0_0": [
    "这家伙肯定把杏大人惹得比平时更火大了。",
    "好，[fName]。我们一定要让他改心！",
  ],
  "CAMP/CHAT/SCRIPTCHAT_201|MSG_000_0_0": [
    "我在论坛上找到一个蛮不讲理的男性投诉者。",
    "听说他冲进一家饰品店，大闹了一场。",
    "『我把这家店的东西送给女朋友，结果她却把我甩了！』",
    "……这关店家什么事啊？怎么看都是他自己的问题吧。",
  ],
  "CAMP/CHAT/SCRIPTCHAT_267|MSG_004_0_0": [
    "她的艺名叫『明星璃璃奈』。不过说实话，她看起来很规矩。",
    "没有强迫消费，也没有欺骗粉丝。",
    "导航也没有反应。",
    "要我猜的话，这次有问题的应该是她父亲。",
    "听说他每天都会去秋叶原。要不要过去看看？",
  ],
  "CAMP/CHAT/SCRIPTCHAT_273|MSG_004_0_0": [
    "那个男人名叫源那绪。",
    "他很小就失去了双亲，从那以后一直照顾妹妹。",
    "为了养活两个人，他一直拼命打工，可是……",
    "现在他却恨妹妹恨得受不了。",
    "妹妹是他唯一的家人，可他控制不了自己的情绪。",
    "有一次他气昏了头，推了妹妹一把，结果她没站稳……",
    "……听说受了很重的伤。",
    "那本来只是一场不幸的意外，可他无法接受……",
  ],
  "CAMP/CHAT/SCRIPTCHAT_273|MSG_007_0_0": [
    "妹妹好像已经没事了。",
    "可他觉得下次未必还能这么幸运，所以宁可让人杀了自己。",
  ],
  "CAMP/CHAT/SCRIPTCHAT_274|MSG_000_0_0": [
    "那个请求我们『杀了他』的委托人把委托撤下了！",
    "那对兄妹本来要被分开，可是……",
    "他的妹妹坚决反对，所以这件事最后取消了。",
    "她有时虽然会害怕哥哥，但依然爱他，也很感谢他。",
  ],
  "CAMP/CHAT/SCRIPTCHAT_274|MSG_001_0_0": [
    "喂……",
    "这和那个男人在印象空间里说的话几乎一模一样。",
    "他们兄妹之间果然心意相通啊。就像你和堇一样！",
  ],
  "CAMP/CHAT/SCRIPTCHAT_274|SEL_003_0_0": [
    "我也感同身受，所以真替他们高兴！",
    "学长，你在哭吗？",
  ],
  "CAMP/CHAT/SCRIPTCHAT_361|MSG_004_00": [
    "对吧？",
    "杏，你能试着问问他吗？面对女孩子，他应该不会那么戒备。",
  ],
  "EVENT_DATA/MESSAGE/E100/E192_001.BMD|MSG_008_0_0": [
    "杏大人真的没问题吗！？要是他把她拉到哪幅画后面，想做什么奇怪的事怎么办？",
  ],
  "EVENT_DATA/MESSAGE/E400/E483_110.BMD|MSG_019_0_0": [
    "运动员……你是说[f 4 2]的妹妹吗？她也在参加艺术体操比赛。",
  ],
  "EVENT_DATA/MESSAGE/E400/E483_110.BMD|MSG_021_0_0": [
    "这么说，你们以前是艺术体操搭档？有个双胞胎妹妹，感觉一定很棒吧。",
    "不过她现在只能独自参赛……就算有你支持她，应该也很辛苦吧。",
    "对了……",
    "她不是要参加夏季大会吗？还是已经结束了？",
  ],
  "EVENT_DATA/MESSAGE/E400/E483_110.BMD|MSG_022_0_0": [
    "啊，关于那件事……",
    "，你应该已经知道了，希望你别介意我说出来……",
  ],
  "FIELD/INIT/FINI_002_001|MSG_NIGHT_0918_000_00": [
    "春可是他的亲生女儿！他怎么能把她当成自己的物品……",
    "身为怪盗团，制裁他就是我们的职责！",
  ],
  "FIELD/INIT/FINI_002_006|MSG_NIGHT_0918_000_00": [
    "春可是他的亲生女儿！他怎么能把她当成自己的物品……",
    "身为怪盗团，制裁他就是我们的职责！",
  ],
  "FIELD/INIT/FINI_003_002|MSG_NIGHT_0918_000_00": [
    "春可是他的亲生女儿！他怎么能把她当成自己的物品……",
    "身为怪盗团，制裁他就是我们的职责！",
  ],
  "FIELD/INIT/FINI_009_002|MSG_NIGHT_0918_000_00": [
    "春可是他的亲生女儿！他怎么能把她当成自己的物品……",
    "身为怪盗团，制裁他就是我们的职责！",
  ],
  "FIELD/KF_EVENT/NPC/ENPC141_307_00|MSG_141_307_12": [
    "她大概是故意不想在学校和他说话，好显摆自己把他玩弄于股掌之间吧？呕……真恶心。",
  ],
  "FIELD/KF_EVENT/NPC/ENPC228_101_00|MSG_E22810100_006_00": [
    "她说你的朋友无处可去，问我能不能暂时收留他。",
    "她大概觉得让你自己来开口太难为情了。只要你们安分点，我没意见。",
    "嗯……那口锅放哪儿了？你在附近找找。",
  ],
  "FIELD/KF_EVENT/NPC/ENPC793_101_00|MSG_E79310100_863_000_00": [
    "啊，我听说过她……不过私人诊所还是离远点比较好。",
    "大型医院好得多，优秀的医生也更多。",
    "我的主治医生就在大医院工作。他医术很好，至少给人的感觉很可靠。",
  ],
  "EVENT_DATA/MESSAGE/E700/E710_010.BMD|MSG_020_0_0": [
    "你听好了。这个世上有些命运，是无论如何也逃不掉的。",
    "你男友心中的恶魔……不是普通人的办法能够驱除的。",
    "命运……是绝对的。",
    "不、不过，如果再买一块神圣之石，或许能压住那个恶魔的脾气……",
    "……",
  ],
  "EVENT_DATA/MESSAGE/E200/E234_001.BMD|MSG_007_0_0": [
    "哦，原来你喜欢龙司这种类型啊！",
    "龙司有时是有点闹腾，不过熟悉以后，人其实不坏。",
    "总之，我会支持你的！",
  ],
  "EVENT_DATA/MESSAGE/E200/E234_001.BMD|MSG_008_0_0": [
    "佑介！？",
    "他是有点……奇怪……不过也算有自己的魅力吧！",
    "总之，我会支持你的！",
  ],
  "EVENT_DATA/MESSAGE/E400/E452_001.BMD|MSG_029_3_0": [
    "它先培养诡骗师，再利用拒绝救世主的民众，将她推入绝望。",
    "这大概就是它把一切威胁扼杀在萌芽中的手段。",
    "现在回想起来，当我被分裂时，也曾对『更生』这个词感到违和。",
  ],
  "EVENT_DATA/MESSAGE/E400/E485_070.BMD|MSG_024_0_0": [
    "这一切都多亏了[f 4 2]和她的朋友们。",
    "她们让我有机会重新思考……或者说，给了我正面面对问题的勇气。",
  ],
  "EVENT_DATA/MESSAGE/E700/E702_030.BMD|MSG_010_5_0": [
    "我只是请她陪我去办点事。仅此而已。",
  ],
  "EVENT_DATA/MESSAGE/E700/E729_012.BMD|MSG_040_3_0": [
    "……看来这分量对她来说确实太勉强了。没办法，我们也来帮忙吧。",
  ],
  "EVENT_DATA/MESSAGE/E700/E731_001.BMD|MSG_999_2_1": [
    "下次要不要问她借笔记呢……",
  ],
  "EVENT_DATA/SCRIPT/E700/E731_001|MSG_003_0_2": [
    "下次要不要问她借笔记呢……",
  ],
  "EVENT_DATA/MESSAGE/E300/E357_001.BMD|MSG_048_5_0": [
    "是我自己拜托他们的！",
    "所以[f 4 2]才会来救我！是她偷走了我的心！",
  ],
  "EVENT_DATA/MESSAGE/E300/E369_001.BMD|MSG_025_0_0": [
    "我就说号码是姐姐给我的。严格来说，这也不算说谎。",
    "双叶，能把那个号码发给我吗？",
  ],
  "EVENT_DATA/MESSAGE/E500/E511_090.BMD|MSG_005_0_0": [
    "如果我告诉你，我和她拥有相同的力量，你能理解现在的情况吗？",
  ],
  "EVENT_DATA/MESSAGE/E500/E521_012.BMD|MSG_026_0_0": [
    "别说了……先是妈妈，现在连摩尔加纳也——",
  ],
  "EVENT_DATA/MESSAGE/E500/E521_030.BMD|MSG_024_0_0": [
    "就我个人而言……我还曾想诱骗她买下那块假石头。",
  ],
  "EVENT_DATA/MESSAGE/E300/E310_102.BMD|SEL_344_0_0": [
    "假装是她们的男朋友。",
    "还是算了。",
  ],
  "FIELD/NPC/FNPC002_002_01|MSG_SINBUNJYOSI_009_4_0": [
    "最近各社团的大赛结果陆续公布，排球社里也是有人欢喜有人愁。",
    "鸭志田的丑闻让秀尽名誉受损，他们应该也很难熬吧……",
    "听说你妹妹要参加艺术体操比赛。我很期待她的表现。",
  ],
}));

function blocks(raw) {
  return String(raw || "").match(/\[s\][\s\S]*?(?=(?:\r?\n)+\[s\]|$)/g) || [];
}

function rebuild(modRaw, currentRaw, translations) {
  const sourceBlocks = blocks(modRaw);
  if (sourceBlocks.length !== translations.length) {
    throw new Error(`Block mismatch: expected ${sourceBlocks.length}, got ${translations.length}`);
  }
  const header = String(currentRaw || modRaw).split(/\r?\n/, 1)[0];
  const translatedBlocks = sourceBlocks.map((block, index) => {
    const prefix = block.match(/^\[s\](?:\[[^\]]+\])*/)?.[0] || "[s]";
    const suffix = block.match(/(?:\[[^\]]+\])+\s*$/)?.[0]?.trim() || "[e]";
    return `${prefix}${translations[index]}${suffix}`;
  });
  return `${header}\r\n${translatedBlocks.join("\r\n")}`;
}

const catalogRows = [];
for (const file of fs.readdirSync(CATALOG).filter((name) => name.endsWith(".csv.gz") && name !== "optional_mod_files.csv.gz")) {
  const text = zlib.gunzipSync(fs.readFileSync(path.join(CATALOG, file))).toString("utf8");
  catalogRows.push(...parseCsv(text));
}
const sourceByShortKey = new Map(catalogRows.map((row) => [shortKey(row), row]));
const overrideRows = parseCsv(fs.readFileSync(OVERRIDES, "utf8"));
const overrideMap = new Map(overrideRows.map((row) => [rowKey(row), row]));
let baselineOverrideMap = new Map();
try {
  const baseline = execFileSync("git", ["show", ":translations/overrides.csv"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  baselineOverrideMap = new Map(parseCsv(baseline).map((row) => [rowKey(row), row]));
} catch {
  baselineOverrideMap = new Map();
}
const changes = [];

for (const [id, translations] of fixes) {
  const source = sourceByShortKey.get(id);
  if (!source) throw new Error(`Missing catalog row: ${id}`);
  const existing = overrideMap.get(rowKey(source));
  const previousRaw = existing?.final_zh || source.final_zh || source.official_chinese;
  const nextRaw = rebuild(source.mod_text, previousRaw, translations);
  overrideMap.set(rowKey(source), {
    category: source.category,
    resource_key: source.resource_key,
    msg_id: source.msg_id,
    final_zh: nextRaw,
    updated_at: UPDATED_AT,
    compiled_at: "",
  });
  changes.push({
    category: source.category,
    resource_key: source.resource_key,
    msg_id: source.msg_id,
    mod_english: visible(source.mod_text),
    before_zh: visible(previousRaw),
    after_zh: visible(nextRaw),
    reason: "Mod 英文与当前中文语义不一致，按上下文重译并保留控制码",
  });
}

const speakerMap = new Map([
  ["Sumire", "芳泽 堇"],
  ["Sumire?", "芳泽 ???"],
  ["Maruki", "丸喜 拓人"],
  ["Akechi", "明智 吾郎"],
  ["Ann", "高卷 杏"],
  ["Morgana", "摩尔加纳"],
  ["Futaba", "佐仓 双叶"],
  ["Sakamoto", "坂本 龙司"],
  ["Ryuji", "坂本 龙司"],
  ["Kawakami", "川上 贞代"],
  ["Makoto", "新岛 真"],
  ["Sojiro", "佐仓 惣治郎"],
  ["Haru", "奥村 春"],
  ["Ren", "芳泽 霞"],
  ["Dad?", "爸爸？"],
  ["Fad-Following Woman", "追逐潮流的女性"],
  ["Brown-Haired Student", "棕发学生"],
]);
const speakerChanges = [];
for (const source of catalogRows) {
  const existing = overrideMap.get(rowKey(source));
  const previousRaw = existing?.final_zh || source.final_zh || source.official_chinese;
  const baselineRaw = baselineOverrideMap.get(rowKey(source))?.final_zh || source.final_zh || source.official_chinese;
  const beforeSpeaker = speakerOf(baselineRaw);
  const currentSpeaker = speakerOf(previousRaw);
  const afterSpeaker = speakerMap.get(beforeSpeaker) || speakerMap.get(currentSpeaker);
  if (!afterSpeaker) continue;
  if (currentSpeaker !== afterSpeaker) {
    const nextRaw = replaceSpeaker(previousRaw, afterSpeaker);
    overrideMap.set(rowKey(source), {
      category: source.category,
      resource_key: source.resource_key,
      msg_id: source.msg_id,
      final_zh: nextRaw,
      updated_at: UPDATED_AT,
      compiled_at: "",
    });
  }
  if (beforeSpeaker === afterSpeaker) continue;
  speakerChanges.push({
    category: source.category,
    resource_key: source.resource_key,
    msg_id: source.msg_id,
    before_speaker: beforeSpeaker,
    after_speaker: afterSpeaker,
  });
}

const overrideHeaders = ["category", "resource_key", "msg_id", "final_zh", "updated_at", "compiled_at"];
const sortedOverrides = [...overrideMap.values()].sort((a, b) => rowKey(a).localeCompare(rowKey(b)));
fs.writeFileSync(OVERRIDES, `\ufeff${overrideHeaders.join(",")}\r\n${sortedOverrides.map((row) => overrideHeaders.map((header) => csvCell(row[header])).join(",")).join("\r\n")}\r\n`, "utf8");

const reportHeaders = ["category", "resource_key", "msg_id", "mod_english", "before_zh", "after_zh", "reason"];
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `\ufeff${reportHeaders.join(",")}\r\n${changes.map((row) => reportHeaders.map((header) => csvCell(row[header])).join(",")).join("\r\n")}\r\n`, "utf8");
const speakerHeaders = ["category", "resource_key", "msg_id", "before_speaker", "after_speaker"];
if (speakerChanges.length || !fs.existsSync(SPEAKER_REPORT)) {
  fs.writeFileSync(SPEAKER_REPORT, `\ufeff${speakerHeaders.join(",")}\r\n${speakerChanges.map((row) => speakerHeaders.map((header) => csvCell(row[header])).join(",")).join("\r\n")}\r\n`, "utf8");
}
console.log(JSON.stringify({ fixes: changes.length, speakerFixes: speakerChanges.length, overrides: sortedOverrides.length, report: REPORT, speakerReport: SPEAKER_REPORT }, null, 2));
