# 翻译管理器

从仓库根目录运行 `start_translation_manager.cmd`，访问 `http://127.0.0.1:4178/`。

- 基础数据：`translations/catalog/*.csv.gz`
- 人工译文：`translations/overrides.csv`
- 构建状态：`translations/resource_status.json`
- 临时构建：`build/translation_manager/`

点击编译后，管理器会调用 `scripts/build_translation_patch.js`，将成功产物同时写入仓库标准 Mod 路径和已安装汉化 Mod，并备份原文件。仍含整句英文的资源不会覆盖。

管理器默认只显示“未核对”条目。已核对条目默认只读，后续自动处理脚本必须跳过 `reviewed_at` 非空的记录；如需继续修改，可在“已核对”或“全部状态”中点击“取消核对”解锁。

外部路径可通过 `ROSE_ORIGINAL_MOD`、`ROSE_INSTALLED_MOD`、`ROSE_REFERENCE_MOD`、`ROSE_COMPILER` 和 `ROSE_CACHE` 环境变量覆盖。

## 便携审核版

从仓库根目录运行 `node tools/build_portable_translation_manager.js`。生成目录为 `dist/Rose-Translation-Reviewer/`；将该目录压缩后即可发给测试人员。

便携包内含只读的完整文本目录和打包时的 `overrides.csv` 快照。测试员运行 `start_reviewer.cmd` 后可搜索、修改译文和标记核对；不会写入主仓库，也不能编译或部署。点击顶部的大号“保存审核结果”按钮会下载带时间戳的 `rose-review-*.json`，将该文件发回维护者即可。

主管理器顶部可导入审核 JSON。仅改变核对状态且未改译文的记录会自动合并，并保留主库当前译文；双方都修改了译文时会显示两边文本及更新时间，由维护者逐条选择。

主库更新不需要重发完整便携包：维护者在主管理器点击“导出主库更新包”，将生成的 `rose-master-update-*.json` 发给测试员。测试员在便携版点击“导入主库更新包”，本地审核记录会在新主库上重新对齐；双方都改过的句子会逐条询问保留测试员版本或采用新主库版本。应用后便携服务自动重启。
