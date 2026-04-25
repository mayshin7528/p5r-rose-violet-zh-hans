# P5R Rose & Violet 简中汉化协作仓库

这是 `Rose & Violet v1.0.10` 的简体中文汉化协作仓库，用来同步进度记录、术语表、文案记录和已经完成的可编辑源稿。

## 协作规则

- 仓库保持私有，不公开发布原 Mod 或游戏资源。
- `Rose` 和怪盗代号保留英文；角色本名翻译为中文。
- `Inari` 译为“小狐狸”，`Lady Ann` 译为“杏大人”。
- 按文件顺序推进，不按剧情顺序强制推进。
- 每批完成后至少执行：编译、同步已安装模组、清缓存、看日志。
- 没有对应存档时，文案记录标为 `已部署待实测`。
- 新游戏开场赌场作为固定加载烟测点。

## 主要文件

- `汉化计划书.md`
- `汉化进度记录.md`
- `对话框与右上气泡汉化接手指南.md`
- `名字和称呼统一表.md`
- `中文文案记录/README.md`
- `中文文案记录/索引.md`

## 日常流程

1. 开始前先拉最新：

```powershell
git pull
```

2. 做一个自己的分支：

```powershell
git switch -c your-name/e113-001
```

3. 完成一批后加入文案记录和源稿。普通文档直接 add；位于被忽略资源目录里的源稿要用 `-f`：

```powershell
git add 汉化进度记录.md 名字和称呼统一表.md 中文文案记录
git add -f "P5REssentials/CPK/EN.CPK/EVENT_DATA/MESSAGE/E100/E113_001.BMD.msg"
git commit -m "汉化 E113_001"
git push -u origin your-name/e113-001
```

4. 在 GitHub 上开 Pull Request，让另一个人确认术语、编译记录和状态后合并。

## 不进仓库的内容

`.BMD`、`.BF`、`.TBL`、工具、备份目录、缓存、DLL、贴图和音频等默认不提交。需要交付编译成品时，先在本地同步到已安装模组；GitHub 仓库主要负责协作和审稿。
