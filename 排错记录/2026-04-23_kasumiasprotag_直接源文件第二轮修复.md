# 2026-04-23 kasumiasprotag 直接源文件第二轮修复

## 新日志变化

这次查看的是汉化目录里的新日志：

- `汉化\p5r__rose__violet_-_story_overhaul1_0_10\控制台日志.txt`

根目录下的 `控制台日志.txt` 仍是旧时间，不作为本轮判断依据。

新日志相比首轮前已经有明显变化：

- `SYSTEM_InviteRule`：0
- `Script Compiler`：0
- `[BfEmulator] Failed`：0
- `Failed to compile`：28
- `Encoding P5R_CHS does not support character`：27
- `Sequence contains no elements`：1

说明首轮补的 E760 窗口名已经生效，当前进入的是下一层：缓存重建时直接编译 `OptionalModFiles` 与 Rose/Violet 的原始 `.msg/.flow` 源文件。

## 本轮判断

`FEmulator\L10N\zh-Hans` 下的同名文件已经能通过 `P5R_CHS` 编译，但 Mod Loader 在部分路径不会只读取 L10N 覆盖层，而是会直接拿源目录里的 `.msg` 编译。

因此本轮没有解压压缩包重做，而是继续修实际安装目录里的源文件副本。

## 备份

动手前已备份 25 个直接源 `.msg` 到：

- `排错记录\backup_direct_source_msgs_round2_20260423_214501`

## 同步修复

已把通过首轮验证的中文兼容版 `.msg` 同步到日志点名的直接源目录，包括：

- `CORP008.msg`
- `SCRIPTCHAT_991.msg`
- `E511_030.msg`
- `E760_501.msg`
- `E760_701.msg`
- `E760_811.msg`
- `E761_101.msg`
- `FHIT_009_002_00.msg`
- `FHIT_002_002_00.msg`
- `FHIT_002_002_01.msg`
- `FHIT_002_002_02.msg`
- `FHIT_002_003_00.msg`
- `FHIT_002_003_01.msg`
- `FHIT_002_003_02.msg`
- `E229_002.msg`
- `E234_001.msg`
- `MYPIMAGEMSG.msg`

涉及的安装目录主要是：

- `C:\Reloaded-II\Mods\p5rpc.kasumiasprotag\OptionalModFiles\...`
- `C:\Reloaded-II\Mods\p5rpc.kasumi.roseandviolet\FEmulator\BF\...`

## 验证

已在临时目录中验证：

- 6 个直接 `.msg` 源文件用 `P5R_CHS` 编译通过
- `E760_501.flow`
- `E760_701.flow`
- `E760_811.flow`
- 两份 `E761_101.flow`
- 两份 `FSCR3210_010_000.flow`

以上流程在临时复制环境中编译通过。

`FHIT_*` 场景触发类 `.flow` 单独编译仍会失败，但错误是缺少外部过程，例如：

- `SUB_KFEVT_CHK_TOILET_WOMEN`

这不是字符编码问题，而是离线单文件编译缺少游戏合并环境里的外部过程。对应 `.msg` 已替换为中文兼容版。

## 缓存处理

为了强制下次启动重新生成缓存，已把本轮测试生成的新缓存改名留档：

- 原目录：`C:\Reloaded-II\Mods\p5rpc.modloader\Cache\P5R_zh-Hans`
- 新目录：`C:\Reloaded-II\Mods\p5rpc.modloader\Cache\P5R_zh-Hans.before-round2-direct-source-20260423_214718`

## 下一步测试

再次用简中环境启动游戏，让 Mod Loader 重建 `P5R_zh-Hans`。

重点观察新日志里是否还出现：

- `Encoding P5R_CHS does not support character`
- `Sequence contains no elements`
- `Failed to compile bf`

如果还有报错，就按新日志继续第三轮。
