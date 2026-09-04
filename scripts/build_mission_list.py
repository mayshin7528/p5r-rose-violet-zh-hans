# -*- coding: utf-8 -*-

from __future__ import annotations

from pathlib import Path
import re


SOURCE_PATH = Path(r"F:\Reloaded-II\Mods\p5rpc.kasumi.roseandviolet\P5REssentials\CPK\EN.CPK\FIELD\PANEL\MISSION_LIST\MISSION_LIST.TBL")
CHARSET_PATH = Path(r"F:\Rose\AtlusScriptTools\Charsets\P5R_CHS.tsv")
OUTPUT_PATH = Path(r"F:\Rose\build\MISSION_LIST.TBL")
REPORT_PATH = Path(r"F:\Rose\build\MISSION_LIST_report.txt")


def build_char_map(path: Path) -> dict[str, bytes]:
    char_map: dict[str, bytes] = {}
    rows = path.read_text(encoding="utf-8-sig").splitlines()
    for r, row in enumerate(rows):
        cols = row.split("\t")
        for c, ch in enumerate(cols):
            if not ch or ch == "*":
                continue
            if ch not in char_map:
                index = r * 16 + c
                hi = index >> 8
                lo = index & 0xFF
                lead = 0x80 + (2 * hi)
                if lo < 0x20:
                    lead -= 1
                    trail = lo + 0xE0
                elif lo < 0xA0:
                    trail = lo + 0x60
                else:
                    lead += 1
                    trail = lo - 0x20
                char_map[ch] = bytes((lead, trail))
    return char_map


def encode_p5r(text: str, char_map: dict[str, bytes]) -> bytes:
    out = bytearray()
    for ch in text:
        code = ord(ch)
        if 0x20 <= code <= 0x7E:
            out.append(code)
            continue
        if ch not in char_map:
            raise KeyError(f"Missing char in P5R_CHS.tsv: {ch!r}")
        out.extend(char_map[ch])
    return bytes(out)


NAME_MAP = {
    "Kamoshida": "鸭志田",
    "Madarame": "斑目",
    "Kaneshiro": "金城",
    "Futaba": "双叶",
    "Okumura": "奥村",
    "Sae Niijima": "新岛冴",
    "Shido": "狮童",
    "Maruki": "丸喜",
    "Sumire": "堇",
    "Akechi": "明智",
    "Ryuji": "龙司",
    "Yusuke": "佑介",
    "Nishiyama": "西山",
    "Ohya": "大宅",
    "Ann": "杏",
    "Haru": "春",
    "Makoto": "真",
    "Morgana": "摩尔加纳",
    "Jose": "约瑟",
    "Mishima": "三岛",
    "Taihei": "太平",
    "Iida": "饭田",
    "Kawakami": "川上",
    "Sojiro Sakura": "佐仓惣治郎",
    "Alibaba": "阿里巴巴",
    "Leblanc": "卢布朗",
    "Medjed": "梅杰德",
    "Maruki and Sumire": "丸喜和堇",
    "Shadow Sae": "阴影冴",
    "Shadow Kaneshiro": "阴影金城",
    "Beauty Thief": "美少女怪盗",
    "Tsukasa": "司",
    "Rose": "Rose",
    "Skull": "Skull",
    "Mona": "Mona",
    "Panther": "Panther",
    "Fox": "Fox",
    "Queen": "Queen",
    "Noir": "Noir",
    "Crow": "Crow",
    "Violet": "Violet",
    "Navi": "Navi",
    "Bless": "祝福",
    "Curse": "咒怨",
    "Electric": "电击",
    "Fire": "火焰",
    "Gun": "枪击",
    "Ice": "冰冻",
    "Nuclear": "核热",
    "Physical": "物理",
    "Psy": "念动",
    "Wind": "疾风",
}


OBJECT_MAP = {
    "door in front of auditorium": "礼堂前的门",
    "inside the pyramid": "金字塔内部",
    "rumors about Madarame": "关于斑目的传闻",
    "the change in cognition": "认知变化",
    "the door": "门",
    "the golden vase": "金色花瓶",
    "the video": "录像",
    "the control room Shadow": "控制室里的阴影",
    "the main assembly hall": "中央礼堂",
    "underground": "地下区域",
    "mysterious castle": "神秘城堡",
    "pyramid": "金字塔",
    "Kaneshiro's bank": "金城的银行",
    "a lead to open the door": "打开门的线索",
    "a path above ground": "通往地面的路",
    "a path to the Treasure": "通往秘宝的路",
    "a path to the basement": "通往地下的路",
    "a route to the basement": "通往地下的路线",
    "a way further in": "深入内部的路",
    "a way through the paintings": "穿过画作的方法",
    "a way to earn coins fast": "快速赚取筹码的方法",
    "a way to halt the scythes": "停止镰刀机关的方法",
    "a way to open the large door": "打开大门的方法",
    "a way to open the partition": "打开隔门的方法",
    "a way to steal the Treasure": "夺取秘宝的方法",
    "a way to the cabin": "通往船舱的路",
    "another key": "另一把钥匙",
    "intel at the station square": "车站广场的情报",
    "intel in the station mall": "车站商场的情报",
    "intel on Central Street": "中央大街的情报",
    "students in Central Street": "中央大街上的学生",
    "the IT president": "IT公司社长",
    "the Palace Ruler": "殿堂统治者",
    "the Reception room": "接待室",
    "the Treasure's location": "秘宝所在的位置",
    "the green control panel": "绿色控制面板",
    "the homeless man": "流浪汉",
    "the homeless man in the mall": "商场里的流浪汉",
    "the key": "钥匙",
    "the red and green panels": "红绿控制面板",
    "the red control panel": "红色控制面板",
    "the slot control terminal": "老虎机控制终端",
    "the true culprit": "真正的犯人",
    "the two keys": "两把钥匙",
    "the videotape": "录像带",
    "where to use the keycard": "门卡的使用地点",
    "the above ground exit": "地面出口",
    "the building past the stairs": "楼梯前方的建筑",
    "the central building": "中央建筑",
    "the opened path": "已经打开的道路",
    "the temple": "神殿",
    "Madarame's house": "斑目家",
    "Weapon Production": "武器制造区",
    "the Safe Room": "安全屋",
    "the back alley": "后巷",
    "the bank basement": "银行地下区域",
    "the elevator": "电梯",
    "the entrance": "入口",
    "the restaurant": "餐厅",
    "the square": "广场",
    "the target's cabin": "目标所在的船舱",
    "the uninvestigated area": "尚未调查的区域",
    "the pillar of light": "光柱",
    "Shido's Palace": "狮童的殿堂",
    "the fitting room": "试衣间",
    "inside the building": "建筑内部",
    "outside the pyramid": "金字塔外部",
    "the spaceport": "宇宙基地",
    "the tower interior": "塔内",
    "Kaneshiro's Palace": "金城的殿堂",
    "a path to the exit": "通往出口的路",
    "a way out": "逃出去的路",
    "intel on the password": "密码的情报",
    "the Shibuya hideout": "涩谷藏身处",
    "a member's card": "会员卡",
    "a membership card": "会员卡",
    "intel from teammates": "同伴提供的情报",
    "investigation intel": "调查情报",
    "the blueprint": "设计图",
    "the chief director's ID": "局长的ID",
    "the last letter": "最后一封介绍信",
    "the other key": "另一把钥匙",
    "the remaining four letters": "剩余四封介绍信",
    "the remaining three letters": "剩余三封介绍信",
    "the remaining two letters": "剩余两封介绍信",
    "query-locked gate": "问答封锁门",
    "2nd query-locked gate": "第2道问答封锁门",
    "3rd query-locked gate": "第3道问答封锁门",
    "4th query-locked gate": "第4道问答封锁门",
    "the vault partition": "金库隔门",
    "the 19th": "19日",
    "the next operation": "下次行动",
    "tomorrow's mission": "明天的任务",
    "the mafia boss": "黑道头目",
    "your next target": "下一个目标",
    "Chamber of Rejection": "拒绝之厅",
    "Chamber of Sanctuary": "圣域之厅",
    "Chamber of Sarcophagi": "石棺之厅",
    "facility interiors": "设施内部",
    "tower": "塔内",
    "underground corridor": "地下通道",
    "an alternate entrance": "另一处入口",
    "information to find the answer": "寻找答案所需的情报",
    "the airlocks to proceed": "前进所需的气闸",
    "the chief clerk's ID card": "课长的ID卡",
    "the chief director's ID card": "局长的ID卡",
    "the keycard to open the door": "开门所需的门卡",
    "the section chief's ID card": "部长的ID卡",
    "the depths": "深处",
    "the new area": "新区域",
    "the target": "目标",
    "the preceding area": "前方区域",
    "the inner depths": "更深处",
    "the rare shadow": "稀有暗影",
    "the treasure chest": "宝箱",
    "a large number of items": "大量物品",
    "a large number of flowers": "大量花朵",
    "powerful Shadows": "强敌阴影",
    "the Reaper": "死神",
    "a number of Shadows": "大量阴影",
    "the darkness": "黑暗",
    "your footing": "脚下",
    "Mementos": "印象空间",
    "inside the cell": "牢房内部",
    "the mysterious castle": "神秘城堡",
    "the exit": "出口",
    "Morgana": "摩尔加纳",
    "the stone statue": "石像",
    "the escape route": "逃生路线",
    "the slaves": "奴隶们",
    "the cells": "牢房区",
    "the missing slaves": "失踪的奴隶",
    "the training hall": "训练大厅",
    "the slave students": "奴隶学生们",
    "the castle": "城堡",
    "Kamoshida's heart": "鸭志田的心",
    "the infiltration point": "潜入地点",
    "the Treasure": "秘宝",
    "Ann Takamaki": "高卷杏",
    "the voice": "声音传来的方向",
    "the previous point": "之前的地点",
    "the bars": "铁栏",
    "a way to proceed": "前进的方法",
    "the key for the gated door": "大门的钥匙",
    "the mystery of the library": "图书室之谜",
    "the hidden room": "隐藏房间",
    "the tower": "塔内",
    "the medal to continue on": "继续前进所需的奖章",
    "the Treasure room": "秘宝所在处",
    "the King's Hall": "国王大厅",
    "the Madarame rumors": "斑目的传闻",
    "the museum": "美术馆",
    "the bank": "银行",
    "the pyramid": "金字塔",
    "the casino": "赌场",
    "the ship": "船上",
    "the factory": "工厂",
    "the giant slot machine": "巨大老虎机",
    "coins": "筹码",
    "the giant gate": "巨大闸门",
    "the giant painting": "巨型画作",
    "the eerie painting": "诡异的画作",
    "the information panel": "信息面板",
    "the large door": "大门",
    "the members floor": "会员层",
    "the mysterious device": "神秘装置",
    "the pamphlet": "宣传册",
    "the reception desk": "前台",
    "the scale bridge": "天平桥",
    "the cable you handled": "你动过的缆线",
    "the control room": "控制室",
    "the control terminal": "控制终端",
    "the crane controls": "起重机控制器",
    "the route to the depths": "通往深处的路线",
    "the route to the basement": "通往地下的路线",
    "the basement": "地下区域",
    "the basement depths": "地下深处",
    "above ground": "地上",
    "the partition": "隔门",
    "the partition with the keys": "上锁的隔门",
    "the biometric door": "生物认证门",
    "the corridor door": "走廊门",
    "the assembly hall door": "礼堂大门",
    "the assembly hall": "礼堂",
    "the auditorium": "礼堂",
    "the main hall": "大厅",
    "the main hall control room": "大厅控制室",
    "the security room": "保安室",
    "the security room terminal": "保安室终端",
    "the control room terminal": "控制室终端",
    "the security": "安保",
    "the security system": "安保系统",
    "the infrared lasers": "红外线机关",
    "the electrical box": "配电箱",
    "the Holy Grail": "圣杯",
    "the engine room": "引擎室",
    "the data terminal": "数据终端",
    "the robots": "机器人包围",
    "the press machines": "压制机器",
    "the airlocks": "气闸",
    "the factory depths": "工厂深处",
    "the center of the Palace": "殿堂中央",
    "the heart of the vault": "金库深处",
    "the Palace": "殿堂",
    "Palace": "殿堂",
    "the Palace interior": "殿堂内部",
    "the Chamber of Guilt": "罪之厅",
    "the Chamber of Rejection": "拒绝之厅",
    "the Chamber of Sanctuary": "圣域之厅",
    "the Chamber of Sarcophagi": "石棺之厅",
    "the Chamber of Emptiness": "虚无之厅",
    "the twisted labyrinth": "扭曲迷宫",
    "the transport area": "运输区",
    "the huge scythes in the hall": "大厅里的巨大镰刀机关",
    "the top of the tower": "塔顶",
    "the route to the Treasure": "通往秘宝的路线",
    "the city": "城里",
    "the designated place": "指定地点",
    "the suspicious place": "可疑地点",
    "the bordering town": "边境小镇",
    "the desert town": "沙漠小镇",
    "the facility interiors": "设施内部",
    "the high limit floor": "高额赌注层",
    "the manager's floor": "经理层",
    "the pool deck": "泳池甲板",
    "the side deck": "侧甲板",
    "the bar counter": "吧台",
    "the entertainment hall": "娱乐大厅",
    "the nearest station": "最近的车站",
    "the rooftop": "屋顶",
    "the school entrance": "学校入口",
    "the school": "学校",
    "the station square": "车站广场",
    "the station mall": "车站商场",
    "Central Street": "中央大街",
    "student council room": "学生会室",
    "the faculty office": "教员室",
    "the courtyard": "中庭",
    "the bar in Shinjuku": "新宿的酒吧",
    "Crossroads": "十字路口酒吧",
    "the darts lounge": "飞镖酒吧",
    "the darts lounge in Kichijoji": "吉祥寺的飞镖酒吧",
    "the JL ticket gates": "JL检票口",
    "the Inogami Line": "猪神线",
    "Shujin Academy": "秀尽学园",
    "Sojiro Sakura's residence": "佐仓惣治郎家",
    "your new lodging": "新的住处",
    "the subway station": "地铁站",
    "the Airsoft Shop": "气枪店",
    "the flower shop": "花店",
    "the suspicious clinic": "可疑诊所",
    "Eden": "伊甸",
    "Teikyu Building": "帝急大楼",
    "2F": "2楼",
    "2-D": "2-D班",
}


EXACT_MAP = {
    "Defeat all of the enemies": "击败所有敌人",
    "Use a skill": "使用技能",
    "Attack with your weapon": "用武器攻击",
    "Fire your gun": "开枪攻击",
    "Talk to the enemy": "与敌人交谈",
    "Knock foe down with your gun": "用枪击倒敌人",
    "Knock the enemy down": "打倒敌人",
    "Use SPECIAL": "使用SPECIAL",
    "Perform a Baton Pass": "发动换手",
    "Defeat Kamoshida": "击败鸭志田",
    "Stop him from healing": "阻止他恢复",
    "Steal the Treasure": "偷走秘宝",
    "Draw Kamoshida's attention": "吸引鸭志田的注意",
    "Defeat Okumura": "击败奥村",
    "Win within the time limit": "在时间限制内获胜",
    "Defeat Niijima": "击败新岛冴",
    "Be cautious of the penalty": "小心惩罚机制",
    "Expose her cheating": "揭穿她作弊",
    "Destroy the Holy Grail": "摧毁圣杯",
    "Prevent it from healing": "阻止它恢复",
    "Change your Persona": "更换Persona",
    "Beware the super attack!": "小心强力攻击！",
    "Defeat Maruki": "击败丸喜",
    "No physical attack skills!": "无法使用物理攻击技能！",
    "No magic attack skills!": "无法使用魔法攻击技能！",
    "No support skills!": "无法使用辅助技能！",
    "Unable to cure!": "无法恢复！",
    "Unable to guard!": "无法防御！",
    "Unable to Baton Pass!": "无法换手！",
    "Unable to use item!": "无法使用道具！",
    "Dummy": "Dummy",
    "Enter Mementos": "进入印象空间",
    "Investigate Mementos": "调查印象空间",
    "Find Jose": "寻找约瑟",
    "Escape from the casino": "逃离赌场",
    "Follow Morgana": "跟上Morgana",
    "Escape from the castle": "逃离城堡",
    "Find the Treasure": "寻找秘宝",
    "Head towards the voice": "朝声音传来的方向前进",
    "Leave the Palace": "离开殿堂",
    "Send the calling card": "发出预告信",
    "Await the change of heart": "等待改心",
    "Infiltrate the castle": "潜入城堡",
    "Rescue Ann Takamaki": "救出高卷杏",
    "Keep investigating the castle": "继续调查城堡",
    "Get past the bars": "穿过铁栏",
    "Infiltrate the tower": "潜入塔内",
    "Infiltrate the King's Hall": "潜入国王大厅",
    "Infiltrate the museum": "潜入美术馆",
    "Infiltrate the bank": "潜入银行",
    "Infiltrate the pyramid": "潜入金字塔",
    "Infiltrate the casino": "潜入赌场",
    "Infiltrate the ship": "潜入船上",
    "Infiltrate the factory": "潜入工厂",
    "Investigate the Palace": "调查殿堂",
    "Investigate the Palace interior": "调查殿堂内部",
    "Find an infiltration route": "寻找潜入路线",
    "Secure an infiltration route": "确保潜入路线",
    "Secure route to the Treasure": "确保通往秘宝的路线",
    "Steal the mafia boss's heart": "偷走黑道老大的心",
    "Steal the public's heart": "偷走大众的心",
    "Steal malevolent god's heart": "偷走邪神的心",
    "Confirm Maruki's reality": "确认丸喜构筑的现实",
    "Stop Medjed's plan": "阻止梅杰德的计划",
    "Get ready for midterms": "为期中考试做准备",
    "Exit the subway station": "离开地铁站",
    "Look for Leblanc": "寻找卢布朗",
    "Look for the Leblanc caf": "寻找卢布朗咖啡店",
    "Prepare for tomorrow": "为明天做准备",
    "Check personal items": "查看随身物品",
    "Check surroundings": "查看四周",
    "Clean your room": "打扫房间",
    "Go to sleep": "去睡觉",
    "Obey your instructions": "按指示行动",
    "Answer the phone": "接电话",
    "Flip the store's sign": "把招牌翻到营业中",
    "Go to Shujin Academy": "前往秀尽学园",
    "Head to the nearest station": "前往最近的车站",
    "Head to Shibuya": "前往涩谷",
    "Change to the Ginza Line": "换乘银座线",
    "Go to 2F": "前往2楼",
    "Head straight home": "直接回家",
    "Obediently return home": "老老实实回家",
    "Head to school": "前往学校",
    "Head to 2-D": "前往2-D班",
    "Find the third-year volleyball player": "寻找三年级排球部员",
    "Find the first-year volleyball player": "寻找一年级排球部员",
    "Talk to Mishima": "和三岛交谈",
    "Pursue Ann": "追赶杏",
    "Meet up with Ryuji": "去和龙司会合",
    "Borrow a pot": "借一个锅",
    "Look for a pot": "寻找锅子",
    "Ask where Yusuke went": "问祐介去了哪里",
    "Change in your room": "回房间换衣服",
    "Find Crossroads": "找十字路口酒吧",
    "Follow the situation": "静观其变",
    "Solve the mystery of the library": "解开图书室之谜",
    "Talk to the journalist": "和记者交谈",
    "Regroup with Ryuji": "与龙司会合",
    "Go home": "回家",
    "Pursue Makoto": "追赶真",
    "Enter the Airsoft Shop": "进入气枪店",
    "Prepare to make infiltration tools": "准备制作潜入道具",
    "Clean your work desk": "整理工作桌",
    "Get rid of the cops": "甩掉警察",
    "Find something to do in the city": "在城里找点事做",
    "Return to the shop": "返回店里",
    "Cooperate with Yusuke": "和祐介合作",
    "Look for a model": "寻找模特",
    "Look for what Yusuke saw": "寻找祐介看到的东西",
    "Convince Taihei": "说服太平",
    "Gather intel on Kawakami": "收集关于川上的情报",
    "Get information from the locals": "向当地人打听消息",
    "Go listen to the street speech": "去听街头演说",
    "Listen for a rumor about \"Tsukasa\"": "打听关于“司”的传闻",
    "Go to the darts lounge in Kichijoji": "前往吉祥寺的飞镖酒吧",
    "Find the darts lounge": "寻找飞镖酒吧",
    "Head to the darts lounge": "前往飞镖酒吧",
    "Chase the butterfly": "追逐蝴蝶",
    "Check up on the teammates": "去确认同伴的情况",
    "Buy a gift at the flower shop": "在花店买礼物",
    "Get some food on your plate": "往盘子里装些食物",
    "Get some fish": "拿些鱼",
    "Get some rice dishes": "拿些米饭类料理",
    "Get some meat": "拿些肉",
    "Get some dessert": "拿些甜点",
    "Act like an honest student": "做个老实学生",
    "Activate the stone statue": "启动石像",
    "Ask about Iida's situation": "打听饭田的情况",
    "Ask where Yusuke went": "问Yusuke去哪了",
    "Be cautious of Medjed": "小心梅杰德",
    "Be mindful of the darkness": "留意黑暗",
    "Be mindful of your footing": "小心脚下",
    "Beat the giant slot machine": "打倒巨大老虎机",
    "Break through the robots": "突破机器人包围",
    "Catch Morgana": "追上摩尔加纳",
    "Catch the bandit": "抓住盗贼",
    "Catch the mysterious jewel": "抓住神秘宝石",
    "Celebrate your success": "庆祝成功",
    "Change Futaba's cognition": "改变双叶的认知",
    "Change Madarame's cognition": "改变斑目的认知",
    "Change Sae's cognition": "改变冴的认知",
    "Change the target's heart": "令目标改心",
    "Chase after Shadow Kaneshiro": "追赶阴影金城",
    "Chase down the Treasure": "追上秘宝",
    "Choose an answer and proceed": "选好答案后前进",
    "Clean your desk": "整理桌子",
    "Clear the false charges": "洗清冤罪",
    "Continue in the Chamber of Guilt": "继续探索罪之厅",
    "Control the blue shining device": "操作发蓝光的装置",
    "Corner the bandit in the square": "在广场逼住盗贼",
    "Cooperate with Yusuke": "和Yusuke合作",
    "Decide on Akechi joining": "决定是否让明智加入",
    "Destroy the electrical box": "破坏配电箱",
    "Disable the security": "解除安保",
    "Disable the security system": "解除安保系统",
    "Disengage the infrared lasers": "解除红外线机关",
    "Earn 100,000 coins": "赚到100000枚筹码",
    "Earn 50,000 coins": "赚到50000枚筹码",
    "Elude the investigation team": "甩开调查组",
    "Finish the maze": "走出迷宫",
    "Fulfill Niijima-san's demands": "满足新岛小姐的要求",
    "Gain Akechi's intel": "获得明智的情报",
    "Gather a large number of flowers": "收集大量花朵",
    "Gather intel at the pool": "在泳池收集情报",
    "Go from practice building to courtyard": "从练习楼前往中庭",
    "Go talk to Futaba": "去找双叶说话",
    "Go through the cognitive door": "穿过认知之门",
    "Go through the large door": "穿过大门",
    "Grant Futaba's request": "实现双叶的请求",
    "Head beyond the courtyard": "前往中庭深处",
    "Head into Futaba's room": "进入双叶的房间",
    "Head into the factory depths": "前往工厂深处",
    "Head up the great corridor": "走上大回廊",
    "Identify the chief director": "确认局长身份",
    "Identify the section chief": "确认部长身份",
    "Learn about cognitive beings": "了解认知存在",
    "Level the scale bridge": "放平天平桥",
    "Listen for a rumor about \"Tsukasa\"": "打听关于\"司\"的传闻",
    "Listen to Ryuji in the courtyard": "在中庭听龙司说话",
    "Live an honest student life": "过老实学生的生活",
    "Look for what Yusuke saw": "寻找Yusuke看到的东西",
    "Look into Futaba Sakura": "调查佐仓双叶",
    "Look into the Beauty Thief": "调查美少女怪盗",
    "Look into the mental shutdowns": "调查精神失控事件",
    "Observe the case's progress": "观察案件进展",
    "Overcome the arena": "突破竞技场",
    "Overcome the boulder trap": "克服巨石机关",
    "Overcome the maze": "突破迷宫",
    "Pass through the gate": "穿过大门",
    "Pick up a large number of items": "收集大量物品",
    "Play the dice game to earn coins": "玩骰子游戏赚筹码",
    "Play the slots to earn coins": "玩老虎机赚筹码",
    "Prove your existence to society": "向社会证明自己的存在",
    "Prove your justice to society": "向社会证明自己的正义",
    "Put the eyes in the statue": "把眼睛放进石像",
    "Reach the lower stratum": "到达下层",
    "Report back to Futaba": "向双叶汇报",
    "Rescue Morgana": "救出摩尔加纳",
    "Rescue your teammates": "救出同伴",
    "Return to the pyramid": "返回金字塔",
    "Rid Futaba of her unease": "消除双叶的不安",
    "Search beyond the employee door": "搜索员工门另一头",
    "See what happens": "看看会发生什么",
    "Sell the medal": "卖掉奖章",
    "Send out the calling card to Maruki": "向丸喜发出预告信",
    "Send the calling card on 11/18": "在11/18发出预告信",
    "Solve the hologram mystery": "解开全息投影之谜",
    "Solve the mystery of the PIN": "解开PIN之谜",
    "Solve the mystery of the mural": "解开壁画之谜",
    "Solve the security mystery": "解开安保机关之谜",
    "Steal the ID from the Shadow": "从阴影身上偷走ID",
    "Steal the key from the guard": "从守卫身上偷走钥匙",
    "Steal the materialized Treasure": "偷走实体化的秘宝",
    "Stealthily obtain intel": "悄悄获取情报",
    "Stop the dice game cheating": "阻止骰子游戏作弊",
    "Stop the huge scythes in the hall": "停止大厅里的巨大镰刀机关",
    "Stop the press machines": "停止压制机器",
    "Take Futaba to the beach": "带双叶去海边",
    "Take the elevator up": "乘电梯上去",
    "Traverse the Chamber of Emptiness": "穿过虚无之厅",
    "Traverse the transport area": "穿过运输区",
    "Traverse the twisted labyrinth": "穿过扭曲迷宫",
    "Turn the entire floor blue": "让整层变蓝",
    "Turn them all blue in 10 moves": "在10步内全部变蓝",
    "Uncover Kamoshida's abuses": "揭发鸭志田的恶行",
    "Visit the suspicious clinic": "前往可疑诊所",
    "Walk around on the shining floor": "在发光的地板上移动",
    "Watch out for a number of Shadows": "小心大量阴影",
    "Watch out for powerful Shadows": "小心强敌阴影",
    "Watch out for the Reaper": "小心死神",
}

# Entries whose English grammar cannot be expressed by the generic
# verb/object patterns above. Keeping these exact also prevents mixed strings
# such as "等待双叶 to recover" from reaching the binary.
EXACT_MAP.update({
    "Ask where Yusuke went": "问佑介去了哪里",
    "Change your Persona": "更换人格面具",
    "Check on Iida and Ann": "确认饭田和杏的情况",
    "Cooperate with Yusuke": "和佑介合作",
    "Follow Morgana": "跟上摩尔加纳",
    "Get 5 letters of introduction": "取得5封介绍信",
    "Get a card at the exchange area": "在兑换处取得卡片",
    "Get in contact with the target": "与目标取得联系",
    "Get inside the bank": "进入银行内部",
    "Get intel on the mafia": "取得黑道的情报",
    "Get on top of the elevator": "爬到电梯上方",
    "Get past this area": "突破这片区域",
    "Get to school on time": "按时赶到学校",
    "Look for what Yusuke saw": "寻找佑介看到的东西",
    "Pursue Haru and Morgana": "追赶春和摩尔加纳",
    "Wait for Futaba to recover": "等待双叶恢复",
    "Wait for Futaba's data analysis": "等待双叶完成数据分析",
    "Wait for Futaba's plan": "等待双叶的计划",
    "Wait for Haru's recovery": "等待春恢复",
    "Wait for Ohya to contact you": "等待大宅联络",
    "Wait for Shido to be tried": "等待狮童受审",
    "Wait for contact from Alibaba": "等待阿里巴巴联络",
    "Wait for the promised date of 2/3": "等待约定的2月3日",
})


SKIP = {
    "btlTable.bin",
    "dngTable.bin",
    "fldTable.bin",
    "kfeTable.bin",
    "mainTable.bin",
    "btl_mission_title.ftd",
    "dng_mission_title.ftd",
    "fld_mission_title.ftd",
    "kfe_mission_title.ftd",
    "main_mission_title.ftd",
    "FTD0",
    "NULL",
    "Dummy",
}


def t_name(name: str) -> str:
    return NAME_MAP.get(name, name)


def t_obj(text: str) -> str:
    translated = OBJECT_MAP.get(text, text)
    if translated != text:
        return translated

    # Object phrases can contain character names, such as
    # "Maruki and Sumire's location". Translate the longest names first so a
    # generic mission pattern cannot leave an English tail after a Chinese
    # verb prefix.
    for source, target in sorted(NAME_MAP.items(), key=lambda item: len(item[0]), reverse=True):
        translated = translated.replace(source, target)
    if m := re.match(r"^(.+) and (.+)'s location$", translated):
        return f"{m.group(1)}和{m.group(2)}所在的位置"
    if m := re.match(r"^(.+)'s location$", translated):
        return f"{m.group(1)}所在的位置"
    if m := re.match(r"^meeting with (.+)$", translated):
        return f"与{m.group(1)}见面"
    return translated


def translate(text: str) -> str:
    if text in EXACT_MAP:
        return EXACT_MAP[text]

    if m := re.match(r"^Steal (.+)'s heart$", text):
        return f"偷走{t_name(m.group(1))}的心"
    if m := re.match(r"^Defeat (.+)$", text):
        return f"击败{t_name(t_obj(m.group(1)))}"
    if m := re.match(r"^Escape from (.+)$", text):
        return f"逃离{t_obj(m.group(1))}"
    if m := re.match(r"^Escape the (.+)$", text):
        return f"逃离{t_obj(m.group(1))}"
    if m := re.match(r"^Head to (.+)$", text):
        return f"前往{t_obj(m.group(1))}"
    if m := re.match(r"^Head for (.+)$", text):
        return f"前往{t_obj(m.group(1))}"
    if m := re.match(r"^Head toward(?:s)? (.+)$", text):
        return f"朝{t_obj(m.group(1))}前进"
    if m := re.match(r"^Go to (.+)$", text):
        return f"前往{t_obj(m.group(1))}"
    if m := re.match(r"^Enter (.+)$", text):
        return f"进入{t_obj(m.group(1))}"
    if m := re.match(r"^Infiltrate (.+)$", text):
        return f"潜入{t_obj(m.group(1))}"
    if m := re.match(r"^Investigate (.+)$", text):
        return f"调查{t_obj(m.group(1))}"
    if m := re.match(r"^Check on (.+)$", text):
        return f"查看{t_obj(m.group(1))}"
    if m := re.match(r"^Check what's on (.+)$", text):
        return f"查看{t_obj(m.group(1))}里的内容"
    if m := re.match(r"^Check (.+)$", text):
        return f"调查{t_obj(m.group(1))}"
    if m := re.match(r"^Find (.+)$", text):
        return f"寻找{t_obj(m.group(1))}"
    if m := re.match(r"^Look for (.+)$", text):
        return f"寻找{t_obj(m.group(1))}"
    if m := re.match(r"^Search for (.+)$", text):
        return f"寻找{t_obj(m.group(1))}"
    if m := re.match(r"^Search the (.+)$", text):
        return f"搜索{t_obj(m.group(1))}"
    if m := re.match(r"^Open (.+)$", text):
        return f"打开{t_obj(m.group(1))}"
    if m := re.match(r"^Use (.+)$", text):
        return f"使用{t_obj(m.group(1))}"
    if m := re.match(r"^Obtain intel on (.+)$", text):
        return f"获取关于{t_obj(m.group(1))}的情报"
    if m := re.match(r"^Gather intel on (.+)$", text):
        return f"收集关于{t_obj(m.group(1))}的情报"
    if m := re.match(r"^Find intel on (.+)$", text):
        return f"寻找关于{t_obj(m.group(1))}的情报"
    if m := re.match(r"^Find intel in (.+)$", text):
        return f"在{t_obj(m.group(1))}寻找情报"
    if m := re.match(r"^Find intel at (.+)$", text):
        return f"在{t_obj(m.group(1))}寻找情报"
    if m := re.match(r"^Obtain (.+)$", text):
        return f"取得{t_obj(m.group(1))}"
    if m := re.match(r"^Get (.+)$", text):
        return f"取得{t_obj(m.group(1))}"
    if m := re.match(r"^Wait for (.+)$", text):
        return f"等待{t_obj(m.group(1))}"
    if m := re.match(r"^Prepare for (.+)$", text):
        return f"为{t_obj(m.group(1))}做准备"
    if m := re.match(r"^Meet (.+) at (.+)$", text):
        return f"去{t_obj(m.group(2))}和{t_name(m.group(1))}会合"
    if m := re.match(r"^Follow (.+)$", text):
        return f"跟着{t_name(m.group(1))}前进"
    if m := re.match(r"^Pursue (.+)$", text):
        return f"追赶{t_name(t_obj(m.group(1)))}"
    if m := re.match(r"^Regroup with (.+)$", text):
        return f"与{t_name(m.group(1))}会合"
    if m := re.match(r"^([A-Za-z]+) attack bonus!$", text):
        return f"{t_name(m.group(1))}攻击奖励！"
    if m := re.match(r"^([A-Za-z]+) defeat bonus!$", text):
        return f"{t_name(m.group(1))}击败奖励！"
    if m := re.match(r"^([A-Za-z]+) takedown bonus!$", text):
        return f"{t_name(m.group(1))}击倒奖励！"
    if m := re.match(r"^([A-Za-z]+) is targeted!$", text):
        return f"{t_name(m.group(1))}成为目标！"

    return text


def extract_records(data: bytes) -> list[tuple[int, int, str]]:
    records: list[tuple[int, int, str]] = []
    start = -1
    for i, b in enumerate(data):
        if 32 <= b <= 126:
            if start < 0:
                start = i
        elif start >= 0:
            length = i - start
            if length >= 4:
                records.append((start, length, data[start:i].decode("ascii")))
            start = -1
    return records


ALLOWED_UI_TERMS = re.compile(
    r"(?:Crow|Fox|Mona|Navi|Noir|Panther|Queen|Rose|Skull|Violet|IT|JL|ID|PIN|SPECIAL)",
    re.IGNORECASE,
)


def has_untranslated_ascii(text: str) -> bool:
    return bool(re.search(r"[A-Za-z]{2,}", ALLOWED_UI_TERMS.sub("", text)))


def main() -> None:
    char_map = build_char_map(CHARSET_PATH)
    data = bytearray(SOURCE_PATH.read_bytes())
    unresolved: set[str] = set()
    too_long: set[str] = set()
    mixed_ascii: set[str] = set()
    changed = 0

    for offset, length, text in extract_records(data):
        if text in SKIP:
            continue
        translated = translate(text)
        if translated == text:
            unresolved.add(text)
            continue
        if has_untranslated_ascii(translated):
            mixed_ascii.add(f"{text} => {translated}")
        try:
            encoded = encode_p5r(translated, char_map)
        except KeyError as exc:
            unresolved.add(f"{text} => {translated} [{exc}]")
            continue
        if len(encoded) > length:
            too_long.add(f"{text} => {translated} ({len(encoded)}>{length})")
            continue
        data[offset : offset + len(encoded)] = encoded
        data[offset + len(encoded) : offset + length] = b"\x00" * (length - len(encoded))
        changed += 1

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(data)
    REPORT_PATH.write_text(
        "UNRESOLVED\n"
        + "\n".join(sorted(unresolved))
        + "\n\nTOO_LONG\n"
        + "\n".join(sorted(too_long))
        + "\n\nMIXED_ASCII\n"
        + "\n".join(sorted(mixed_ascii))
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote: {OUTPUT_PATH}")
    print(f"Report: {REPORT_PATH}")
    print(f"Changed: {changed}")
    print(f"Unresolved: {len(unresolved)}")
    print(f"TooLong: {len(too_long)}")
    print(f"MixedAscii: {len(mixed_ascii)}")


if __name__ == "__main__":
    main()
