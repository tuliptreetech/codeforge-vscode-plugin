const path = require("path");
const dockerOperations = require("../core/dockerOperations");

/**
 * BacktraceService - Generates backtraces for crash files
 *
 * This service runs the `codeforge generate-backtrace` command to produce
 * GDB backtraces for fuzzer crash files. The command requires:
 * - A crash identifier in the format "fuzzer_name/full_hash" (without "crash-" prefix)
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
   * @param {string} crashHash - Full hash identifier for the crash (without "crash-" prefix)
   * @param {string} imageName - Docker image name for script execution
   * @returns {Promise<string>} The generated backtrace output
   */
  async generateBacktrace(workspacePath, fuzzerName, crashHash, imageName) {
    try {
      // Format crash identifier as "fuzzer_name/hash" for the codeforge command
      // The codeforge generate-backtrace command expects: fuzzer_name/full_hash_without_crash_prefix
      const crashIdentifier = `${fuzzerName}/${crashHash}`;

      // Execute codeforge generate-backtrace command in Docker container
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
   * Executes the `codeforge generate-backtrace` command in Docker container
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} crashIdentifier - Crash identifier in format "fuzzer_name/full_hash" (without "crash-" prefix)
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

      // Execute the generate-backtrace script
      const backtraceCommand = `codeforge generate-backtrace "${crashIdentifier}"`;

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
   * @param {Date} crashTime - Time when crash occurred (optional, defaults to current time)
   * @returns {string} Formatted backtrace for display
   */
  formatBacktraceForDisplay(backtrace, fuzzerName, crashId, crashTime = null) {
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

    // Include raw backtrace output
    formatted += backtrace;

    formatted += `\n\n${"=".repeat(80)}\n`;

    return formatted;
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
   * Check if backtrace generation is available for a fuzzer
   * Verifies that the necessary files and executables exist
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @returns {Promise<boolean>} True if backtrace generation is available
   */
  async isBacktraceAvailable(workspacePath, fuzzerName) {
    try {
      // Check if fuzzing directory exists (where fuzzer executables and crashes are stored)
      const fs = require("fs").promises;
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
