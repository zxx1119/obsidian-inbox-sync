/**
 * 全局 i18n 工具
 * 供 main.ts、sync-manager.ts、settings-tab.ts 共用，
 * 避免 Notice / notify 消息硬编码中文。
 */

type LangKey = "zh" | "en";

export function getLang(): LangKey {
  const lang =
    navigator.language ||
    window.localStorage.getItem("language") ||
    "en";
  return lang.startsWith("zh") ? "zh" : "en";
}

type Translations = Record<string, { zh: string; en: string }>;

const translations: Translations = {
  // ===== main.ts: Notice 消息 =====
  initFailed:       { zh: "inBox Sync 初始化失败: {0}",   en: "inBox Sync init failed: {0}" },
  syncInProgress:   { zh: "同步正在进行中...",            en: "Sync is already in progress..." },
  syncStarting:     { zh: "正在从 inBox 同步...",         en: "Starting sync from inBox..." },
  syncComplete:     { zh: "同步完成: {0} 新增, {1} 更新, {2} 个资源下载", en: "Sync complete: {0} new, {1} updated, {2} assets downloaded" },
  syncWithErrors:   { zh: "同步结束，{0} 条笔记、{1} 个资源失败", en: "Sync finished with errors: {0} notes, {1} assets failed" },
  syncFailed:       { zh: "同步失败: {0}",                en: "Sync failed: {0}" },
  configWebdav:     { zh: "请在设置中完善 WebDAV 配置",   en: "Please complete WebDAV configuration in settings" },
  configS3:         { zh: "请在设置中完善 S3 配置",       en: "Please complete S3 configuration in settings" },
  configVaultPath:  { zh: "请在设置中配置本地存储路径",   en: "Please set the vault folder path in settings" },

  // ===== sync-manager.ts: notify 消息 =====
  syncBegin:           { zh: "开始同步...",                          en: "Starting sync..." },
  scanCloud:           { zh: "扫描云端文件列表...",                   en: "Scanning cloud files..." },
  processDeletes:      { zh: "处理云端删除 ({0} 条)...",             en: "Processing cloud deletions ({0})..." },
  downloadNotes:       { zh: "下载变化的笔记 ({0} 条)...",           en: "Downloading changed notes ({0})..." },
  parseNote:           { zh: "解析笔记 {0}/{1}...",                  en: "Parsing note {0}/{1}..." },
  writeNote:           { zh: "写入笔记 {0}/{1}...",                  en: "Writing note {0}/{1}..." },
  downloadBatch:       { zh: "下载笔记 {0}/{1} (成功: {2}, 失败: {3})", en: "Downloading notes {0}/{1} (ok: {2}, fail: {3})" },
  settingsChanged:     { zh: "检测到笔记组织配置变化，执行全量重同步...", en: "Note organization settings changed, performing full resync..." },
  cleanupAnnotations:  { zh: "清理旧的独立批注文件...",               en: "Cleaning up old standalone annotations..." },
  syncDone:            { zh: "同步完成！新增 {0}, 更新 {1}, 删除 {2}, 跳过 {3} ({4}s)", en: "Sync done! New {0}, updated {1}, deleted {2}, skipped {3} ({4}s)" },
  syncCancelled:       { zh: "同步已取消",                           en: "Sync cancelled" },
  syncCancelledThrow:  { zh: "同步已取消",                           en: "Sync cancelled" },
  syncError:           { zh: "同步错误: {0}",                        en: "Sync error: {0}" },
  unsupportedStorage:  { zh: "不支持的存储类型: {0}（请检查插件配置）", en: "Unsupported storage type: {0} (check plugin config)" },
  clientInitFailed:    { zh: "云存储客户端初始化失败",               en: "Cloud storage client initialization failed" },
  parseNoteFailed:     { zh: "解析笔记 {0} 失败: {1}",              en: "Parse note {0} failed: {1}" },
  writeNoteFailed:     { zh: "写入笔记 {0} 失败: {1}",              en: "Write note {0} failed: {1}" },
};

/**
 * 获取翻译文本
 * @param key 翻译键
 * @param args 替换参数（{0}, {1}, ...）
 */
export function t(key: string, ...args: (string | number)[]): string {
  const lang = getLang();
  let text = translations[key]?.[lang] ?? translations[key]?.["en"] ?? key;
  args.forEach((arg, i) => {
    text = text.replace(`{${i}}`, String(arg));
  });
  return text;
}

/**
 * 设置面板用的翻译字典（含更多 UI 文案）
 * 供 settings-tab.ts 导入
 */
export const uiTranslations: Translations = {
  title: { zh: "inBox 同步设置", en: "inBox Sync Settings" },
  description: {
    zh: "配置你的 inBox 云存储，将笔记同步到 Obsidian Vault。",
    en: "Configure your inBox cloud storage to sync notes to your Obsidian vault.",
  },
  storageType: { zh: "存储类型", en: "Storage type" },
  storageTypeDesc: { zh: "选择云存储服务", en: "Choose your cloud storage provider" },
  s3Option: { zh: "S3 兼容存储", en: "S3 compatible" },
  webdavTitle: { zh: "WebDAV 配置", en: "WebDAV Configuration" },
  webdavUrl: { zh: "服务器地址", en: "Server URL" },
  webdavUrlDesc: { zh: "WebDAV 服务器地址（如 https://dav.example.com）", en: "WebDAV server URL (e.g., https://dav.example.com)" },
  webdavUsername: { zh: "用户名", en: "Username" },
  webdavUsernameDesc: { zh: "WebDAV 登录用户名", en: "WebDAV login username" },
  webdavPassword: { zh: "授权密码", en: "Authorization password" },
  webdavPasswordDesc: { zh: "WebDAV 授权密码（第三方应用专用密码）", en: "WebDAV app-specific authorization password" },
  s3Title: { zh: "S3 配置", en: "S3 Configuration" },
  s3Endpoint: { zh: "Endpoint", en: "Endpoint" },
  s3EndpointDesc: { zh: "S3 兼容服务的访问地址", en: "S3-compatible service endpoint URL" },
  s3AccessKey: { zh: "Access Key", en: "Access Key" },
  s3AccessKeyDesc: { zh: "S3 访问密钥", en: "S3 access key" },
  s3SecretKey: { zh: "Secret Key", en: "Secret Key" },
  s3SecretKeyDesc: { zh: "S3 密钥", en: "S3 secret key" },
  s3Bucket: { zh: "Bucket", en: "Bucket" },
  s3BucketDesc: { zh: "S3 存储桶名称", en: "S3 bucket name" },
  s3Region: { zh: "Region", en: "Region" },
  s3RegionDesc: { zh: "S3 区域（如 cn-beijing）", en: "S3 region (e.g., us-east-1)" },
  syncTitle: { zh: "同步设置", en: "Sync Settings" },
  vaultFolder: { zh: "本地存储路径", en: "Vault folder path" },
  vaultFolderDesc: { zh: "笔记在 Vault 中的存储文件夹", en: "The folder in your vault where synced notes will be stored" },
  autoSync: { zh: "自动同步", en: "Auto sync" },
  autoSyncDesc: { zh: "定时自动同步笔记", en: "Automatically sync notes at regular intervals" },
  syncInterval: { zh: "同步间隔（分钟）", en: "Sync interval (minutes)" },
  syncIntervalDesc: { zh: "自动同步的时间间隔（需开启自动同步）", en: "How often to auto sync (requires auto sync enabled)" },
  advancedTitle: { zh: "高级选项", en: "Advanced Options" },
  frontmatterTags: { zh: "Frontmatter 标签", en: "Frontmatter tags" },
  frontmatterTagsDesc: { zh: "从笔记内容中提取标签并写入 YAML frontmatter", en: "Extract tags from note content and add to YAML frontmatter" },
  organizeTitle: { zh: "笔记组织方式", en: "Note Organization" },
  organizeByTag: { zh: "按标签分文件夹", en: "Organize by tag folders" },
  organizeByTagDesc: { zh: "按主标签（第一个标签）将笔记归到子文件夹，无标签笔记留在根目录。支持嵌套标签（如 #日记/生活 → inBox/日记/生活/）", en: "File notes into tag subfolders by primary tag. Notes without tags stay in the root folder. Supports nested tags (e.g. #diary/life → inBox/diary/life/)" },
  tagFolderRoot: { zh: "标签目录根", en: "Tag folder root" },
  tagFolderRootDesc: { zh: "标签子文件夹的父目录名（留空则直接在存储路径下建标签目录）", en: "Parent folder for tag subfolders (leave empty to create tag folders directly under the storage path)" },
  inlineAnnotations: { zh: "批注内联到父笔记", en: "Inline annotations to parent" },
  inlineAnnotationsDesc: { zh: "把批注内容直接拼到父笔记末尾，不再为每条批注生成独立文件。父笔记成为完整的可对照阅读文档", en: "Append annotation content directly to the parent note instead of creating separate files per annotation. The parent note becomes a complete, readable document" },
  testConnection: { zh: "测试连接", en: "Test connection" },
  testConnectionDesc: { zh: "验证云存储配置是否正确", en: "Verify your cloud storage credentials" },
  testing: { zh: "测试中...", en: "Testing..." },
  connectionSuccess: { zh: "✓ 连接成功！配置正确。", en: "✓ Connection successful! Settings are correct." },
  connectionFailed: { zh: "✗ 连接失败：", en: "✗ Connection failed: " },
  noticeSuccess: { zh: "inBox Sync: 连接成功！", en: "inBox Sync: Connection successful!" },
  noticeFailed: { zh: "inBox Sync: 连接失败 - ", en: "inBox Sync: Connection failed - " },
};

/**
 * 设置面板用的 i18n 函数
 */
export function uiT(key: string): string {
  const lang = getLang();
  return uiTranslations[key]?.[lang] ?? uiTranslations[key]?.["en"] ?? key;
}
