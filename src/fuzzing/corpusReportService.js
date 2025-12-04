const path = require("path");
const dockerOperations = require("../core/dockerOperations");

/**
 * CorpusReportService - Generates corpus reports for fuzzers
 *
 * This service runs the `codeforge generate-corpus-report` command to produce
 * corpus reports including hexdumps and statistics for fuzzer corpus files.
 */
class CorpusReportService {
  constructor(resourceManager = null) {
    this.dockerOperations = dockerOperations;
    this.resourceManager = resourceManager;
  }

  /**
   * Generate corpus report for a fuzzer
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {string} imageName - Docker image name for script execution
   * @returns {Promise<string>} The generated corpus report output
   */
  async generateCorpusReport(workspacePath, fuzzerName, imageName) {
    try {
      // Execute codeforge generate-corpus-report command in Docker container
      const corpusReport = await this.executeCorpusReportScript(
        workspacePath,
        fuzzerName,
        imageName,
      );

      return corpusReport;
    } catch (error) {
      console.error(
        `Failed to generate corpus report for ${fuzzerName}:`,
        error.message,
      );
      throw new Error(`Corpus report generation failed: ${error.message}`);
    }
  }

  /**
   * Executes the `codeforge generate-corpus-report` command in Docker container
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Fuzzer name
   * @param {string} imageName - Docker image name
   * @returns {Promise<string>} The corpus report output
   */
  async executeCorpusReportScript(workspacePath, fuzzerName, imageName) {
    return new Promise((resolve, reject) => {
      const options = {
        removeAfterRun: true,
        mountWorkspace: true,
        dockerCommand: "docker",
        containerType: "corpus_report_generation",
      };

      // Execute the generate-corpus-report command
      const corpusReportCommand = `codeforge generate-corpus-report "${fuzzerName}"`;

      const corpusReportProcess =
        this.dockerOperations.runDockerCommandWithOutput(
          workspacePath,
          imageName,
          corpusReportCommand,
          "/bin/bash",
          { ...options, resourceManager: this.resourceManager },
        );

      let stdout = "";
      let stderr = "";

      corpusReportProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      corpusReportProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      corpusReportProcess.on("close", (code) => {
        if (code !== 0) {
          // Non-zero exit code indicates an error
          const errorMsg = stderr || stdout || "Unknown error";
          reject(
            new Error(
              `Corpus report generation exited with code ${code}: ${errorMsg.trim()}`,
            ),
          );
          return;
        }

        // Success - return the corpus report output
        // The command outputs the full corpus report to stdout
        if (stdout.trim()) {
          resolve(stdout.trim());
        } else {
          // If no output, provide a message
          resolve(
            stderr.trim() ||
              "No corpus report generated (corpus directory may be empty)",
          );
        }
      });

      corpusReportProcess.on("error", (error) => {
        reject(
          new Error(
            `Failed to execute corpus report generation: ${error.message}`,
          ),
        );
      });
    });
  }

  /**
   * Check if corpus report generation is available for a fuzzer
   * Verifies that the necessary files and executables exist
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @returns {Promise<boolean>} True if corpus report generation is available
   */
  async isCorpusReportAvailable(workspacePath, fuzzerName) {
    try {
      // Check if fuzzing directory exists
      const fs = require("fs").promises;
      const fuzzingDir = path.join(workspacePath, ".codeforge", "fuzzing");
      await fs.access(fuzzingDir);

      return true;
    } catch (error) {
      console.warn(
        `Corpus report not available for ${fuzzerName}: ${error.message}`,
      );
      return false;
    }
  }
}

module.exports = { CorpusReportService };
