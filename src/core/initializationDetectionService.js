const vscode = require("vscode");
const fs = require("fs").promises;
const path = require("path");

/**
 * Initialization Detection Service for CodeForge
 * Provides functionality to detect and manage CodeForge project initialization status
 */
class InitializationDetectionService {
  constructor(resourceManager) {
    this.resourceManager = resourceManager;
  }

  /**
   * Check if CodeForge is fully initialized in the current workspace
   * @param {string} workspacePath - Path to the workspace directory
   * @returns {Promise<{isInitialized: boolean, missingComponents: string[], details: object}>}
   */
  async isCodeForgeInitialized(workspacePath) {
    if (!workspacePath) {
      return {
        isInitialized: false,
        missingComponents: ["workspace"],
        details: { error: "No workspace path provided" },
      };
    }

    const codeforgeDir = path.join(workspacePath, ".codeforge");
    const requiredPaths = {
      codeforgeDirectory: codeforgeDir,
      dockerfile: path.join(codeforgeDir, "Dockerfile"),
      gitignore: path.join(codeforgeDir, ".gitignore"),
      scriptsDirectory: path.join(codeforgeDir, "scripts"),
      buildScript: path.join(codeforgeDir, "scripts", "build-fuzz-tests.sh"),
      findScript: path.join(codeforgeDir, "scripts", "find-fuzz-tests.sh"),
      runScript: path.join(codeforgeDir, "scripts", "run-fuzz-tests.sh"),
      findCrashesScript: path.join(codeforgeDir, "scripts", "find-crashes.sh"),
      generateBacktraceScript: path.join(
        codeforgeDir,
        "scripts",
        "generate-backtrace.sh",
      ),
      clearCrashesScript: path.join(
        codeforgeDir,
        "scripts",
        "clear-crashes.sh",
      ),
    };

    const missingComponents = [];
    const details = {};

    // Check each required component
    for (const [component, componentPath] of Object.entries(requiredPaths)) {
      try {
        const stats = await fs.stat(componentPath);
        details[component] = {
          exists: true,
          path: componentPath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modified: stats.mtime,
        };
      } catch (error) {
        details[component] = {
          exists: false,
          path: componentPath,
          error: error.code,
        };
        missingComponents.push(component);
      }
    }

    const isInitialized = missingComponents.length === 0;

    return {
      isInitialized,
      missingComponents,
      details,
    };
  }

  /**
   * Initialize CodeForge project with progress reporting
   * @param {string} workspacePath - Path to the workspace directory
   * @param {Function} progressCallback - Callback function for progress updates
   * @returns {Promise<{success: boolean, error?: string, details?: object}>}
   */
  async initializeProjectWithProgress(workspacePath, progressCallback = null) {
    if (!workspacePath) {
      return {
        success: false,
        error: "No workspace path provided",
      };
    }

    if (!this.resourceManager) {
      return {
        success: false,
        error: "ResourceManager not available",
      };
    }

    try {
      const codeforgeDir = path.join(workspacePath, ".codeforge");
      const scriptsDir = path.join(codeforgeDir, "scripts");

      // Report progress
      const reportProgress = (message, percentage) => {
        if (progressCallback) {
          progressCallback(message, percentage);
        }
      };

      reportProgress("Checking current initialization status...", 10);

      // Check current status
      const currentStatus = await this.isCodeForgeInitialized(workspacePath);

      if (currentStatus.isInitialized) {
        reportProgress("CodeForge already initialized", 100);
        return {
          success: true,
          details: {
            message: "CodeForge was already initialized",
            status: currentStatus,
          },
        };
      }

      reportProgress("Creating .codeforge directory...", 20);

      // Create .codeforge directory if it doesn't exist
      if (!currentStatus.details.codeforgeDirectory?.exists) {
        await fs.mkdir(codeforgeDir, { recursive: true });
      }

      reportProgress("Creating .gitignore file...", 40);

      // Create .gitignore if it doesn't exist
      if (!currentStatus.details.gitignore?.exists) {
        await this.resourceManager.dumpGitignore(codeforgeDir);
      }

      reportProgress("Creating Dockerfile...", 60);

      // Create Dockerfile if it doesn't exist
      if (!currentStatus.details.dockerfile?.exists) {
        await this.resourceManager.dumpDockerfile(codeforgeDir);
      }

      reportProgress("Creating scripts directory and scripts...", 80);

      // Create scripts directory and copy scripts if they don't exist
      if (!currentStatus.details.scriptsDirectory?.exists) {
        await fs.mkdir(scriptsDir, { recursive: true });
        await this.resourceManager.dumpScripts(scriptsDir);
      } else {
        // Check individual scripts and create missing ones
        const scriptChecks = [
          { key: "buildScript", method: "dumpScripts" },
          { key: "findScript", method: "dumpScripts" },
          { key: "runScript", method: "dumpScripts" },
          { key: "findCrashesScript", method: "dumpScripts" },
          { key: "generateBacktraceScript", method: "dumpScripts" },
          { key: "clearCrashesScript", method: "dumpScripts" },
        ];

        const missingScripts = scriptChecks.filter(
          (script) => !currentStatus.details[script.key]?.exists,
        );

        if (missingScripts.length > 0) {
          await this.resourceManager.dumpScripts(scriptsDir);
        }
      }

      reportProgress("Verifying initialization...", 90);

      // Verify initialization was successful
      const finalStatus = await this.isCodeForgeInitialized(workspacePath);

      if (!finalStatus.isInitialized) {
        return {
          success: false,
          error: `Initialization incomplete. Missing: ${finalStatus.missingComponents.join(", ")}`,
          details: finalStatus,
        };
      }

      reportProgress("CodeForge initialization complete!", 100);

      return {
        success: true,
        details: {
          message: "CodeForge initialized successfully",
          status: finalStatus,
          createdComponents: currentStatus.missingComponents,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Initialization failed: ${error.message}`,
        details: { error: error.stack },
      };
    }
  }

  /**
   * Get a human-readable status summary
   * @param {string} workspacePath - Path to the workspace directory
   * @returns {Promise<{status: string, message: string, details: object}>}
   */
  async getInitializationStatusSummary(workspacePath) {
    const result = await this.isCodeForgeInitialized(workspacePath);

    if (result.isInitialized) {
      return {
        status: "initialized",
        message: "CodeForge is fully initialized and ready to use",
        details: result.details,
      };
    }

    const missingCount = result.missingComponents.length;
    const totalComponents = Object.keys(result.details).length;

    return {
      status: "not_initialized",
      message: `CodeForge is not initialized. Missing ${missingCount} of ${totalComponents} required components: ${result.missingComponents.join(", ")}`,
      details: result.details,
    };
  }

  /**
   * Check if workspace has a CodeForge project (even if not fully initialized)
   * @param {string} workspacePath - Path to the workspace directory
   * @returns {Promise<boolean>}
   */
  async hasCodeForgeProject(workspacePath) {
    if (!workspacePath) {
      return false;
    }

    try {
      const codeforgeDir = path.join(workspacePath, ".codeforge");
      await fs.access(codeforgeDir);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = { InitializationDetectionService };
