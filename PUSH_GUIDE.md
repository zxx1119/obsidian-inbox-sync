# 推送到你的 GitHub Fork —— 操作指引

## 你需要手动做的部分（在 GitHub 网页上）

### 第 1 步：Fork 原仓库

1. 浏览器打开原仓库：https://github.com/maoruibin/obsidian-inbox-sync
2. 右上角点 **Fork** 按钮
3. Owner 选你的账号 `zxx1119`
4. Repository name 保持 `obsidian-inbox-sync`
5. 点 **Create fork**

完成后你会得到：`https://github.com/zxx1119/obsidian-inbox-sync`

### 第 2 步：获取 GitHub Personal Access Token（用于推送）

因为本地没装 `gh` CLI，也没配 SSH key，用 HTTPS + token 最简单：

1. 打开 https://github.com/settings/tokens?type=beta
2. 点 **Generate new token**
3. 设置：
   - Token name: `push-inbox-sync`（随便起）
   - Expiration: 30 天（够用就行）
   - Repository access: 选 **Only select repositories** → 选 `zxx1119/obsidian-inbox-sync`
   - Permissions → Repository permissions → **Contents**: Read and write
4. 点 **Generate token**
5. **复制 token**（只显示一次，关闭页面就看不到了）

---

## 我已经替你做好的部分

- 改动已 commit 到本地 `main` 分支（commit `d570452`）
- README 已加 Fork 说明和功能文档
- CHANGES.md 已写好详细改动说明
- `.gitignore` 已经排除 `main.js`、`node_modules/`、`package-lock.json`
- git 身份已配置（本仓库级别）：`zxx1119` / `zxx1119@users.noreply.github.com`

---

## 推送命令（你在终端执行）

把下面的 `<你的TOKEN>` 换成第 2 步复制的 token，然后在项目目录执行：

```bash
cd "D:/摘星星/Documents/WorkBuddy/2026-06-23-22-14-42/obsidian-inbox-sync"

# 把 origin 指向你的 fork（原仓库改名为 upstream，保留可拉取上游更新）
git remote rename origin upstream
git remote add origin https://<你的TOKEN>@github.com/zxx1119/obsidian-inbox-sync.git

# 推送到你的 fork
git push -u origin main
```

推送成功后，打开 `https://github.com/zxx1119/obsidian-inbox-sync` 应该能看到你的代码和 commit。

> 推送完可以再把 token 从 remote URL 里去掉，改回不带 token 的地址：
> ```bash
> git remote set-url origin https://github.com/zxx1119/obsidian-inbox-sync.git
> ```
> 下次推送时 git 会弹窗让你登录（Windows 凭据管理器会记住）。

---

## 可选：给原作者提 PR

如果你想把这些改动贡献回原仓库：

1. 推送到你的 fork 后，打开 `https://github.com/zxx1119/obsidian-inbox-sync`
2. 页面顶部会出现 **Compare & pull request** 按钮，点它
3. 标题写：`feat: 批注内联到父笔记 + 按标签分文件夹归档`
4. 正文可以贴 CHANGES.md 的内容
5. 点 **Create pull request**

原作者审阅后决定是否合并。不提 PR 也完全没问题，自己用就行。

---

## 本地清理

推送完成后，如果你想本地不留任何构建产物和原文件，执行：

```bash
cd "D:/摘星星/Documents/WorkBuddy/2026-06-23-22-14-42"

# 删除整个项目目录（包括 node_modules、main.js、源码全部）
rm -rf obsidian-inbox-sync
```

如果想保留源码但删掉构建产物：

```bash
cd "D:/摘星星/Documents/WorkBuddy/2026-06-23-22-14-42/obsidian-inbox-sync"
rm -f main.js
rm -rf node_modules
```

代码已经在你的 GitHub fork 里，随时可以重新 clone。
