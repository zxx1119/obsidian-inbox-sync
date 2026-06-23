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
   * 改动（v0.3.1）：资源统一下载到 vault 根的 `inBox/assets/` 目录，
   * 不再按笔记名建子文件夹。noteFilePath 参数保留是为了不破坏调用方签名。
   *
   * @param note 笔记数据
   * @param noteFilePath 笔记在 vault 中的完整路径（v0.3.1 起仅用于日志，不参与路径拼接）
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
   * 资源存放路径（v0.3.1）：统一存到 vault 根 `inBox/assets/文件名`。
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
   * 改动（v0.3.1）：所有资源统一存到 vault 根的 `inBox/assets/` 目录，
   * 而不是每篇笔记一个 `笔记名-assets/` 子文件夹。
   * 原因：笔记名本身就是一句话，生成 `${noteName}-assets/` 后会跟 .md 文件
   * 在 Obsidian 文件树里折叠成同一节点，导致用户点不开笔记、只看到图片。
   * 改成全局 assets 目录后，.md 文件不再被折叠，且跨设备（同 vault）路径稳定。
   *
   * @param asset 资源（localPath 现在只是文件名）
   * @param noteFilePath 笔记完整路径（含 .md 扩展名，v0.3.1 起不再用于拼接）
   */
  private getAssetLocalPath(asset: ParsedAsset, noteFilePath: string): string {
    // v0.3.1: 所有资源统一进 vault 根的 inBox/assets/
    // noteFilePath 参数保留是为了不破坏调用方签名，但不再使用
    void noteFilePath;
    const assetFileName = asset.localPath;
    return `inBox/assets/${assetFileName}`;
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
