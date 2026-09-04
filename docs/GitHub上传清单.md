# GitHub 上传清单

## 应上传

- `ModConfig.json`
- `P5REssentials/`
- `FEmulator/`
- `Characters/`
- `translations/`
- `tools/translation-manager/`
- `scripts/` 中 Git 可见的 6 个维护脚本
- `references/`
- `docs/`
- `README.md`
- `start_translation_manager.cmd`
- `.gitignore` 与 `.gitattributes`

这些内容合计约 85 MiB，最大单文件约 4.8 MiB，可直接上传 GitHub，不需要 Git LFS。

## 不上传

- `build/`：编译日志、源文件展开、临时输出、重试构建与部署备份
- `reports/`：已经被 `translations/` 取代的矩阵、评分和过程审查报告
- CPK 实验工具、第三方 EXE/DLL
- `.Rhistory`、日志和运行时文件

以上内容已经由 `.gitignore` 排除。它们即使暂时留在本机，也不会进入提交。

## 建议上传命令

```powershell
git add -A
git status
git commit -m "Package Chinese patch, translations and manager"
git push
```

执行 `git add -A` 后，先确认没有 `build/` 或 `reports/` 文件进入暂存区。

## 权威路径

- 最终人工译文：`translations/overrides.csv`
- 基础对照数据：`translations/catalog/*.csv.gz`
- 最近资源状态：`translations/resource_status.json`
- 编译后 Mod：仓库根目录下的 `P5REssentials/`、`FEmulator/`、`Characters/`
- 翻译管理器：`tools/translation-manager/`
