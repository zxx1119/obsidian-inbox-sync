# inBox Sync for Obsidian

将 [inBox](https://inbox.gudong.site) 笔记同步到 Obsidian vault 的插件。

## 功能

- 支持从 inBox 云存储（WebDAV/S3）同步笔记
- 单向同步：inBox → Obsidian
- 智能增量同步：仅同步有变化的笔记
- 完整资源支持：图片、视频、录音、附件
- 自动标签提取：支持层级标签（`#tag/subtag`）
- 可配置同步间隔和文件夹结构
- **批注内联**：批注内容直接拼到父笔记末尾，父笔记成为完整可对照阅读的文档（不再散落成独立文件）
- **按标签分文件夹**：按主标签建子目录归档笔记，无标签笔记留在根目录

## Fork 说明

本仓库 fork 自 [maoruibin/obsidian-inbox-sync](https://github.com/maoruibin/obsidian-inbox-sync)，在原版基础上做了两项增强：

1. **批注聚合到父笔记**：原版把每条批注同步成独立 `.md` 文件，父笔记末尾用嵌入引用拼接，阅读时需要来回跳转。本 fork 支持把批注正文直接内联到父笔记的「## 批注」区块，带标题和时间戳，父笔记成为一份完整文档。

2. **按标签自动分类**：原版所有笔记平铺在 `inBox/` 一个目录，只把标签写进 frontmatter，没有目录层面的聚合。本 fork 支持按主标签（第一个标签）建子文件夹归档，支持嵌套标签（`#日记/生活` → `inBox/日记/生活/`）。

两项功能均可在设置中开关，默认开启。详细改动见 [CHANGES.md](./CHANGES.md)。

## 安装

### 方法1：手动安装

1. 下载最新版本的 `main.js` 和 `manifest.json`
2. 将文件放入 Obsidian vault 的插件目录：`.obsidian/plugins/obsidian-inbox-sync/`
3. 在 Obsidian 设置中启用插件

### 方法2：开发模式

```bash
cd obsidian-inbox-sync
npm install
npm run dev
```

## 配置

### WebDAV 配置

1. 在设置中选择存储类型为 "WebDAV"
2. 填写 WebDAV 服务器地址、用户名、密码
3. 设置 inBox 数据路径（默认：`/inbox/`）

### S3 配置

1. 在设置中选择存储类型为 "S3 Compatible"
2. 填写 S3 端点、Access Key、Secret Key、Bucket
3. 设置 Region 和路径前缀

### 同步设置

- **Vault 文件夹路径**：笔记在 vault 中的存储位置（默认：`inBox`）
- **自动同步间隔**：自动同步的时间间隔（分钟）
- **冲突处理策略**：遇到已存在文件时的处理方式

### 笔记组织方式（本 fork 新增）

- **按标签分文件夹**（默认开启）：按主标签建子目录归档笔记，无标签笔记留在根目录。支持嵌套标签（`#日记/生活` → `inBox/日记/生活/`）
- **标签目录根**（默认空）：标签子文件夹的父目录名，留空则直接在存储路径下建标签目录
- **批注内联到父笔记**（默认开启）：批注内容拼到父笔记末尾，不再为每条批注生成独立文件

关闭「按标签分文件夹」和「批注内联到父笔记」即回到原版行为。

## 目录结构

开启「按标签分文件夹」后，同步目录结构示例：

```
inBox/
├── 日记/
│   └── 生活/
│       ├── 2026-04-10.md
│       └── 2026-04-11.md
├── 技术/
│   └── 前端/
│       └── React学习笔记.md
├── assets/          # 资源文件
│   ├── images/
│   ├── videos/
│   ├── audios/
│   └── attachments/
├── 无标题-20260412.md   # 无标签笔记留在根目录
└── .inbox-sync-meta.json  # 同步元数据
```

## Markdown 格式

开启「批注内联到父笔记」后，父笔记末尾会追加批注区块：

```markdown
---
title: 今日记录
inbox_id: note-abc123
created: 2025-04-10T10:30:00.000Z
updated: 2025-04-10T10:30:00.000Z
tags:
  - 日记/生活
---

今天天气不错 #心情/开心

---

## 批注

### 补充
> _2025-04-10 14:30_

后来下雨了，带了伞。

### 回顾
> _2025-04-11 09:15_

那天其实没下雨，白带了。
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建生产版本
npm run build
```

## 数据格式兼容性

本插件与 inBox Android/Flutter 版本共享数据格式：
- `XBlock`：笔记数据结构
- `XTag`：标签数据结构
- `XResourceInfo`：资源信息结构

## 许可证

MIT

## 相关链接

- [inBox Web 版](https://inbox.gudong.site)
- [inBox 文档](https://doc.gudong.site)
