const path = require("path");
const dockerOperations = require("../core/dockerOperations");

/**
 * CrashReportService - Generates crash reports for crash files
 *
 * This service runs the `codeforge generate-crash-report` command to produce
 * full crash reports including GDB backtraces for fuzzer crash files. The command requires:
 * - A crash identifier in the format "fuzzer_name/full_hash" (without "crash-" prefix)
 * - The fuzzer executable to exist in .codeforge/fuzzing/
 * - The crash file to exist in .codeforge/fuzzing/fuzzer_name-output/
 */
class CrashReportService {
  constructor(resourceManager = null) {
    this.dockerOperations = dockerOperations;
    this.resourceManager = resourceManager;
  }

  /**
   * Generate crash report for a crash file
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {string} crashHash - Full hash identifier for the crash (without "crash-" prefix)
   * @param {string} imageName - Docker image name for script execution
   * @returns {Promise<string>} The generated crash report output
   */
  async generateCrashReport(workspacePath, fuzzerName, crashHash, imageName) {
    try {
      // Format crash identifier as "fuzzer_name/hash" for the codeforge command
      // The codeforge generate-crash-report command expects: fuzzer_name/full_hash_without_crash_prefix
      const crashIdentifier = `${fuzzerName}/${crashHash}`;

      // Execute codeforge generate-crash-report command in Docker container
      const crashReport = await this.executeCrashReportScript(
        workspacePath,
        crashIdentifier,
        imageName,
      );

      return crashReport;
    } catch (error) {
      console.error(
        `Failed to generate crash report for ${fuzzerName}/${crashHash}:`,
        error.message,
      );
      throw new Error(`Crash report generation failed: ${error.message}`);
    }
  }

  /**
   * Executes the `codeforge generate-crash-report` command in Docker container
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} crashIdentifier - Crash identifier in format "fuzzer_name/full_hash" (without "crash-" prefix)
   * @param {string} imageName - Docker image name
   * @returns {Promise<string>} The crash report output including backtrace
   */
  async executeCrashReportScript(workspacePath, crashIdentifier, imageName) {
    return new Promise((resolve, reject) => {
      const options = {
        removeAfterRun: true,
        mountWorkspace: true,
        dockerCommand: "docker",
        containerType: "crash_report_generation",
      };

      // Execute the generate-crash-report command
      const crashReportCommand = `codeforge generate-crash-report "${crashIdentifier}"`;

      const crashReportProcess =
        this.dockerOperations.runDockerCommandWithOutput(
          workspacePath,
          imageName,
          crashReportCommand,
          "/bin/bash",
          { ...options, resourceManager: this.resourceManager },
        );

      let stdout = "";
      let stderr = "";

      crashReportProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      crashReportProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      crashReportProcess.on("close", (code) => {
        if (code !== 0) {
          // Non-zero exit code indicates an error
          const errorMsg = stderr || stdout || "Unknown error";
          reject(
            new Error(
              `Crash report generation exited with code ${code}: ${errorMsg.trim()}`,
            ),
          );
          return;
        }

        // Success - return the crash report output
        // The command outputs the full crash report to stdout
        if (stdout.trim()) {
          resolve(stdout.trim());
        } else {
          // If no output, check if there's informational stderr
          resolve(
            stderr.trim() ||
              "No crash report generated (process may not have crashed)",
          );
        }
      });

      crashReportProcess.on("error", (error) => {
        reject(
          new Error(
            `Failed to execute crash report generation: ${error.message}`,
          ),
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
   * Format crash report output for display
   * @param {string} crashReport - Full crash report from codeforge generate-crash-report
   * @param {string} _fuzzerName - Name of the fuzzer (unused, kept for compatibility)
   * @param {string} crashId - Crash identifier
   * @param {Date} _crashTime - Time when crash occurred (unused, kept for compatibility)
   * @returns {string} Formatted crash report for display
   */
  formatCrashReportForDisplay(
    crashReport,
    _fuzzerName,
    crashId,
    _crashTime = null,
  ) {
    if (!crashReport || crashReport.trim().length === 0) {
      return `CRASH REPORT NOT AVAILABLE\nCould not generate crash report for crash ${crashId}\n`;
    }

    // The codeforge generate-crash-report command returns a fully formatted report
    // Just add some spacing and return it as-is
    return `\n${crashReport}\n`;
  }

  /**
   * Check if crash report generation is available for a fuzzer
   * Verifies that the necessary files and executables exist
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @returns {Promise<boolean>} True if crash report generation is available
   */
  async isCrashReportAvailable(workspacePath, fuzzerName) {
    try {
      // Check if fuzzing directory exists (where fuzzer executables and crashes are stored)
      const fs = require("fs").promises;
      const fuzzingDir = path.join(workspacePath, ".codeforge", "fuzzing");
      await fs.access(fuzzingDir);

      return true;
    } catch (error) {
      console.warn(
        `Crash report not available for ${fuzzerName}: ${error.message}`,
      );
      return false;
    }
  }
}

module.exports = { CrashReportService };
