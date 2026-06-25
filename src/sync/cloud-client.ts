import { AtomicNote } from "../types/inbox";

/**
 * 云存储文件信息
 */
export interface CloudFileInfo {
  id: string;          // 笔记ID (noteId)
  etag?: string;       // ETag
  mtime?: number;      // 修改时间（毫秒）
  size?: number;       // 文件大小
  path: string;        // 云端路径
}

/**
 * 云存储客户端接口
 */
export interface CloudClient {
  /**
   * 列出所有笔记文件
   */
  listNotes(): Promise<CloudFileInfo[]>;

  /**
   * 下载单个原子笔记
   */
  downloadAtomicNote(path: string): Promise<AtomicNote | null>;

  /**
   * 下载资源文件（二进制）
   * remotePath 可以是相对路径或完整 URL
   */
  downloadAsset(remotePath: string): Promise<ArrayBuffer | null>;

  /**
   * 测试连接
   */
  testConnection(): Promise<{ success: boolean; error?: string }>;

  /**
   * 获取根路径前缀（如 inBox/ 或 inBoxDebug/）
   */
  getRootPath(): string;
}
