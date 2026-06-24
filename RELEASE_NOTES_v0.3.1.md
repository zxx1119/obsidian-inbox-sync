# v0.3.1 Release 说明

## 问题

v0.3.0 把图片存到 `笔记名-assets/` 子文件夹后出现两个毛病：

1. **笔记在 Obsidian 文件树里点不开** —— 笔记名本身是一句话（比如"这两天看到一个说法，说在国内其实没有真正"），生成的 `笔记名-assets/` 文件夹跟 `.md` 文件名几乎一样，Obsidian 把它们折叠成一个节点，点进去只看到图片，找不到正文入口。

2. **正文被图片挤掉** —— 图片用 `![]()` 嵌入式引用，打开笔记图片直接渲染，正文只剩一行被压在中间。

## 改动

1. **图片统一存到 vault 根的 `inBox/assets/` 目录**
   - 不再每篇笔记建 `笔记名-assets/` 子文件夹
   - `.md` 文件不再被 Obsidian 折叠成"文件夹节点"，点开就是正文
   - 跨设备同步（同 vault 结构）路径稳定，不会因盘符变化失效

2. **图片引用从 `![]()` 改成 `[]()`**
   - 图片不再直接渲染进笔记，正文不会被挤掉
   - 点击链接即可在 Obsidian 里跳转查看原图
   - 视频、音频也一并改成跳转链接

3. **批注资源同步走全局 `inBox/assets/`**
   - 跟主笔记保持一致，不再用父笔记名建子文件夹

## 不影响的部分

- 现有已同步的笔记**不动**（旧 `笔记名-assets/` 文件夹保持原样，需要的话可自行迁移或删除）
- 笔记正文、批注、标签逻辑全部不变
- 只影响新同步的笔记

## 升级方式

1. 下载本 Release 的 `main.js`、`manifest.json`、`styles.css`
2. 覆盖 vault 的 `.obsidian/plugins/inbox-sync/` 目录下同名文件
3. 重启 Obsidian 或在插件设置里 reload

## 涉及代码

- `src/sync/asset-handler.ts` — `getAssetLocalPath` 改返回 `inBox/assets/文件名`
- `src/sync/markdown-writer.ts` — `buildAssetBlock` / `buildAnnotationBlock` / `collectAssetLines` 改 assetDir 和引用格式
