import { App } from "obsidian";
import { InboxSyncSettings } from "../types/settings";
import { CloudClient } from "./cloud-client";
import { ParsedNote, ParsedAsset } from "../types/inbox";

/**
 * 资源处理统计
 */
export interface AssetStats {
  total: number;
  downloaded: number;
  skipped: number;
  failed: number;
}

/**
 * 资源处理器
 */
export class AssetHandler {
  private app: App;
  private settings: InboxSyncSettings;
  private cloudClient: CloudClient;
  private processedAssets: Set<string> = new Set();

  constructor(app: App, settings: InboxSyncSettings, cloudClient: CloudClient) {
    this.app = app;
    this.settings = settings;
    this.cloudClient = cloudClient;
  }

  /**
   * 处理笔记的所有资源
   *
   * 改动（v0.3.0）：接收 noteFilePath 参数，资源下载到笔记同目录下的
   * `笔记名-assets/` 子文件夹，而不是全局的 `inBox/assets/images/`。
   * 这样图片跟着笔记走，Obsidian 里图文在一起。
   *
   * @param note 笔记数据
   * @param noteFilePath 笔记在 vault 中的完整路径（如 `inBox/日记/生活/今天.md`）
   */
  async handleAssets(note: ParsedNote, noteFilePath: string): Promise<AssetStats> {
    const stats: AssetStats = {
      total: 0,
      downloaded: 0,
      skipped: 0,
      failed: 0,
    };

    const allAssets: ParsedAsset[] = [
      ...note.images,
      ...note.videos,
      ...note.audios,
      ...note.attachments,
    ];

    stats.total = allAssets.length;

    for (const asset of allAssets) {
      try {
        const downloaded = await this.downloadAsset(asset, noteFilePath);
        if (downloaded) {
          stats.downloaded++;
        } else {
          stats.skipped++;
        }
      } catch (error) {
        stats.failed++;
        console.error(`Failed to download asset: ${asset.remoteUrl}`, error);
      }
    }

    return stats;
  }

  /**
   * 下载单个资源文件
   *
   * 资源存放路径：笔记同目录下的 `笔记名-assets/文件名`
   * 例如笔记 `inBox/日记/生活/今天.md`，图片存到 `inBox/日记/生活/今天-assets/img-001.jpg`
   *
   * @returns true 表示新下载，false 表示已存在
   */
  private async downloadAsset(asset: ParsedAsset, noteFilePath: string): Promise<boolean> {
    // 跳过无效资源
    if (!asset.remoteUrl && !asset.remotePath) {
      return false;
    }
    if (asset.remotePath && asset.remotePath.startsWith("unknown-")) {
      return false;
    }

    const localPath = this.getAssetLocalPath(asset, noteFilePath);

    // 检查是否已处理过（避免重复下载）
    if (this.processedAssets.has(localPath)) {
      return false;
    }

    // 检查本地是否存在
    if (this.assetExists(localPath)) {
      this.processedAssets.add(localPath);
      return false;
    }

    // 从云端下载
    // 优先用 remoteUrl（完整 URL），否则用 remotePath（相对路径）
    const downloadPath = (asset.remoteUrl && asset.remoteUrl.startsWith("http"))
      ? asset.remoteUrl
      : asset.remotePath;
    const buffer = await this.cloudClient.downloadAsset(downloadPath);
    if (!buffer) {
      throw new Error(`Failed to download: ${downloadPath}`);
    }

    // 保存到本地
    await this.saveAsset(localPath, buffer);
    this.processedAssets.add(localPath);

    return true;
  }

  /**
   * 获取资源在 vault 中的完整路径
   *
   * 规则：笔记同目录下建 `笔记名-assets/` 子文件夹，资源放里面。
   * 例如笔记 `inBox/日记/生活/今天.md` → 资源 `inBox/日记/生活/今天-assets/img-001.jpg`
   *
   * @param asset 资源（localPath 现在只是文件名）
   * @param noteFilePath 笔记完整路径（含 .md 扩展名）
   */
  private getAssetLocalPath(asset: ParsedAsset, noteFilePath: string): string {
    // 笔记所在目录（如 inBox/日记/生活）
    const dir = noteFilePath.substring(0, noteFilePath.lastIndexOf("/"));
    // 笔记文件名（不含扩展名，如 今天）
    const noteName = noteFilePath.substring(
      noteFilePath.lastIndexOf("/") + 1,
      noteFilePath.lastIndexOf(".")
    );
    // 资源文件名（asset.localPath 现在只是文件名）
    const assetFileName = asset.localPath;
    return `${dir}/${noteName}-assets/${assetFileName}`;
  }

  /**
   * 检查资源是否存在
   */
  private assetExists(path: string): boolean {
    const vault = this.app.vault;
    const normalized = path.replace(/^\/+/, "");

    // 使用 AbstractFile 检查
    const file = vault.getAbstractFileByPath(normalized);
    return file !== null;
  }

  /**
   * 保存资源文件
   */
  private async saveAsset(path: string, buffer: ArrayBuffer): Promise<void> {
    const vault = this.app.vault;
    const normalized = path.replace(/^\/+/, "");

    // 确保目录存在
    const dirPath = normalized.substring(0, normalized.lastIndexOf("/"));
    if (dirPath && !(vault.getAbstractFileByPath(dirPath))) {
      await vault.adapter.mkdir(dirPath);
    }

    // 写入文件 - 将 ArrayBuffer 转换为 Uint8Array
    const uint8Array = new Uint8Array(buffer);
    await vault.adapter.writeBinary(normalized, uint8Array.buffer);
  }

  /**
   * 重置处理记录（每次同步开始时调用）
   */
  resetProcessedAssets(): void {
    this.processedAssets.clear();
  }
}
