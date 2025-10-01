const vscode = require("vscode");
const fs = require("fs").promises;
const path = require("path");

/**
 * CorpusViewerService - Service for viewing corpus files with hexdumps
 *
 * This service reads all files from a fuzzer's corpus directory and generates
 * hexdumps for each file, presenting them in a read-only editor window.
 */
class CorpusViewerService {
  constructor() {
    this.fs = fs;
    this.path = path;
  }

  /**
   * Gets the corpus directory for a fuzzer
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @returns {string} Path to the corpus directory
   */
  getCorpusDirectory(workspacePath, fuzzerName) {
    return this.path.join(
      workspacePath,
      ".codeforge",
      "fuzzing",
      `${fuzzerName}-output`,
      "corpus",
    );
  }

  /**
   * Reads all files from the corpus directory
   * @param {string} corpusDir - Path to the corpus directory
   * @returns {Promise<Array>} Array of {name, path, size, data} objects
   */
  async readCorpusFiles(corpusDir) {
    try {
      // Check if corpus directory exists
      await this.fs.access(corpusDir);

      // Read directory contents
      const entries = await this.fs.readdir(corpusDir, { withFileTypes: true });

      // Filter for files only (exclude directories)
      const files = entries.filter((entry) => entry.isFile());

      // Read file data
      const corpusFiles = [];
      for (const file of files) {
        const filePath = this.path.join(corpusDir, file.name);
        try {
          const stats = await this.fs.stat(filePath);
          const data = await this.fs.readFile(filePath);

          corpusFiles.push({
            name: file.name,
            path: filePath,
            size: stats.size,
            data: data,
            createdAt: stats.birthtime || stats.mtime,
          });
        } catch (error) {
          console.warn(`Failed to read corpus file ${file.name}:`, error);
        }
      }

      // Sort files by name
      corpusFiles.sort((a, b) => a.name.localeCompare(b.name));

      return corpusFiles;
    } catch (error) {
      if (error.code === "ENOENT") {
        // Corpus directory doesn't exist
        return [];
      }
      throw new Error(`Failed to read corpus directory: ${error.message}`);
    }
  }

  /**
   * Generates a hexdump for a single file
   * @param {Buffer} data - File data
   * @param {string} fileName - Name of the file
   * @param {number} fileSize - Size of the file in bytes
   * @param {Date} createdAt - File creation timestamp
   * @param {number} maxSize - Maximum size to display (default 64KB)
   * @returns {string} Formatted hexdump
   */
  generateHexDump(data, fileName, fileSize, createdAt, maxSize = 1024 * 64) {
    const truncated = data.length > maxSize;
    const displayData = truncated ? data.slice(0, maxSize) : data;

    let hexDump = `\n${"=".repeat(80)}\n`;
    hexDump += `FILE: ${fileName}\n`;
    hexDump += `${"=".repeat(80)}\n\n`;
    hexDump += `File Name:   ${fileName}\n`;
    hexDump += `File Size:   ${fileSize} bytes${truncated ? " (showing first 64KB)" : ""}\n`;
    hexDump += `Created:     ${this.formatDateTime(createdAt)}\n\n`;

    if (displayData.length === 0) {
      hexDump += `Empty file - no content to display\n`;
      return hexDump;
    }

    // Generate hex dump in standard format: offset | hex bytes | ASCII
    for (let i = 0; i < displayData.length; i += 16) {
      // Format offset (8 hex digits)
      const offset = i.toString(16).padStart(8, "0");

      // Get 16 bytes (or remaining bytes)
      const chunk = displayData.slice(i, i + 16);

      // Format hex bytes and ASCII
      let hexBytes = "";
      let asciiChars = "";

      for (let j = 0; j < 16; j++) {
        if (j < chunk.length) {
          const byte = chunk[j];
          hexBytes += byte.toString(16).padStart(2, "0");

          // ASCII representation (printable chars or dot)
          if (byte >= 32 && byte <= 126) {
            asciiChars += String.fromCharCode(byte);
          } else {
            asciiChars += ".";
          }
        } else {
          hexBytes += "  "; // Empty space for missing bytes
          asciiChars += " ";
        }

        // Add space after every byte, extra space after 8 bytes
        if (j < 15) {
          hexBytes += " ";
          if (j === 7) {
            hexBytes += " ";
          }
        }
      }

      // Format: offset  hex_bytes  |ascii_chars|
      hexDump += `${offset}  ${hexBytes}  |${asciiChars}|\n`;
    }

    if (truncated) {
      hexDump += `\n... (file truncated at ${maxSize} bytes)\n`;
      hexDump += `Total file size: ${fileSize} bytes\n`;
    }

    return hexDump;
  }

  /**
   * Generates a complete corpus viewer document with all files
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @returns {Promise<string>} Complete corpus viewer content
   */
  async generateCorpusViewerContent(workspacePath, fuzzerName) {
    try {
      const corpusDir = this.getCorpusDirectory(workspacePath, fuzzerName);
      const corpusFiles = await this.readCorpusFiles(corpusDir);

      let content = ``;
      content += `${"=".repeat(80)}\n`;
      content += `CORPUS VIEWER: ${fuzzerName}\n`;
      content += `${"=".repeat(80)}\n\n`;
      content += `READ-ONLY VIEW - This document cannot be edited or saved\n\n`;
      content += `Fuzzer:      ${fuzzerName}\n`;
      content += `Corpus Dir:  ${corpusDir}\n`;
      content += `File Count:  ${corpusFiles.length}\n`;
      content += `Generated:   ${this.formatDateTime(new Date())}\n`;
      content += `\n`;

      if (corpusFiles.length === 0) {
        content += `\n`;
        content += `${"=".repeat(80)}\n`;
        content += `NO CORPUS FILES FOUND\n`;
        content += `${"=".repeat(80)}\n\n`;
        content += `The corpus directory is empty or does not exist yet.\n`;
        content += `Run the fuzzer to generate corpus files.\n`;
        return content;
      }

      // Generate summary table
      content += `${"=".repeat(80)}\n`;
      content += `CORPUS FILE SUMMARY\n`;
      content += `${"=".repeat(80)}\n\n`;

      corpusFiles.forEach((file, index) => {
        const sizeStr = this.formatFileSize(file.size);
        content += `${(index + 1).toString().padStart(3)}. ${file.name.padEnd(40)} ${sizeStr.padStart(10)} ${this.formatDateTime(file.createdAt)}\n`;
      });

      content += `\n`;

      // Generate hexdumps for each file
      content += `${"=".repeat(80)}\n`;
      content += `HEXDUMPS\n`;
      content += `${"=".repeat(80)}\n`;

      corpusFiles.forEach((file) => {
        content += this.generateHexDump(
          file.data,
          file.name,
          file.size,
          file.createdAt,
        );
      });

      content += `\n`;
      content += `${"=".repeat(80)}\n`;
      content += `END OF CORPUS VIEWER\n`;
      content += `${"=".repeat(80)}\n`;

      return content;
    } catch (error) {
      throw new Error(
        `Failed to generate corpus viewer content: ${error.message}`,
      );
    }
  }

  /**
   * Format date/time in a readable local format
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  formatDateTime(date) {
    const options = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    };

    return date.toLocaleString("en-US", options);
  }

  /**
   * Format file size in human-readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size string
   */
  formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }
}

module.exports = { CorpusViewerService };
