const vscode = require("vscode");
const fs = require("fs").promises;
const path = require("path");
const { BacktraceService } = require("../fuzzing/backtraceService");
const dockerOperations = require("../core/dockerOperations");

/**
 * Read-only hex document provider for crash files
 * Creates virtual documents that cannot be edited or saved
 */
class HexDocumentProvider {
  constructor() {
    this.onDidChangeEmitter = new vscode.EventEmitter();
    this.onDidChange = this.onDidChangeEmitter.event;

    // Cache for hex content to avoid regenerating
    this.contentCache = new Map();

    // Backtrace service for generating crash backtraces
    this.backtraceService = new BacktraceService();
  }

  /**
   * Provide document content for virtual hex documents
   * @param {vscode.Uri} uri - Virtual URI for the hex document
   * @returns {Promise<string>} The hex dump content
   */
  async provideTextDocumentContent(uri) {
    try {
      // Parse the URI to get the original file path
      const query = new URLSearchParams(uri.query);
      const filePath = query.get("file");
      const crashId = query.get("crashId") || path.basename(filePath);
      const fuzzerName = query.get("fuzzerName");
      const workspacePath = query.get("workspacePath");

      if (!filePath) {
        throw new Error("File path not provided in URI");
      }

      // Check cache first
      const cacheKey = `${filePath}:${crashId}`;
      if (this.contentCache.has(cacheKey)) {
        return this.contentCache.get(cacheKey);
      }

      // Generate hex dump content
      const hexContent = await this.generateHexDump(
        filePath,
        crashId,
        fuzzerName,
        workspacePath,
      );

      // Cache the content
      this.contentCache.set(cacheKey, hexContent);

      return hexContent;
    } catch (error) {
      // Return error content if something goes wrong
      return `ERROR: Failed to generate hex dump\n${error.message}\n\nThis document is read-only and cannot be edited.`;
    }
  }

  /**
   * Generate hex dump content for binary files
   * @param {string} filePath - Path to the file to dump
   * @param {string} crashId - Crash identifier for display
   * @param {number} maxSize - Maximum size to read (default 64KB)
   * @returns {Promise<string>} Hex dump content
   */
  async generateHexDump(
    filePath,
    crashId,
    fuzzerName = null,
    workspacePath = null,
    maxSize = 1024 * 64,
  ) {
    try {
      // Check if file exists and get stats
      const stats = await fs.stat(filePath);
      const crashTime = stats.birthtime || stats.mtime; // birthtime = creation, mtime = modification

      const buffer = await fs.readFile(filePath);
      const truncated = buffer.length > maxSize;
      const data = truncated ? buffer.slice(0, maxSize) : buffer;

      // Header without ANSI codes - plain text
      let hexDump = `\n${"=".repeat(80)}\n`;
      hexDump += `CRASH REPORT: ${crashId}\n`;
      hexDump += `${"=".repeat(80)}\n\n`;
      hexDump += `READ-ONLY VIEW - This document cannot be edited or saved\n\n`;

      hexDump += `Crash ID:    ${crashId}\n`;
      hexDump += `File:        ${path.basename(filePath)}\n`;
      hexDump += `Path:        ${filePath}\n`;
      hexDump += `File Size:   ${buffer.length} bytes${truncated ? " (showing first 64KB)" : ""}\n`;
      hexDump += `Crash Time:  ${this.formatDateTime(crashTime)}\n`;
      hexDump += `Generated:   ${this.formatDateTime(new Date())}\n\n`;

      hexDump += `${"=".repeat(80)}\n`;
      hexDump += `HEX DUMP\n`;
      hexDump += `${"=".repeat(80)}\n\n`;

      if (data.length === 0) {
        hexDump += `Empty file - no content to display\n\n`;
        return hexDump;
      }

      // Generate hex dump in standard format: offset | hex bytes | ASCII
      for (let i = 0; i < data.length; i += 16) {
        // Format offset (8 hex digits)
        const offset = i.toString(16).padStart(8, "0");

        // Get 16 bytes (or remaining bytes)
        const chunk = data.slice(i, i + 16);

        // Format hex bytes (2 hex digits per byte, space separated)
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

      hexDump += `\n`;

      if (truncated) {
        hexDump += `File truncated at ${maxSize} bytes for display. Total file size: ${buffer.length} bytes.\n\n`;
      }

      // Append backtrace if fuzzer name and workspace path are provided
      if (fuzzerName && workspacePath) {
        hexDump += await this.appendBacktrace(
          workspacePath,
          fuzzerName,
          crashId,
          filePath,
        );
      }

      return hexDump;
    } catch (error) {
      throw new Error(`Failed to generate hex dump: ${error.message}`);
    }
  }

  /**
   * Format date/time in a readable local format
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  formatDateTime(date) {
    // Format: "December 19, 2024 at 3:45:23 PM"
    const options = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    };

    return date.toLocaleString("en-US", options);
  }

  /**
   * Append backtrace to hex dump content
   * @param {string} workspacePath - Path to workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {string} crashId - Crash identifier
   * @param {string} crashFilePath - Path to crash file (to get timestamp)
   * @returns {Promise<string>} Formatted backtrace section or error message
   */
  async appendBacktrace(workspacePath, fuzzerName, crashId, crashFilePath) {
    try {
      // Check if backtrace generation is available
      const isAvailable = await this.backtraceService.isBacktraceAvailable(
        workspacePath,
        fuzzerName,
      );

      if (!isAvailable) {
        return `\nBacktrace generation not available (generate-backtrace.sh not found)\n`;
      }

      // Extract crash hash from crash ID
      const crashHash = this.backtraceService.extractCrashHash(crashId);

      // Generate container/image name
      const imageName = dockerOperations.generateContainerName(workspacePath);

      // Get crash file timestamp
      const stats = await fs.stat(crashFilePath);
      const crashTime = stats.birthtime || stats.mtime;

      // Generate backtrace
      const backtrace = await this.backtraceService.generateBacktrace(
        workspacePath,
        fuzzerName,
        crashHash,
        imageName,
      );

      // Format and return backtrace with clickable file links and crash timestamp
      return this.backtraceService.formatBacktraceForDisplay(
        backtrace,
        fuzzerName,
        crashId,
        workspacePath,
        crashTime,
      );
    } catch (error) {
      // Handle backtrace generation errors gracefully
      console.warn(`Failed to generate backtrace: ${error.message}`);
      return `\nBACKTRACE GENERATION FAILED\nError: ${error.message}\nThe hex dump above is still available for analysis.\n`;
    }
  }

  /**
   * Create a virtual URI for a hex document
   * @param {string} filePath - Original file path
   * @param {string} crashId - Crash identifier
   * @param {string} fuzzerName - Name of the fuzzer (optional)
   * @param {string} workspacePath - Path to workspace root (optional)
   * @returns {vscode.Uri} Virtual URI for the hex document
   */
  static createHexUri(
    filePath,
    crashId,
    fuzzerName = null,
    workspacePath = null,
  ) {
    const queryParams = {
      file: filePath,
      crashId: crashId,
    };

    // Add optional parameters if provided
    if (fuzzerName) {
      queryParams.fuzzerName = fuzzerName;
    }
    if (workspacePath) {
      queryParams.workspacePath = workspacePath;
    }

    const query = new URLSearchParams(queryParams);

    // Create virtual URI with crash report scheme (.txt for ANSI rendering)
    return vscode.Uri.parse(
      `codeforge-crash:${crashId}.txt?${query.toString()}`,
    );
  }

  /**
   * Clear the content cache
   */
  clearCache() {
    this.contentCache.clear();
  }

  /**
   * Dispose of the provider
   */
  dispose() {
    this.clearCache();
    this.onDidChangeEmitter.dispose();
  }
}

module.exports = { HexDocumentProvider };
