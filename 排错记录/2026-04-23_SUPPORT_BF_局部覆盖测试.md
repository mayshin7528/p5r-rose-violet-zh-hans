# 2026-04-23 SUPPORT.BF 局部覆盖测试

## 触发原因

用户测试后确认不再闪退，但截图中的支援对话仍显示英文：

- `But I have to say, showing yourself above that crowd earlier was an excellent move.`
- `Nice work as always, Rose.`
- `I bet Skull wouldn't pull it off that smoothly.`
- `This happens because you have no sense for aesthetics.`
- `Nobody asked you, Inari!`

这些文本不在 `E100_002.BMD`，而是在：

- `C:\Reloaded-II\Mods\p5rpc.kasumi.roseandviolet\P5REssentials\CPK\EN.CPK\FIELD\PARTY\SUPPORT.BF`

因此，`E100_002.BMD` 回滚后不闪退是正确方向；本轮“不汉化”是因为测试画面读到的是 `SUPPORT.BF`。

## 定位结果

已用 `AtlusScriptCompiler.exe -Decompile -Library p5r -Encoding P5R_EFIGS` 反编译 `SUPPORT.BF`，目标窗口为：

- `D150_support_mes01_A`
- `D150_support_mes01_B`
- `D150_support_mes01_C`
- `D150_support_mes02_A`
- `D150_support_mes02_B`
- `D150_support_mes04_A`
- `D150_support_mes04_B`
- `D150_support_mes04_C`
- `D150_support_mes05_A`
- `D150_support_mes05_B`

`SUPPORT.BF` 完整反编译后有 4682 个消息窗口，不适合整包重编测试；本轮采用最小局部覆盖。

## 本轮改动

新增工作区源文件：

- `FEmulator\BF\FIELD\PARTY\SUPPORT.msg`

同步到已安装模组：

- `C:\Reloaded-II\Mods\p5rpc.kasumi.roseandviolet\FEmulator\BF\FIELD\PARTY\SUPPORT.msg`

没有替换原始二进制：

- `P5REssentials\CPK\EN.CPK\FIELD\PARTY\SUPPORT.BF` 保持原样

旧缓存已重命名：

- `C:\Reloaded-II\Mods\p5rpc.modloader\Cache\P5R_zh-Hans.before-SUPPORT-partial-20260423_222507`

备份目录：

- `排错记录\backup_SUPPORT_partial_patch_20260423_222507`

## 验证

已对已安装的 `SUPPORT.msg` 执行：

```text
AtlusScriptCompiler.exe SUPPORT.msg -Compile -Library p5r -Encoding P5R_CHS -OutFormat V1
```

结果：

- 编译通过
- 10 个目标窗口全部能被 `P5R_CHS` 字符表接受
- 工作区文件和已安装文件 SHA256 一致

## 下一次启动重点

下一次启动后重点看：

- 是否出现 `FIELD\PARTY\SUPPORT.BF` / `SUPPORT.msg` 的 BF Builder 记录
- 截图这组支援对话是否变为中文
- 是否仍无闪退

如果仍显示英文，说明该路由没有被 FEmulator 源文件覆盖到，下一步再考虑更靠近运行时实际路径的挂载方式；暂时不建议直接替换 `SUPPORT.BF`。

## 用户复测后的修正

用户复测后仍显示英文。新日志确认：

- `SUPPORT.msg` 已经被 FEmulator 找到
- BF Builder 确实尝试编译 `FIELD\PARTY\SUPPORT.BF`
- 失败原因不是路径，而是局部覆盖时原始 `SUPPORT.BF` 里剩余英文窗口也会被按 `P5R_CHS` 编译

日志关键报错：

```text
Failed to compile ... FIELD\PARTY\SUPPORT.BF with source files:
C:\Reloaded-II\Mods\p5rpc.kasumi.roseandviolet\FEmulator\BF\FIELD\PARTY\SUPPORT.msg
Error: Encoding P5R_CHS does not support character: . (.)
```

因此，`SUPPORT.BF` 不能只给 10 条局部 msg；必须给完整 msg 覆盖，避免原始英文文本参与 `P5R_CHS` 编译。

## 完整覆盖测试

已从反编译出的 `SUPPORT.BF.msg` 生成完整覆盖版：

- 总窗口数：4682
- 目标 10 条改为中文
- 其余英文先机械转为 `P5R_CHS` 支持的全角英文占位
- 原始 U+2014 长破折号统一替换为 `―`

已安装到：

- `C:\Reloaded-II\Mods\p5rpc.kasumi.roseandviolet\FEmulator\BF\FIELD\PARTY\SUPPORT.msg`

本轮备份：

- `排错记录\backup_SUPPORT_msg_before_full_20260423_223533`
- `排错记录\backup_SUPPORT_full_install_20260423_223817`

旧缓存已重命名：

- `C:\Reloaded-II\Mods\p5rpc.modloader\Cache\P5R_zh-Hans.before-SUPPORT-full-20260423_223817`

安装后验证：

```text
AtlusScriptCompiler.exe SUPPORT.msg -Compile -Library p5r -Encoding P5R_CHS -OutFormat V1
```

结果：

- 已安装版编译通过
- 输出 BMD 大小：606957 字节
- 工作区文件和已安装文件 SHA256 一致

下一轮测试重点：

- `FIELD\PARTY\SUPPORT.BF` 是否成功 Created/Registered
- 目标截图台词是否变成中文
- 其他支援台词可能暂时显示为全角英文占位，这是完整覆盖测试的预期副作用

## 用户实测结果

用户复测截图确认完整覆盖版已生效，目标支援对话显示中文：

```text
这就是因为你完全没有
美学品味。
```

结论：

- `FEmulator\BF\FIELD\PARTY\SUPPORT.msg` 的完整覆盖路线可用
- 对 `SUPPORT.BF` 这类 BF 文件，局部 msg 覆盖不足以避免原始英文参与 `P5R_CHS` 编译
- 后续处理同类 BF 文件时，应优先使用“完整反编译 msg + 目标文本翻译 + 未翻译文本先转全角占位”的工作流
- 暂不直接替换原始 `SUPPORT.BF` 二进制

后续建议：

1. 保留当前 `SUPPORT.msg` 作为已验证模板。
2. 继续把 `SUPPORT.msg` 中的全角英文占位逐批翻成正式中文。
3. 用同一思路回看 `E100_002`：直接替换 `.BMD` 会闪退，局部 L10N 未生效，下一步应验证完整源文件/完整覆盖路线。
