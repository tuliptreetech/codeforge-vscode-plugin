const path = require("path");
const dockerOperations = require("../core/dockerOperations");

/**
 * BacktraceService - Generates backtraces for crash files
 *
 * This service runs the generate-backtrace.sh script to produce
 * GDB backtraces for fuzzer crash files. The script requires:
 * - A crash identifier in the format "fuzzer_name/crash_hash"
 * - The fuzzer executable to exist in .codeforge/fuzzing/
 * - The crash file to exist in .codeforge/fuzzing/fuzzer_name-output/
 */
class BacktraceService {
  constructor(resourceManager = null) {
    this.dockerOperations = dockerOperations;
    this.resourceManager = resourceManager;
  }

  /**
   * Generate backtrace for a crash file
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {string} crashHash - Hash identifier for the crash
   * @param {string} imageName - Docker image name for script execution
   * @returns {Promise<string>} The generated backtrace output
   */
  async generateBacktrace(workspacePath, fuzzerName, crashHash, imageName) {
    try {
      // Format crash identifier as "fuzzer_name/crash_hash"
      const crashIdentifier = `${fuzzerName}/${crashHash}`;

      // Execute generate-backtrace.sh script in Docker container
      const backtrace = await this.executeBacktraceScript(
        workspacePath,
        crashIdentifier,
        imageName,
      );

      return backtrace;
    } catch (error) {
      console.error(
        `Failed to generate backtrace for ${fuzzerName}/${crashHash}:`,
        error.message,
      );
      throw new Error(`Backtrace generation failed: ${error.message}`);
    }
  }

  /**
   * Executes the generate-backtrace.sh script in Docker container
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} crashIdentifier - Crash identifier in format "fuzzer_name/crash_hash"
   * @param {string} imageName - Docker image name
   * @returns {Promise<string>} The backtrace output from GDB
   */
  async executeBacktraceScript(workspacePath, crashIdentifier, imageName) {
    return new Promise((resolve, reject) => {
      const options = {
        removeAfterRun: true,
        mountWorkspace: true,
        dockerCommand: "docker",
        containerType: "backtrace_generation",
      };

      // Execute the generate-backtrace.sh script
      const backtraceCommand = `.codeforge/scripts/generate-backtrace.sh "${crashIdentifier}"`;

      const backtraceProcess = this.dockerOperations.runDockerCommandWithOutput(
        workspacePath,
        imageName,
        backtraceCommand,
        "/bin/bash",
        { ...options, resourceManager: this.resourceManager },
      );

      let stdout = "";
      let stderr = "";

      backtraceProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      backtraceProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      backtraceProcess.on("close", (code) => {
        if (code !== 0) {
          // Non-zero exit code indicates an error
          const errorMsg = stderr || stdout || "Unknown error";
          reject(
            new Error(
              `Backtrace script exited with code ${code}: ${errorMsg.trim()}`,
            ),
          );
          return;
        }

        // Success - return the backtrace output
        // The script outputs backtrace to stdout via gdb
        if (stdout.trim()) {
          resolve(stdout.trim());
        } else {
          // If no output, check if there's informational stderr
          resolve(
            stderr.trim() ||
              "No backtrace generated (process may not have crashed)",
          );
        }
      });

      backtraceProcess.on("error", (error) => {
        reject(
          new Error(`Failed to execute backtrace script: ${error.message}`),
        );
      });
    });
  }

  /**
   * Extract crash hash from crash ID
   * Crash IDs are typically in format "crash-HASH" where HASH is the identifier
   * @param {string} crashId - The crash identifier (e.g., "crash-abc123")
   * @returns {string} The crash hash portion
   */
  extractCrashHash(crashId) {
    if (!crashId) {
      throw new Error("Crash ID is required");
    }

    // Remove "crash-" prefix if present
    if (crashId.startsWith("crash-")) {
      return crashId.substring(6);
    }

    // Return as-is if no prefix
    return crashId;
  }

  /**
   * Format backtrace output for display in crash reports
   * @param {string} backtrace - Raw backtrace output from GDB
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {string} crashId - Crash identifier
   * @param {string} workspacePath - Path to workspace root (optional, for making paths clickable)
   * @param {Date} crashTime - Time when crash occurred (optional, defaults to current time)
   * @returns {string} Formatted backtrace for display with ANSI colors
   */
  formatBacktraceForDisplay(
    backtrace,
    fuzzerName,
    crashId,
    workspacePath = null,
    crashTime = null,
  ) {
    if (!backtrace || backtrace.trim().length === 0) {
      return `BACKTRACE NOT AVAILABLE\nCould not generate backtrace for crash ${crashId}\n`;
    }

    const timestamp = crashTime || new Date();

    // Simple text formatting without ANSI codes
    let formatted = `\n${"=".repeat(80)}\n`;
    formatted += `BACKTRACE ANALYSIS\n`;
    formatted += `${"=".repeat(80)}\n\n`;

    formatted += `Fuzzer:      ${fuzzerName}\n`;
    formatted += `Crash:       ${crashId}\n`;
    formatted += `Crash Time:  ${this.formatDateTime(timestamp)}\n\n`;

    formatted += `${"=".repeat(80)}\n`;
    formatted += `STACK TRACE\n`;
    formatted += `${"=".repeat(80)}\n\n`;

    // Process backtrace to make file paths clickable with relative paths
    if (workspacePath) {
      formatted += this.makeBacktracePathsClickable(backtrace, workspacePath);
    } else {
      formatted += backtrace;
    }

    formatted += `\n\n${"=".repeat(80)}\n`;

    return formatted;
  }

  /**
   * Convert file paths in backtrace to clickable links
   * VSCode recognizes file:// URIs with absolute paths
   * @param {string} backtrace - Raw backtrace output
   * @param {string} workspacePath - Path to workspace root
   * @returns {string} Backtrace with clickable file links
   */
  makeBacktracePathsClickable(backtrace, workspacePath) {
    // GDB backtrace pattern: at /path/to/file.c:123 or at C:\path\to\file.c:123
    // Match both forward slashes and backslashes for cross-platform support
    const fileLinePattern = /(at\s+)([\w\-_:/\\]+\.[\w]+):(\d+)/g;

    return backtrace.replace(
      fileLinePattern,
      (match, atPrefix, filePath, lineNumber) => {
        // Resolve to absolute path
        const absolutePath = this.resolveFilePath(filePath, workspacePath);

        // VSCode recognizes: file:///absolute/path/file.c:line
        return `${atPrefix}file://${absolutePath}#${lineNumber}`;
      },
    );
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
   * Resolve file path to absolute path
   * @param {string} filePath - Relative or absolute file path
   * @param {string} workspacePath - Path to workspace root
   * @returns {string} Absolute file path
   */
  resolveFilePath(filePath, workspacePath) {
    // If already absolute, return as-is
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // Otherwise, resolve relative to workspace
    return path.resolve(workspacePath, filePath);
  }

  /**
   * Check if backtrace generation is available for a fuzzer
   * Verifies that the necessary files and executables exist
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @returns {Promise<boolean>} True if backtrace generation is available
   */
  async isBacktraceAvailable(workspacePath, fuzzerName) {
    try {
      // Check if generate-backtrace.sh script exists
      const fs = require("fs").promises;
      const scriptPath = path.join(
        workspacePath,
        ".codeforge",
        "scripts",
        "generate-backtrace.sh",
      );

      await fs.access(scriptPath);

      // Check if fuzzing directory exists
      const fuzzingDir = path.join(workspacePath, ".codeforge", "fuzzing");
      await fs.access(fuzzingDir);

      return true;
    } catch (error) {
      console.warn(
        `Backtrace not available for ${fuzzerName}: ${error.message}`,
      );
      return false;
    }
  }
}

module.exports = { BacktraceService };
