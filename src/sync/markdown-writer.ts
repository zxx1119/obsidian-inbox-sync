import { App, TFile, TFolder } from "obsidian";
import { InboxSyncSettings } from "../types/settings";
import { ParsedNote } from "../types/inbox";

/** 批注嵌入块的标记，用于识别和替换 */
const ANNOTATION_BLOCK_START = "\n\n---\n\n## 批注\n";

/** 内联批注的单条标记，用于识别和替换 */
const ANNOTATION_INLINE_START = "\n\n---\n\n## 批注\n";

/** writeNote 的返回结果 */
export interface WriteNoteResult {
  isNew: boolean;
  fileName: string;       // 不含扩展名的文件名，供嵌入引用用
  filePath: string;       // 完整路径（含目录和扩展名）
}

/**
 * Markdown 写入器
 *
 * 组织方式（受 settings 控制）：
 * 1. organizeByTag=true：按主标签分文件夹
 *    - inBox/日记/生活/note.md
 *    - 无标签笔记留在根目录 inBox/note.md
 * 2. inlineAnnotations=true：批注内联到父笔记
 *    - 父笔记末尾追加 "## 批注" 区块，每条批注带时间戳和正文
 *    - 不再为批注生成独立 .md 文件
 */
export class MarkdownWriter {
  private app: App;
  private settings: InboxSyncSettings;

  constructor(app: App, settings: InboxSyncSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * 写入笔记到 Vault
   *
   * 路径变化处理：
   * - 如果 organizeByTag 开启，笔记标签变了会导致目标目录变化
   * - 调用方传入 oldFilePath（上次同步记录的路径）
   * - 若 oldFilePath 存在且与新路径不同，先删除旧文件（相当于 move）
   * - 同 noteId 的同名文件直接覆盖
   *
   * @param note 笔记数据
   * @param oldFilePath 上次同步时该笔记的文件路径（用于检测路径变化，可选）
   * @param parentFileName 父笔记文件名（批注笔记用，仅 inlineAnnotations=false 时生效）
   * @param annotations 批注列表（父笔记用，仅 inlineAnnotations=true 时生效）
   */
  async writeNote(
    note: ParsedNote,
    oldFilePath?: string,
    parentFileName?: string,
    annotations?: ParsedNote[]
  ): Promise<WriteNoteResult> {
    const vault = this.app.vault;
    const folderPath = this.getNoteFolderPath(note);

    // 确保文件夹存在（递归创建）
    await this.ensureFolder(folderPath);

    // 确定标题
    const displayTitle = this.getDisplayTitle(note);
    let fileName = this.sanitizeFileName(displayTitle);
    let filePath = `${folderPath}/${fileName}.md`;

    // 检查同名文件是否已存在但属于不同笔记
    const existing = vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      try {
        const content = await vault.read(existing);
        const match = content.match(/inbox_id:\s*(\S+)/);
        if (match && match[1] !== note.noteId) {
          // 同名但是不同笔记，追加短 ID 避免冲突
          const shortId = note.noteId.replace(/^note-/, "").slice(0, 8);
          fileName = this.sanitizeFileName(`${displayTitle}-${shortId}`);
          filePath = `${folderPath}/${fileName}.md`;
        }
      } catch {
        // 忽略读取错误
      }
    }

    // 路径变化处理：旧路径存在且与新路径不同，删除旧文件
    // 场景：用户改了标签，主标签变了，笔记要从 旧标签目录/ 移到 新标签目录/
    if (oldFilePath && oldFilePath !== filePath) {
      const oldFile = vault.getAbstractFileByPath(oldFilePath);
      if (oldFile instanceof TFile) {
        try {
          // 再次确认旧文件确实是同一条笔记（避免误删）
          const oldContent = await vault.read(oldFile);
          const idMatch = oldContent.match(/inbox_id:\s*(\S+)/);
          if (idMatch && idMatch[1] === note.noteId) {
            await vault.delete(oldFile);
            console.debug(`[MarkdownWriter] 路径变化，已删除旧文件: ${oldFilePath} → ${filePath}`);
          }
        } catch (error) {
          console.warn(`[MarkdownWriter] 删除旧路径文件失败: ${oldFilePath}`, error);
        }
      }
    }

    // 生成 Markdown 内容
    const markdown = this.generateMarkdown(note, displayTitle, parentFileName, annotations);

    // 检查文件是否存在
    const finalExisting = vault.getAbstractFileByPath(filePath);

    if (finalExisting instanceof TFile) {
      // 文件存在，更新内容
      await vault.modify(finalExisting, markdown);
      return { isNew: false, fileName, filePath };
    } else {
      // 文件不存在，创建新文件
      await vault.create(filePath, markdown);
      return { isNew: true, fileName, filePath };
    }
  }

  /**
   * 确定笔记的显示标题
   * 1. 有标题（非 "Untitled"）→ 用原标题
   * 2. 无标题或 "Untitled" → 用创建时间 "2026-04-11 14:30"
   */
  private getDisplayTitle(note: ParsedNote): string {
    const title = note.title?.trim();
    if (title && title !== "Untitled") {
      return title;
    }
    return this.formatTimeTitle(note.createdAt.getTime());
  }

  /**
   * 将时间戳格式化为标题 "2026-04-14 20.48.32"
   */
  private formatTimeTitle(timestamp: number): string {
    const d = new Date(timestamp);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  }

  /**
   * 生成 Markdown 内容
   * @param annotations 批注列表（父笔记用，内联模式）
   */
  private generateMarkdown(
    note: ParsedNote,
    displayTitle: string,
    parentFileName?: string,
    annotations?: ParsedNote[]
  ): string {
    const lines: string[] = [];

    // Frontmatter
    lines.push("---");
    lines.push(`title: ${this.escapeYaml(displayTitle)}`);
    lines.push(`inbox_id: ${note.noteId}`);
    lines.push(`created: ${note.createdAt.toISOString()}`);
    lines.push(`updated: ${note.updatedAt.toISOString()}`);

    // 父笔记 noteId（批注笔记，用于删除时反查父笔记以触发刷新）
    if (note.parentId) {
      lines.push(`parent_id: ${note.parentId}`);
    }

    // 标签
    if (note.tags.length > 0 && this.settings.enableFrontmatterTags) {
      lines.push("tags:");
      for (const tag of note.tags) {
        const obsidianTag = this.convertTagToObsidian(tag);
        lines.push(`  - ${obsidianTag}`);
      }
    }

    // 父笔记引用（批注笔记，仅非内联模式）
    if (parentFileName) {
      lines.push(`parent: "[[${parentFileName}]]"`);
    }

    lines.push("---");
    lines.push("");

    // 正文内容
    lines.push(this.processContent(note));

    // 内联批注区块（父笔记）
    if (this.settings.inlineAnnotations && annotations && annotations.length > 0) {
      lines.push(this.buildAnnotationBlock(annotations));
    }

    return lines.join("\n");
  }

  /**
   * 构建内联批注区块
   * 每条批注：带时间戳标题 + 正文内容
   */
  private buildAnnotationBlock(annotations: ParsedNote[]): string {
    // 按创建时间升序排列
    const sorted = [...annotations].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    const lines: string[] = [ANNOTATION_INLINE_START];

    for (const ann of sorted) {
      const timeStr = this.formatAnnotationTime(ann.createdAt.getTime());
      const annTitle = ann.title && ann.title !== "Untitled" ? ann.title : "批注";

      lines.push(`### ${annTitle}`);
      lines.push(`> _${timeStr}_`);
      lines.push("");

      // 批注正文
      const content = ann.content.trim();
      if (content) {
        lines.push(content);
      }

      // 批注里的图片等资源引用（已在 content 中，这里不额外处理）
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * 格式化批注时间 "2026-04-14 20:48"
   */
  private formatAnnotationTime(timestamp: number): string {
    const d = new Date(timestamp);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /**
   * 处理内容（暂不修改，保持原始内容）
   */
  private processContent(note: ParsedNote): string {
    return note.content;
  }

  /**
   * 转换标签为 Obsidian 格式
   */
  private convertTagToObsidian(tag: string): string {
    return tag;
  }

  /**
   * 转义 YAML 特殊字符
   */
  private escapeYaml(text: string): string {
    if (!text) return "";

    if (/[:{}\[\],&*#?|<>=!%@`]/.test(text)) {
      return `"${text.replace(/"/g, '\\"')}"`;
    }

    return text;
  }

  /**
   * 获取根路径（扁平结构时的基础路径）
   */
  private getBasePath(): string {
    return this.settings.vaultFolderPath.replace(/^\/+|\/+$/g, "");
  }

  /**
   * 根据笔记的标签确定它应该存放的文件夹路径
   * - organizeByTag=false：返回根目录
   * - organizeByTag=true：返回 inBox/标签名/（用主标签，即第一个标签）
   *   - 支持嵌套标签 tag/subtag → inBox/tag/subtag/
   *   - 无标签 → 根目录
   *   - tagFolderRoot 非空时，标签目录建在 tagFolderRoot 下
   */
  getNoteFolderPath(note: ParsedNote): string {
    const basePath = this.getBasePath();

    if (!this.settings.organizeByTag) {
      return basePath;
    }

    if (!note.tags || note.tags.length === 0) {
      return basePath;
    }

    // 主标签 = 第一个标签
    // 统一转小写做目录映射，避免 #Diary 和 #diary 建两个目录
    // （文件系统大小写敏感，但 Obsidian 标签系统大小写不敏感）
    const primaryTag = note.tags[0].toLowerCase();

    // 标签可能含 / 分隔的层级，转成路径
    // 清理非法路径字符
    const tagPath = primaryTag
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => s.replace(/[<>:"/\\|?*]/g, "-"))
      .join("/");

    if (!tagPath) {
      return basePath;
    }

    // tagFolderRoot 非空时，标签目录建在其下
    if (this.settings.tagFolderRoot) {
      const root = this.settings.tagFolderRoot.replace(/^\/+|\/+$/g, "");
      return `${basePath}/${root}/${tagPath}`;
    }

    return `${basePath}/${tagPath}`;
  }

  /**
   * 递归创建文件夹
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    const vault = this.app.vault;
    const parts = folderPath.split("/").filter((p) => p.length > 0);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      try {
        const entry = vault.getAbstractFileByPath(current);
        if (!entry) {
          await vault.createFolder(current);
        }
      } catch {
        // 文件夹可能已存在，忽略
      }
    }
  }

  /**
   * 清理文件名
   */
  private sanitizeFileName(name: string): string {
    if (!name) return "untitled";

    return name
      .replace(/[<>:"/\\|?*]/g, "-")
      .substring(0, 100);
  }

  /**
   * 删除笔记（通过 noteId 查找并删除）
   * 扫描根目录及所有子目录下的 .md 文件
   */
  async deleteNote(noteId: string): Promise<boolean> {
    const vault = this.app.vault;
    const basePath = this.getBasePath();

    try {
      const deleted = await this.deleteNoteInFolder(basePath, noteId);
      if (deleted) return true;
    } catch {
      // 文件夹可能不存在
    }

    return false;
  }

  /**
   * 递归扫描文件夹查找并删除指定 noteId 的笔记
   * 删除后清理空的父目录（递归向上，直到根目录或非空目录）
   */
  private async deleteNoteInFolder(folderPath: string, noteId: string): Promise<boolean> {
    const vault = this.app.vault;
    const basePath = this.getBasePath();

    try {
      const entry = vault.getAbstractFileByPath(folderPath);
      if (!(entry instanceof TFolder)) return false;

      for (const child of entry.children) {
        if (child instanceof TFile) {
          if (!child.path.endsWith(".md")) continue;
          try {
            const content = await vault.read(child);
            const match = content.match(/inbox_id:\s*(\S+)/);
            if (match && match[1] === noteId) {
              const deletedFilePath = child.path;
              await vault.delete(child);
              console.debug(`[MarkdownWriter] 已删除笔记: ${deletedFilePath}`);

              // 清理空的父目录（递归向上，直到根目录或非空目录）
              await this.cleanupEmptyParentDirs(deletedFilePath, basePath);

              return true;
            }
          } catch {
            // 忽略读取错误
          }
        } else if (child instanceof TFolder) {
          // 递归子目录
          const found = await this.deleteNoteInFolder(child.path, noteId);
          if (found) return true;
        }
      }
    } catch {
      // 忽略
    }

    return false;
  }

  /**
   * 清理空的父目录（递归向上，直到根目录或非空目录）
   * @param deletedFilePath 被删除文件的路径
   * @param basePath 根目录，清理到此为止
   */
  private async cleanupEmptyParentDirs(deletedFilePath: string, basePath: string): Promise<void> {
    const vault = this.app.vault;
    const normalizedBase = basePath.replace(/^\/+|\/+$/g, "");

    // 从被删除文件的父目录开始向上检查
    let current = deletedFilePath.substring(0, deletedFilePath.lastIndexOf("/"));

    while (current && current !== normalizedBase && current.length > normalizedBase.length) {
      try {
        const entry = vault.getAbstractFileByPath(current);
        if (!(entry instanceof TFolder)) break;

        // 目录非空就停止
        if (entry.children.length > 0) break;

        // 空目录，删除
        await vault.delete(entry);
        console.debug(`[MarkdownWriter] 已清理空目录: ${current}`);

        // 继续向上检查
        const parent = current.substring(0, current.lastIndexOf("/"));
        if (parent === current) break; // 已经到根
        current = parent;
      } catch {
        break;
      }
    }
  }

  /**
   * 更新父笔记，追加子笔记的嵌入引用
   * 仅在 inlineAnnotations=false 时使用（保留旧的行为）
   * @param parentNoteId 父笔记的 noteId
   * @param childFileNames 子笔记的文件名列表（不含扩展名）
   */
  async updateParentEmbeds(parentNoteId: string, childFileNames: string[]): Promise<void> {
    if (childFileNames.length === 0) return;

    const vault = this.app.vault;
    const parentFilePath = await this.findNotePath(parentNoteId);
    if (!parentFilePath) {
      console.warn(`[MarkdownWriter] 父笔记未找到: ${parentNoteId}`);
      return;
    }

    try {
      const file = vault.getAbstractFileByPath(parentFilePath);
      if (!(file instanceof TFile)) return;

      let content = await vault.read(file);

      // 移除旧的批注块
      const blockIndex = content.indexOf(ANNOTATION_BLOCK_START);
      if (blockIndex !== -1) {
        content = content.substring(0, blockIndex);
      }

      // 生成新的批注块
      const embedLines: string[] = [ANNOTATION_BLOCK_START];
      for (const childName of childFileNames) {
        embedLines.push(`> ![[${childName}]]`);
        embedLines.push(">");
        if (childName !== childFileNames[childFileNames.length - 1]) {
          embedLines.push(">");
        }
      }

      content += embedLines.join("\n");

      await vault.modify(file, content);
      console.debug(`[MarkdownWriter] 已更新父笔记嵌入: ${parentFilePath}, ${childFileNames.length} 个子笔记`);
    } catch (error) {
      console.error(`[MarkdownWriter] 更新父笔记嵌入失败: ${parentFilePath}`, error);
    }
  }

  /**
   * 给子笔记的 frontmatter 补上 parent 引用
   * 仅在 inlineAnnotations=false 时使用
   */
  async addChildParentRef(childFileName: string, parentFileName: string): Promise<void> {
    const vault = this.app.vault;
    const basePath = this.getBasePath();
    const filePath = `${basePath}/${childFileName}.md`;

    try {
      const file = vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;

      let content = await vault.read(file);

      // 在 frontmatter 结束标记 --- 之前插入 parent 字段
      const frontmatterEnd = content.indexOf("\n---", 4); // 跳过第一个 ---
      if (frontmatterEnd !== -1) {
        const parentLine = `parent: "[[${parentFileName}]]"`;
        // 检查是否已有 parent 字段
        if (!content.includes("parent:")) {
          content = content.substring(0, frontmatterEnd) + "\n" + parentLine + content.substring(frontmatterEnd);
          await vault.modify(file, content);
        }
      }
    } catch (error) {
      console.error(`[MarkdownWriter] 添加 parent 引用失败: ${filePath}`, error);
    }
  }

  /**
   * 通过 noteId 查找笔记的文件路径（递归扫描所有子目录）
   */
  async findNotePath(noteId: string): Promise<string | null> {
    const vault = this.app.vault;
    const basePath = this.getBasePath();

    const result = await this.findNotePathInFolder(basePath, noteId);
    return result;
  }

  /**
   * 递归在文件夹中查找指定 noteId 的笔记路径
   */
  private async findNotePathInFolder(folderPath: string, noteId: string): Promise<string | null> {
    const vault = this.app.vault;

    try {
      const entry = vault.getAbstractFileByPath(folderPath);
      if (!(entry instanceof TFolder)) return null;

      for (const child of entry.children) {
        if (child instanceof TFile) {
          if (!child.path.endsWith(".md")) continue;
          try {
            const content = await vault.read(child);
            const match = content.match(/inbox_id:\s*(\S+)/);
            if (match && match[1] === noteId) {
              return child.path;
            }
          } catch {
            // 忽略
          }
        } else if (child instanceof TFolder) {
          const found = await this.findNotePathInFolder(child.path, noteId);
          if (found) return found;
        }
      }
    } catch {
      // 忽略
    }

    return null;
  }

  /**
   * 通过 noteId 查找笔记的文件名（不含扩展名）
   */
  async findNoteFileName(noteId: string): Promise<string | null> {
    const filePath = await this.findNotePath(noteId);
    if (!filePath) return null;
    const fileName = filePath.split("/").pop() || "";
    return fileName.replace(/\.md$/, "");
  }

  /**
   * 通过 noteId 查找笔记的 parent noteId（从 frontmatter 的 parent_id 字段读取）
   * 用于删除批注前确认其父笔记，以便后续刷新父笔记的内联批注区
   * @returns noteId 和 parentId（如果有的话），找不到返回 null
   */
  async findNoteParentId(noteId: string): Promise<{ noteId: string; parentId: string } | null> {
    const vault = this.app.vault;
    const filePath = await this.findNotePath(noteId);
    if (!filePath) return null;

    try {
      const file = vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return null;
      const content = await vault.read(file);
      const parentIdMatch = content.match(/parent_id:\s*(\S+)/);
      if (parentIdMatch) {
        return { noteId, parentId: parentIdMatch[1] };
      }
    } catch {
      // 忽略
    }

    return null;
  }

  /**
   * 转换笔记内容中的 [[...]] 链接为 Obsidian 文件名
   * - [[note-xxx]] → [[文件名]]
   * - [[Card123]]  → [[文件名]]
   * - [[标题]]     → 保持不变
   *
   * @param filePath 笔记的完整路径
   */
  async convertLinks(
    filePath: string,
    noteIdFileMap: Map<string, string>,
    blockIdFileMap: Map<number, string>
  ): Promise<void> {
    const vault = this.app.vault;

    try {
      const file = vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;

      let content = await vault.read(file);
      let modified = false;

      // 匹配所有 [[...]] 链接（不匹配 ![[...]] 嵌入引用）
      content = content.replace(/(?<!!)\[\[([^\]]+)\]\]/g, (match, linkTarget: string) => {
        let replacement: string | null = null;

        if (linkTarget.startsWith("note-")) {
          // [[note-xxx]] → noteId 格式
          replacement = noteIdFileMap.get(linkTarget) ?? null;
        } else if (/^Card\d+$/.test(linkTarget)) {
          // [[Card123]] → blockId 老格式
          const blockId = parseInt(linkTarget.replace("Card", ""), 10);
          if (!isNaN(blockId)) {
            replacement = blockIdFileMap.get(blockId) ?? null;
          }
        }

        if (replacement) {
          modified = true;
          return `[[${replacement}]]`;
        }
        return match;
      });

      if (modified) {
        await vault.modify(file, content);
        console.debug(`[MarkdownWriter] 已转换链接: ${filePath}`);
      }
    } catch (error) {
      console.error(`[MarkdownWriter] 转换链接失败: ${filePath}`, error);
    }
  }
}
