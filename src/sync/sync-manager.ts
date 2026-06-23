import { App } from "obsidian";
import { InboxSyncSettings, getCloudRootPath } from "../types/settings";
import { CloudClient, CloudFileInfo } from "./cloud-client";
import { WebDAVNativeClient } from "./webdav-native";
import { S3Client } from "./s3-client";
import { NoteParser } from "./note-parser";
import { MarkdownWriter } from "./markdown-writer";
import { AssetHandler } from "./asset-handler";
import {
  SyncMetadata,
  SyncStats,
  AtomicNote,
  ParsedNote,
} from "../types/inbox";
import { MetadataStorage } from "../storage/metadata-storage";

/**
 * 同步管理器 - 协调整个同步流程
 * 增量同步策略（参考 Android ThinkPlus）：
 * 1. listNotes() 拿到所有云端文件元数据（ETag, MTime）← 快，无内容下载
 * 2. 对比本地 lastSyncMeta → ETag 相同则跳过
 * 3. 只下载变化的文件
 * 4. 检测云端删除（本地有但云端不存在）
 */
export class SyncManager {
  private app: App;
  private settings: InboxSyncSettings;
  private cloudClient: CloudClient;
  private noteParser: NoteParser;
  private markdownWriter: MarkdownWriter;
  private assetHandler: AssetHandler;
  private metadataStorage: MetadataStorage;
  private abortController: AbortController | null = null;

  constructor(app: App, settings: InboxSyncSettings) {
    this.app = app;
    this.settings = settings;
    this.initializeClients();
    this.noteParser = new NoteParser();
    this.markdownWriter = new MarkdownWriter(app, settings);
    this.assetHandler = new AssetHandler(app, settings, this.cloudClient);
    this.metadataStorage = new MetadataStorage(app, settings);
  }

  private initializeClients() {
    const rootPath = getCloudRootPath(this.settings);

    console.debug(`[SyncManager] initializeClients: storageType=${this.settings.storageType}, rootPath=${rootPath}`);
    console.debug(`[SyncManager] S3 config: endpoint=${this.settings.s3Endpoint}, bucket=${this.settings.s3Bucket}, region=${this.settings.s3Region}`);

    if (this.settings.storageType === "webdav") {
      this.cloudClient = new WebDAVNativeClient(
        this.app,
        this.settings.webdavUrl,
        this.settings.webdavUsername,
        this.settings.webdavPassword,
        rootPath
      );
    } else {
      this.cloudClient = new S3Client(
        this.settings.s3Endpoint,
        this.settings.s3AccessKey,
        this.settings.s3SecretKey,
        this.settings.s3Bucket,
        this.settings.s3Region,
        rootPath
      );
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    return this.cloudClient.testConnection();
  }

  updateSettings(settings: InboxSyncSettings) {
    this.settings = settings;
    this.initializeClients();
    this.markdownWriter = new MarkdownWriter(this.app, settings);
    this.assetHandler = new AssetHandler(this.app, settings, this.cloudClient);
    this.metadataStorage = new MetadataStorage(this.app, settings);
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * 执行增量同步
   */
  async sync(notify?: (message: string) => void): Promise<SyncStats> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const stats: SyncStats = {
      totalNotes: 0,
      newNotes: 0,
      updatedNotes: 0,
      skippedNotes: 0,
      deletedNotes: 0,
      failedNotes: 0,
      totalAssets: 0,
      downloadedAssets: 0,
      skippedAssets: 0,
      failedAssets: 0,
      startTime: Date.now(),
      endTime: 0,
      errors: [],
    };

    try {
      notify?.("开始同步...");
      console.debug("[SyncManager] ===== 开始增量同步 =====");

      // 1. 读取本地同步元数据
      const syncMetadata = await this.metadataStorage.load();
      console.debug(`[SyncManager] 本地元数据加载完成, 已有 ${Object.keys(syncMetadata.lastSyncMeta).length} 条记录`);

      // 1.5 检测关键配置变化：organizeByTag / inlineAnnotations / vaultFolderPath / tagFolderRoot
      // 任一变化都触发全量重同步（清空 lastSyncMeta），否则旧笔记会留在旧目录结构里
      const settingsChanged = this.checkSettingsChanged(syncMetadata);
      if (settingsChanged) {
        console.debug("[SyncManager] 关键配置已变化，触发全量重同步");
        notify?.("检测到笔记组织配置变化，执行全量重同步...");
        syncMetadata.lastSyncMeta = {};
        syncMetadata.notePaths = {};
      }

      // 2. 列出云端所有文件元数据（快速，只拿 ETag/MTime，不下载内容）
      notify?.("扫描云端文件列表...");
      const cloudFiles = await this.cloudClient.listNotes();
      console.debug(`[SyncManager] 云端文件列表获取完成, 共 ${cloudFiles.length} 个文件`);

      // 3. 增量对比：找出变化的文件
      const { toDownload, toDelete, unchanged } = this.diffCloudAndLocal(cloudFiles, syncMetadata);
      console.debug(`[SyncManager] 增量对比: 需下载 ${toDownload.length}, 需删除 ${toDelete.length}, 未变化 ${unchanged}`);

      // 4. 处理云端删除的笔记
      // 删除前先读文件 frontmatter 拿 parentId（如果是批注），
      // 父笔记需要后续强制刷新，否则内联批注区会残留已删除的批注内容
      const parentIdsToRefresh = new Set<string>();
      if (toDelete.length > 0) {
        notify?.(`处理云端删除 (${toDelete.length} 条)...`);
        for (const noteId of toDelete) {
          if (signal.aborted) throw new Error("同步已取消");
          try {
            // 删除前先查这条笔记的 parent（如果是批注，需要刷新父笔记）
            const parentInfo = await this.markdownWriter.findNoteParentId(noteId);
            if (parentInfo?.parentId) {
              parentIdsToRefresh.add(parentInfo.parentId);
            }
            await this.markdownWriter.deleteNote(noteId);
            delete syncMetadata.lastSyncMeta[noteId];
            delete syncMetadata.notePaths[noteId];
            stats.deletedNotes++;
          } catch (error) {
            console.warn(`[SyncManager] 删除笔记失败: ${noteId}`, error);
          }
        }
      }

      // 5. 下载变化的文件
      stats.totalNotes = toDownload.length + unchanged;
      const allNotes = new Map<string, AtomicNote>();

      if (toDownload.length > 0) {
        notify?.(`下载变化的笔记 (${toDownload.length} 条)...`);
        await this.downloadChangedNotes(toDownload, allNotes, signal, notify);
      }

      console.debug(`[SyncManager] 云端笔记收集完成, 变化 ${allNotes.size} 条, 跳过 ${unchanged} 条`);

      // 6. 第一轮：解析所有笔记，建立索引
      let processedCount = 0;
      // 父子关系：parentId -> ParsedNote[]（批注笔记列表）
      const parentAnnotationsMap = new Map<string, ParsedNote[]>();
      // 所有有效（未删除）的笔记：noteId -> ParsedNote
      const parsedNoteMap = new Map<string, ParsedNote>();
      // blockId → noteId 映射（给 Card 格式链接转换用）
      const blockIdNoteIdMap = new Map<number, string>();

      for (const [noteId, atomicNote] of allNotes) {
        if (signal.aborted) throw new Error("同步已取消");

        try {
          notify?.(`解析笔记 ${++processedCount}/${allNotes.size}...`);

          const parsedNote = this.noteParser.parse(atomicNote);

          // 检查是否已标记删除
          if (parsedNote.isRemoved) {
            await this.markdownWriter.deleteNote(parsedNote.noteId);
            stats.deletedNotes++;
            delete syncMetadata.lastSyncMeta[noteId];
            delete syncMetadata.notePaths[noteId];
            continue;
          }

          parsedNoteMap.set(parsedNote.noteId, parsedNote);

          if (parsedNote.blockId) {
            blockIdNoteIdMap.set(parsedNote.blockId, parsedNote.noteId);
          }

          // 记录父子关系
          if (parsedNote.parentId) {
            if (!parentAnnotationsMap.has(parsedNote.parentId)) {
              parentAnnotationsMap.set(parsedNote.parentId, []);
            }
            parentAnnotationsMap.get(parsedNote.parentId)!.push(parsedNote);
          }
        } catch (error: unknown) {
          stats.failedNotes++;
          const errorMsg = `解析笔记 ${noteId} 失败: ${error instanceof Error ? error.message : String(error)}`;
          stats.errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      console.debug(`[SyncManager] 解析完成: ${parsedNoteMap.size} 条有效笔记, ${parentAnnotationsMap.size} 个父笔记有批注`);

      // 6.1 补救：父笔记被增量跳过时，强制下载（否则批注无法内联到父笔记）
      // 两种场景：
      //   a) 批注新增/修改 → 下载了，但父笔记 ETag 没变 → 没下载（#1）
      //   b) 批注被删除 → 父笔记需要重写以移除批注区里的旧内容（#2）
      const missingParentIds = new Set<string>();
      // 场景 a：批注存在但父笔记没下载
      for (const parentId of parentAnnotationsMap.keys()) {
        if (!parsedNoteMap.has(parentId)) {
          missingParentIds.add(parentId);
        }
      }
      // 场景 b：批注被删除，父笔记需要刷新
      for (const parentId of parentIdsToRefresh) {
        if (!parsedNoteMap.has(parentId)) {
          missingParentIds.add(parentId);
        }
      }
      if (missingParentIds.size > 0) {
        console.debug(`[SyncManager] 检测到 ${missingParentIds.size} 个父笔记需要强制刷新（批注变化或删除）`);
        // 构建 noteId → cloudFile 的映射，快速查找路径
        const cloudFileMap = new Map<string, CloudFileInfo>();
        for (const cf of cloudFiles) {
          cloudFileMap.set(cf.id, cf);
        }
        for (const parentId of missingParentIds) {
          if (signal.aborted) throw new Error("同步已取消");
          const cloudFile = cloudFileMap.get(parentId);
          if (!cloudFile) {
            // 父笔记在云端也不存在了（可能也被删除了），跳过
            console.debug(`[SyncManager] 父笔记 ${parentId} 在云端不存在，跳过`);
            continue;
          }
          try {
            const atomicNote = await this.cloudClient.downloadAtomicNote(cloudFile.path);
            if (atomicNote) {
              const parsedNote = this.noteParser.parse(atomicNote);
              if (!parsedNote.isRemoved) {
                parsedNoteMap.set(parsedNote.noteId, parsedNote);
                if (parsedNote.blockId) {
                  blockIdNoteIdMap.set(parsedNote.blockId, parsedNote.noteId);
                }
                console.debug(`[SyncManager] 已补下载父笔记: ${parentId}`);
              }
            }
          } catch (error) {
            console.warn(`[SyncManager] 补下载父笔记失败: ${parentId}`, error);
          }
        }
      }

      // 6.5 第二轮：写入笔记
      // 内联模式：批注不单独写文件，直接拼进父笔记
      // 非内联模式：批注单独写文件 + 父笔记嵌入引用（旧逻辑）
      const inlineMode = this.settings.inlineAnnotations;
      // noteId -> { fileName, filePath } 映射（用于链接转换）
      const noteIdFileMap = new Map<string, { fileName: string; filePath: string }>();

      let writeIndex = 0;
      for (const [noteId, parsedNote] of parsedNoteMap) {
        if (signal.aborted) throw new Error("同步已取消");

        try {
          notify?.(`写入笔记 ${++writeIndex}/${parsedNoteMap.size}...`);

          // 内联模式：跳过批注笔记（它们会被拼进父笔记）
          // 资源不在跳过时处理，而是在父笔记写入后统一处理，避免重复统计
          if (inlineMode && parsedNote.parentId) {
            continue;
          }

          // 获取本笔记的批注列表（内联模式）
          let annotations: ParsedNote[] | undefined;
          if (inlineMode) {
            annotations = parentAnnotationsMap.get(noteId);
          }

          // 查上次同步记录的路径，用于检测路径变化（标签改了→目录变了→move）
          const oldFilePath = syncMetadata.notePaths[noteId];

          const result = await this.markdownWriter.writeNote(parsedNote, oldFilePath, undefined, annotations);

          noteIdFileMap.set(noteId, { fileName: result.fileName, filePath: result.filePath });

          // 处理资源（v0.3.0：传入笔记 filePath，资源下载到笔记同目录的 assets 子文件夹）
          const assetStats = await this.assetHandler.handleAssets(parsedNote, result.filePath);
          if (result.isNew) {
            stats.newNotes++;
          } else {
            stats.updatedNotes++;
          }
          stats.totalAssets += assetStats.total;
          stats.downloadedAssets += assetStats.downloaded;
          stats.skippedAssets += assetStats.skipped;
          stats.failedAssets += assetStats.failed;

          // 内联模式下，也要处理批注的资源
          // 批注资源跟父笔记走（放父笔记的 assets 文件夹）
          if (inlineMode && annotations) {
            for (const ann of annotations) {
              const annAssetStats = await this.assetHandler.handleAssets(ann, result.filePath);
              stats.totalAssets += annAssetStats.total;
              stats.downloadedAssets += annAssetStats.downloaded;
              stats.skippedAssets += annAssetStats.skipped;
              stats.failedAssets += annAssetStats.failed;
            }
          }
        } catch (error: unknown) {
          stats.failedNotes++;
          const errorMsg = `写入笔记 ${noteId} 失败: ${error instanceof Error ? error.message : String(error)}`;
          stats.errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      // 6.6 非内联模式：补全子笔记的 parent frontmatter + 父笔记嵌入引用（旧逻辑）
      if (!inlineMode && parentAnnotationsMap.size > 0) {
        console.debug(`[SyncManager] 更新父子关系(嵌入模式): ${parentAnnotationsMap.size} 个父笔记`);
        for (const [parentId, childNotes] of parentAnnotationsMap) {
          try {
            const childFileNames = childNotes
              .map((n) => noteIdFileMap.get(n.noteId)?.fileName)
              .filter((n): n is string => !!n);

            // 更新父笔记：追加子笔记嵌入
            await this.markdownWriter.updateParentEmbeds(parentId, childFileNames);

            // 更新子笔记：补上 parent frontmatter
            // 注意：用完整 filePath 而非 fileName，因为 organizeByTag 开启后子笔记在子目录里
            const parentInfo = noteIdFileMap.get(parentId);
            if (parentInfo) {
              for (const childNote of childNotes) {
                const childInfo = noteIdFileMap.get(childNote.noteId);
                if (childInfo) {
                  await this.markdownWriter.addChildParentRef(childInfo.filePath, parentInfo.fileName);
                }
              }
            }
          } catch (error) {
            console.warn(`[SyncManager] 更新父子关系失败: ${parentId}`, error);
          }
        }
      }

      // 6.7 第三轮：转换笔记内容中的 [[note-xxx]] / [[Card123]] 链接
      const linkConvertNoteIdMap = new Map<string, string>();
      for (const [id, info] of noteIdFileMap) {
        linkConvertNoteIdMap.set(id, info.fileName);
      }
      const blockIdFileMap = new Map<number, string>();
      for (const [blockId, noteId] of blockIdNoteIdMap) {
        const info = noteIdFileMap.get(noteId);
        if (info) {
          blockIdFileMap.set(blockId, info.fileName);
        }
      }
      let linkConvertCount = 0;
      for (const [noteId, info] of noteIdFileMap) {
        try {
          await this.markdownWriter.convertLinks(info.filePath, linkConvertNoteIdMap, blockIdFileMap);
          linkConvertCount++;
        } catch (error) {
          console.warn(`[SyncManager] 链接转换失败: ${noteId}`, error);
        }
      }
      if (linkConvertCount > 0) {
        console.debug(`[SyncManager] 链接转换完成: ${linkConvertCount} 个笔记`);
      }


      // 7. 更新元数据：写入所有云端文件的 ETag/MTime（包括跳过的）
      // 参考 Android DownloadService.updateRemoteMetadata() — 即使跳过也要更新元数据
      for (const file of cloudFiles) {
        syncMetadata.lastSyncMeta[file.id] = {
          etag: file.etag || "",
          mtime: file.mtime || 0,
        };
      }

      // 更新 notePaths：记录每条笔记当前在 vault 中的路径，下次同步时用于检测路径变化
      // 只记录本次实际写入的笔记（跳过的笔记保留旧路径记录不动）
      for (const [noteId, info] of noteIdFileMap) {
        syncMetadata.notePaths[noteId] = info.filePath;
      }

      // 保存当前关键配置，下次同步时检测变化
      syncMetadata.lastSettings = {
        organizeByTag: this.settings.organizeByTag,
        inlineAnnotations: this.settings.inlineAnnotations,
        vaultFolderPath: this.settings.vaultFolderPath,
        tagFolderRoot: this.settings.tagFolderRoot,
      };

      syncMetadata.lastSyncTime = Date.now();
      await this.metadataStorage.save(syncMetadata);

      const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
      const efficiency = cloudFiles.length > 0
        ? ((unchanged / cloudFiles.length) * 100).toFixed(1)
        : "0";
      notify?.(`同步完成！新增 ${stats.newNotes}, 更新 ${stats.updatedNotes}, 删除 ${stats.deletedNotes}, 跳过 ${unchanged} (${elapsed}s)`);
      console.debug(`[SyncManager] ===== 同步完成 (${elapsed}s) =====`);
      console.debug(`[SyncManager] 增量效率: 跳过 ${unchanged}/${cloudFiles.length} (${efficiency}%)`);
      console.debug(`[SyncManager] 新增: ${stats.newNotes}, 更新: ${stats.updatedNotes}, 删除: ${stats.deletedNotes}, 失败: ${stats.failedNotes}`);
    } catch (error: unknown) {
      if (signal.aborted) {
        notify?.("同步已取消");
        console.debug("[SyncManager] 同步已取消");
      } else {
        stats.errors.push(`同步错误: ${error instanceof Error ? error.message : String(error)}`);
        console.error("[SyncManager] 同步错误:", error);
      }
    }

    stats.endTime = Date.now();
    this.abortController = null;
    return stats;
  }

  /**
   * 检测关键配置是否变化（organizeByTag / inlineAnnotations / vaultFolderPath / tagFolderRoot）
   * 变化时需要全量重同步，否则旧笔记会留在旧目录结构里
   */
  private checkSettingsChanged(metadata: SyncMetadata): boolean {
    const last = metadata.lastSettings;
    if (!last) return false; // 首次同步或旧版本元数据，不算变化

    if (last.organizeByTag !== this.settings.organizeByTag) return true;
    if (last.inlineAnnotations !== this.settings.inlineAnnotations) return true;
    if (last.vaultFolderPath !== this.settings.vaultFolderPath) return true;
    if (last.tagFolderRoot !== this.settings.tagFolderRoot) return true;

    return false;
  }

  /**
   * 增量对比：对比云端文件列表与本地元数据
   * 返回：需要下载的文件、需要删除的 noteId、未变化数量
   */
  private diffCloudAndLocal(
    cloudFiles: CloudFileInfo[],
    metadata: SyncMetadata
  ): { toDownload: CloudFileInfo[]; toDelete: string[]; unchanged: number } {
    const toDownload: CloudFileInfo[] = [];
    const cloudNoteIds = new Set<string>();

    for (const file of cloudFiles) {
      cloudNoteIds.add(file.id);
      const localMeta = metadata.lastSyncMeta[file.id];

      if (!localMeta) {
        // 本地无记录 → 新笔记，需要下载
        toDownload.push(file);
      } else if (localMeta.etag && file.etag && localMeta.etag === file.etag) {
        // ETag 相同 → 未变化，跳过
      } else if (localMeta.mtime && file.mtime && file.mtime <= localMeta.mtime) {
        // MTime 未更新 → 跳过
      } else {
        // ETag 不同或 MTime 更新 → 需要下载
        toDownload.push(file);
      }
    }

    // 检测云端删除：本地有记录但云端列表中不存在
    const toDelete: string[] = [];
    for (const noteId of Object.keys(metadata.lastSyncMeta)) {
      if (!cloudNoteIds.has(noteId)) {
        toDelete.push(noteId);
      }
    }

    const unchangedCount = cloudFiles.length - toDownload.length;
    return { toDownload, toDelete, unchanged: unchangedCount };
  }

  /**
   * 下载变化的笔记文件
   */
  private async downloadChangedNotes(
    files: CloudFileInfo[],
    allNotes: Map<string, AtomicNote>,
    signal: AbortSignal,
    notify?: (message: string) => void
  ): Promise<void> {
    let downloaded = 0;
    let failed = 0;
    const total = files.length;
    const logInterval = Math.max(10, Math.floor(total / 10));

    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) throw new Error("同步已取消");

      const file = files[i];
      try {
        const atomicNote = await this.cloudClient.downloadAtomicNote(file.path);
        if (atomicNote) {
          allNotes.set(atomicNote.id, atomicNote);
          downloaded++;
        }
      } catch (error) {
        failed++;
        if (failed <= 5) {
          console.warn(`[SyncManager] 下载笔记失败: ${file.path}`, error);
        }
      }

      const processed = downloaded + failed;
      if (processed % logInterval === 0 || processed === total) {
        const msg = `下载笔记 ${processed}/${total} (成功: ${downloaded}, 失败: ${failed})`;
        console.debug(`[SyncManager] ${msg}`);
        notify?.(msg);
      }
    }

    console.debug(`[SyncManager] 笔记下载完成: 成功 ${downloaded}, 失败 ${failed}, 总计 ${total}`);
  }

  /**
   * 带重试的异步操作
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    delay: number = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        const waitTime = delay * Math.pow(2, i);
        console.warn(`[SyncManager] 操作失败，${waitTime}ms 后重试 (${i + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
    throw new Error("重试次数耗尽");
  }
}
