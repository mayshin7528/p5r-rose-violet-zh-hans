# P5R Rose & Violet 简体中文补丁

本仓库同时包含可安装补丁、最终译文数据和翻译管理器。仓库根目录就是 Reloaded-II Mod 目录结构，不需要从 `build` 中寻找成品。

## 目录

| 路径 | 内容 |
| --- | --- |
| `ModConfig.json` | Reloaded-II Mod 元数据 |
| `P5REssentials/` | 已编译的 CPK 覆盖文件与部分 MSG 源文本 |
| `FEmulator/` | FEmulator 文本覆盖 |
| `Characters/` | 原 Mod 同路径的角色相关覆盖 |
| `translations/catalog/*.csv.gz` | 管理器只读基础数据：官方中文、Mod 英文、当前基础中文 |
| `translations/overrides.csv` | 人工修改后的最终译文，今后编辑以此文件为准 |
| `translations/resource_status.json` | 每个资源最近一次构建状态 |
| `tools/translation-manager/` | 本地翻译管理器 |
| `scripts/` | 构建、部署和译文目录维护脚本 |
| `references/` | BF 回编所需的少量流程修复和官方名称表 |

## 安装

将整个仓库目录放到：

```text
Reloaded-II/Mods/p5rpc.kasumi.roseandviolet.zh-hans
```

并在 Reloaded-II 中同时启用原版 Rose & Violet Mod 与本汉化补丁。

## 强制中文姓名

本补丁 0.2.0 起自带“强制主角姓名为‘芳泽霞’”开关，默认开启。它只改变游戏读取姓名时的显示结果，不会改写存档中的姓名。

在 Reloaded-II 中打开本汉化补丁的“配置”即可切换。开启后各类姓名调用分别为：

- 名：霞
- 姓：芳泽
- 全名：芳泽霞（中文顺序，无空格）

请停用独立的 `Force (Custom) Protagonist Name` Mod，否则两个 Mod 会同时 hook 相同函数，显示结果取决于加载顺序。

## 翻译管理器

双击 `start_translation_manager.cmd`，浏览器会打开 `http://127.0.0.1:4178/`。

管理器可以搜索、筛选、编辑译文，并按资源编译和部署。编辑内容写入 `translations/overrides.csv`，不会修改压缩基础目录。

## 本机依赖

默认路径与当前开发环境一致：

```text
原英文 Mod: F:\Reloaded-II\Mods\p5rpc.kasumi.roseandviolet
测试汉化 Mod: F:\Reloaded-II\Mods\p5rpc.kasumi.roseandviolet.zh-hans
反编译参考: F:\Rose\references\violet_mod_decompiled
编译器: F:\Rose\AtlusScriptTools\AtlusScriptCompiler.exe
编码表: F:\Rose\AtlusScriptTools\Charsets\P5R_CHS_ROSE.tsv
```

可以通过环境变量覆盖：`ROSE_ORIGINAL_MOD`、`ROSE_INSTALLED_MOD`、`ROSE_REFERENCE_MOD`、`ROSE_COMPILER`、`ROSE_CACHE`。

## 全量构建与部署

```powershell
node --max-old-space-size=8192 scripts/build_translation_patch.js --build
node scripts/prepare_release_tree.js
node scripts/deploy_translation_build.js
node scripts/mark_deployed_overrides.js
```

构建目录 `build/` 是临时目录，不进入 Git。部署脚本只覆盖原英文 Mod 中存在同路径的文件。

## 当前状态

- 文本记录：187753 条
- 资源：3799 个
- 最近一次成功编译：3433 个资源，失败 0
- 仍含整句英文而跳过：363 个资源，其中主 Mod 72 个
- 已编译成品已经合并到仓库根部 Mod 目录

详细记录见 `docs/最终编译部署报告_20260807.md`。
