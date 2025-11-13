/**
 * Storage Service
 * Handles file system operations for temporary data storage
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class StorageService {
  /**
   * Save data as formatted JSON to a file
   * Creates directory structure if it doesn't exist
   * @param filePath - Absolute path where the file should be saved
   * @param data - Data to be serialized and saved
   */
  static async saveJson(filePath: string, data: unknown): Promise<void> {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Generate a timestamp string suitable for filenames
   * @returns Timestamp in format: YYYY-MM-DD HH-MM-SS
   */
  static generateTimestamp(): string {
    return new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/T/, " ")
      .replace(/\..+/, "");
  }

  /**
   * Check if we should save debug files based on environment
   */
  static shouldSaveDebugFiles(): boolean {
    return process.env.NODE_ENV === "development" || process.env.SAVE_DEBUG_FILES === "true";
  }
}
