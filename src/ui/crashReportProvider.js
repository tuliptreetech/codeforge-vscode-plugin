const vscode = require("vscode");
const path = require("path");
const { CrashReportService } = require("../fuzzing/crashReportService");
const dockerOperations = require("../core/dockerOperations");

/**
 * Read-only crash report document provider for crash files
 * Creates virtual documents that cannot be edited or saved
 */
class CrashReportProvider {
  constructor() {
    this.onDidChangeEmitter = new vscode.EventEmitter();
    this.onDidChange = this.onDidChangeEmitter.event;

    // Cache for crash report content to avoid regenerating
    this.contentCache = new Map();

    // Crash report service for generating crash reports
    this.crashReportService = new CrashReportService();
  }

  /**
   * Provide document content for virtual crash report documents
   * @param {vscode.Uri} uri - Virtual URI for the crash report document
   * @returns {Promise<string>} The crash report content
   */
  async provideTextDocumentContent(uri) {
    try {
      // Parse the URI to get the original file path
      const query = new URLSearchParams(uri.query);
      const filePath = query.get("file");
      const crashId = query.get("crashId") || path.basename(filePath);
      const fullHash = query.get("fullHash");
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

      // Generate crash report content
      const crashReportContent = await this.generateCrashReport(
        filePath,
        crashId,
        fuzzerName,
        workspacePath,
        fullHash,
      );

      // Cache the content
      this.contentCache.set(cacheKey, crashReportContent);

      return crashReportContent;
    } catch (error) {
      // Return error content if something goes wrong
      return `ERROR: Failed to generate crash report\n${error.message}\n\nThis document is read-only and cannot be edited.`;
    }
  }

  /**
   * Generate crash report content
   * @param {string} filePath - Path to the crash file
   * @param {string} crashId - Crash identifier for display (abbreviated)
   * @param {string} fuzzerName - Name of the fuzzer (optional)
   * @param {string} workspacePath - Path to workspace root (optional)
   * @param {string} fullHash - Full crash hash (optional, for crash report generation)
   * @returns {Promise<string>} Crash report content
   */
  async generateCrashReport(
    filePath,
    crashId,
    fuzzerName = null,
    workspacePath = null,
    fullHash = null,
  ) {
    try {
      // If fuzzer name and workspace path are provided, generate full crash report
      if (fuzzerName && workspacePath) {
        // Check if crash report generation is available
        const isAvailable =
          await this.crashReportService.isCrashReportAvailable(
            workspacePath,
            fuzzerName,
          );

        if (!isAvailable) {
          return `Crash report generation not available (fuzzing directory not found)\n\nThis document is read-only and cannot be edited.`;
        }

        // Use fullHash if provided, otherwise extract from crashId or filename
        let crashHash = fullHash;
        if (!crashHash) {
          crashHash = this.crashReportService.extractCrashHash(crashId);
        }

        // Generate container/image name
        const imageName = dockerOperations.generateContainerName(workspacePath);

        // Generate crash report (includes backtrace and all crash details)
        const crashReport = await this.crashReportService.generateCrashReport(
          workspacePath,
          fuzzerName,
          crashHash,
          imageName,
        );

        // Return the crash report directly (already formatted by codeforge command)
        return crashReport;
      }

      // If no fuzzer info provided, just show basic info
      return `Crash file: ${crashId}\nPath: ${filePath}\n\nFull crash report unavailable - missing fuzzer context.\n\nThis document is read-only and cannot be edited.`;
    } catch (error) {
      // Handle crash report generation errors gracefully
      console.warn(`Failed to generate crash report: ${error.message}`);
      return `CRASH REPORT GENERATION FAILED\n\nError: ${error.message}\n\nThis document is read-only and cannot be edited.`;
    }
  }

  /**
   * Create a virtual URI for a crash report document
   * @param {string} filePath - Original file path
   * @param {string} crashId - Crash identifier (abbreviated)
   * @param {string} fuzzerName - Name of the fuzzer (optional)
   * @param {string} workspacePath - Path to workspace root (optional)
   * @param {string} fullHash - Full crash hash (optional, for crash report generation)
   * @returns {vscode.Uri} Virtual URI for the crash report document
   */
  static createCrashReportUri(
    filePath,
    crashId,
    fuzzerName = null,
    workspacePath = null,
    fullHash = null,
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
    if (fullHash) {
      queryParams.fullHash = fullHash;
    }

    const query = new URLSearchParams(queryParams);

    // Create virtual URI with crash report scheme (.txt for rendering)
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

module.exports = { CrashReportProvider };
