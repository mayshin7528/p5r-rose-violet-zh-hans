# 2026-04-23 kasumiasprotag 中文兼容首轮修复

## 这次修了什么

目标目录：

- `C:\Reloaded-II\Mods\p5rpc.kasumiasprotag\FEmulator\L10N\zh-Hans`

这次不是重打整个压缩包，而是先修实际安装目录里的简中覆盖层。

## 备份

动手前已把 30 个 `zh-Hans` 覆盖文件备份到：

- `排错记录\backup_p5rpc.kasumiasprotag_zh-Hans_2026-04-23`

## 主要改动

### 1. 去掉不受支持的全角空格

`P5R_CHS` 不支持 `U+3000` 全角空格。编译器会编码说话人名，所以类似：

- `坂本　龙司`
- `新岛　真`
- `明智　吾郎`

也会报错。

这次已在以下文件里去掉全角空格：

- `CORP008.msg`
- `E229_002.msg`
- `E234_001.msg`
- `E511_030.msg`
- `E726_062.msg`
- `E726_400.msg`
- `FHIT_002_002_00.msg`
- `FHIT_002_002_01.msg`
- `FHIT_002_002_02.msg`
- `SCRIPTCHAT_991.msg`

并额外把 `E700_300.msg` 里的半角姓名空格改掉。

### 2. 修掉半角英文署名

`MYPIMAGEMSG.msg` 里原本有半角 `mod`、`@trillmunch`、`(twitter)`、`/` 等字符，中文编码下会报错。

这次已改成：

- `mod` -> `模组`
- 作者名保留为全角英文写法
- 去掉半角空格、括号和斜杠平台说明

### 3. 修掉不支持的破折号

`E160_012.msg` 里原本有 `——`，当前字符表不支持。

这次改成了 `―`。

### 4. 补齐 E760 三个文件缺失的窗口名

`E760_501.msg`、`E760_701.msg`、`E760_811.msg` 原本只有：

- `SEL_WhatNextTime`

但对应 `.flow` 会引用：

- `SYSTEM_InviteRule`
- `MSG_NextTimeOK_CurryNG_F`
- `MND_ThanksSojiro`

这会导致 `Referenced undeclared variable 'SYSTEM_InviteRule'`。

这次已在三份 `zh-Hans` 覆盖文件末尾补了最小中文窗口，且保留 `SEL_WhatNextTime` 在第一位。

## 验证结果

已用本地 `AtlusScriptCompiler.exe` 验证：

- `zh-Hans` 下 30 个 `.msg` 全部能用 `P5R_CHS` 编译通过
- `E760_501.flow`
- `E760_701.flow`
- `E760_811.flow`

这三个流程在临时目录中配合修过的中文 `.msg` 导入后，均能编译通过。

## 缓存处理

为了避免下次启动继续吃旧缓存，已把旧缓存目录改名留档：

- 原目录：`C:\Reloaded-II\Mods\p5rpc.modloader\Cache\P5R_zh-Hans`
- 新目录：`C:\Reloaded-II\Mods\p5rpc.modloader\Cache\P5R_zh-Hans.before-compatfix-20260423_204457`

下次启动时应该会重新生成新的 `P5R_zh-Hans` 缓存。

## 下一步测试

下一步直接用中文环境启动游戏，看新的日志里是否还出现：

- `Encoding P5R_CHS does not support character`
- `Referenced undeclared variable 'SYSTEM_InviteRule'`
- `Failed to compile bf`

如果还有新报错，再按新日志继续补第二轮。
