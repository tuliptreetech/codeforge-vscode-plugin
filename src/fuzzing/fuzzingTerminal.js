const vscode = require("vscode");
const dockerOperations = require("../core/dockerOperations");
const path = require("path");
const fs = require("fs").promises;

/**
 * Custom terminal implementation for fuzzing operations
 * Based on CodeForgeTaskTerminal pattern from taskProvider.js
 */
class CodeForgeFuzzingTerminal {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.writeEmitter = new vscode.EventEmitter();
    this.closeEmitter = new vscode.EventEmitter();
    this.fuzzingStartTime = null;
    this.isActive = false;
    this.fuzzingComplete = false; // Track when fuzzing is complete and ready to close
  }

  get onDidWrite() {
    return this.writeEmitter.event;
  }

  get onDidClose() {
    return this.closeEmitter.event;
  }

  /**
   * Opens the terminal and initializes fuzzing
   */
  async open(initialDimensions) {
    try {
      this.fuzzingStartTime = new Date();
      this.isActive = true;

      // Generate container name
      const containerName = dockerOperations.generateContainerName(
        this.workspacePath,
      );

      // Check if initialization is needed
      const dockerfilePath = path.join(
        this.workspacePath,
        ".codeforge",
        "Dockerfile",
      );
      let dockerfileExists = false;
      try {
        await fs.access(dockerfilePath);
        dockerfileExists = true;
      } catch {
        dockerfileExists = false;
      }

      if (!dockerfileExists) {
        const message =
          'CodeForge: Dockerfile not found. Please run "CodeForge: Initialize CodeForge" first.';
        this.writeEmitter.fire(`\r\n\x1b[33m${message}\x1b[0m\r\n`);
        this.closeEmitter.fire(1);
        return;
      }

      // Check if Docker image exists
      const imageExists =
        await dockerOperations.checkImageExists(containerName);
      if (!imageExists) {
        const buildMessage = `CodeForge: Docker image not found. Building ${containerName}...`;
        this.writeEmitter.fire(`\r\n\x1b[33m${buildMessage}\x1b[0m\r\n`);

        // Build the image
        try {
          await dockerOperations.buildDockerImage(
            this.workspacePath,
            containerName,
          );
          const successMessage = `Successfully built Docker image: ${containerName}`;
          this.writeEmitter.fire(`\r\n\x1b[32m${successMessage}\x1b[0m\r\n`);
        } catch (error) {
          const errorMessage = `Failed to build Docker image: ${error.message}`;
          this.writeEmitter.fire(`\r\n\x1b[31m${errorMessage}\x1b[0m\r\n`);
          this.closeEmitter.fire(1);
          return;
        }
      }

      // Start fuzzing workflow
      const startMessage = `CodeForge: Starting fuzzing workflow...`;
      const containerMessage = `Container: ${containerName}`;
      this.writeEmitter.fire(`\x1b[36m${startMessage}\x1b[0m\r\n`);
      this.writeEmitter.fire(`\x1b[90m${containerMessage}\x1b[0m\r\n\r\n`);

      // Import and run fuzzing operations
      const fuzzingOperations = require("./fuzzingOperations");

      // Create a progress callback that writes to terminal
      const progressCallback = (message, increment) => {
        const progressMessage = `[${increment}%] ${message}`;
        this.writeEmitter.fire(`\x1b[34m${progressMessage}\x1b[0m\r\n`);
      };

      try {
        const results = await fuzzingOperations.runFuzzingTests(
          this.workspacePath,
          this, // Pass terminal as output channel replacement
          progressCallback,
        );

        // Show completion message
        const endTime = new Date();
        const duration = ((endTime - this.fuzzingStartTime) / 1000).toFixed(2);

        let message;
        if (results.crashes.length > 0) {
          message = `Fuzzing completed with ${results.crashes.length} crash(es) found! Duration: ${duration}s`;
          this.writeEmitter.fire(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
        } else {
          message = `Fuzzing completed successfully. ${results.executedFuzzers} fuzzer(s) executed. Duration: ${duration}s`;
          this.writeEmitter.fire(`\r\n\x1b[32m${message}\x1b[0m\r\n`);
        }

        // Mark fuzzing as complete and enable key-to-close
        this.fuzzingComplete = true;

        // Add message prompting user to press any key to close
        this.writeEmitter.fire(
          `\r\n\x1b[93mPress any key to close terminal...\x1b[0m\r\n`,
        );
      } catch (error) {
        const errorMessage = `Fuzzing failed: ${error.message}`;
        this.writeEmitter.fire(`\r\n\x1b[31m${errorMessage}\x1b[0m\r\n`);
        this.closeEmitter.fire(1);
      }
    } catch (error) {
      const errorMessage = `Error: ${error.message}`;
      this.writeEmitter.fire(`\r\n\x1b[31m${errorMessage}\x1b[0m\r\n`);
      this.closeEmitter.fire(1);
    }
  }

  /**
   * Closes the terminal
   */
  async close() {
    this.isActive = false;
  }

  /**
   * Handles input - closes terminal if fuzzing is complete
   */
  handleInput(data) {
    // If fuzzing is complete, any keypress closes the terminal
    if (this.fuzzingComplete) {
      this.closeEmitter.fire(0);
      return;
    }
    // During active fuzzing, ignore input to prevent accidental closure
  }

  /**
   * Sets terminal dimensions (not critical for fuzzing)
   */
  setDimensions(dimensions) {
    // Terminal dimensions don't affect fuzzing output
  }

  /**
   * Replacement for outputChannel.appendLine() - writes to terminal
   * @param {string} message - Message to write
   */
  appendLine(message) {
    if (this.isActive) {
      // Convert message to terminal format with proper line endings
      const terminalMessage = message.replace(/\n/g, "\r\n");
      this.writeEmitter.fire(`${terminalMessage}\r\n`);
    }
  }

  /**
   * Replacement for outputChannel.show() - no-op for terminals
   */
  show() {
    // Terminals are already visible when created, so this is a no-op
  }

  /**
   * Writes raw data to terminal with proper formatting
   * @param {string} data - Raw data to write
   * @param {string} color - Optional ANSI color code
   */
  writeRaw(data, color = null) {
    if (this.isActive) {
      const output = data.toString();
      const terminalOutput = output.replace(/\n/g, "\r\n");

      if (color) {
        this.writeEmitter.fire(`${color}${terminalOutput}\x1b[0m`);
      } else {
        this.writeEmitter.fire(terminalOutput);
      }
    }
  }
}

/**
 * Custom terminal implementation for fuzzing build operations
 * Similar to CodeForgeFuzzingTerminal but focused on build-only workflow
 */
class CodeForgeBuildTerminal {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.writeEmitter = new vscode.EventEmitter();
    this.closeEmitter = new vscode.EventEmitter();
    this.buildStartTime = null;
    this.isActive = false;
    this.buildComplete = false; // Track when build is complete and ready to close
  }

  get onDidWrite() {
    return this.writeEmitter.event;
  }

  get onDidClose() {
    return this.closeEmitter.event;
  }

  /**
   * Opens the terminal and initializes build process
   */
  async open(initialDimensions) {
    try {
      this.buildStartTime = new Date();
      this.isActive = true;

      // Generate container name
      const containerName = dockerOperations.generateContainerName(
        this.workspacePath,
      );

      // Check if initialization is needed
      const dockerfilePath = path.join(
        this.workspacePath,
        ".codeforge",
        "Dockerfile",
      );
      let dockerfileExists = false;
      try {
        await fs.access(dockerfilePath);
        dockerfileExists = true;
      } catch {
        dockerfileExists = false;
      }

      if (!dockerfileExists) {
        const message =
          'CodeForge: Dockerfile not found. Please run "CodeForge: Initialize CodeForge" first.';
        this.writeEmitter.fire(`\r\n\x1b[33m${message}\x1b[0m\r\n`);
        this.closeEmitter.fire(1);
        return;
      }

      // Check if Docker image exists
      const imageExists =
        await dockerOperations.checkImageExists(containerName);
      if (!imageExists) {
        const buildMessage = `CodeForge: Docker image not found. Building ${containerName}...`;
        this.writeEmitter.fire(`\r\n\x1b[33m${buildMessage}\x1b[0m\r\n`);

        // Build the image
        try {
          await dockerOperations.buildDockerImage(
            this.workspacePath,
            containerName,
          );
          const successMessage = `Successfully built Docker image: ${containerName}`;
          this.writeEmitter.fire(`\r\n\x1b[32m${successMessage}\x1b[0m\r\n`);
        } catch (error) {
          const errorMessage = `Failed to build Docker image: ${error.message}`;
          this.writeEmitter.fire(`\r\n\x1b[31m${errorMessage}\x1b[0m\r\n`);
          this.closeEmitter.fire(1);
          return;
        }
      }

      // Start build workflow
      const startMessage = `CodeForge: Building fuzzing targets...`;
      const containerMessage = `Container: ${containerName}`;
      this.writeEmitter.fire(`\x1b[36m${startMessage}\x1b[0m\r\n`);
      this.writeEmitter.fire(`\x1b[90m${containerMessage}\x1b[0m\r\n\r\n`);

      // Import and run build operations
      const fuzzingOperations = require("./fuzzingOperations");

      // Create a progress callback that writes to terminal
      const progressCallback = (message, increment) => {
        const progressMessage = `[${increment}%] ${message}`;
        this.writeEmitter.fire(`\x1b[34m${progressMessage}\x1b[0m\r\n`);
      };

      try {
        const results = await fuzzingOperations.buildFuzzingTargetsOnly(
          this.workspacePath,
          this, // Pass terminal as output channel replacement
          progressCallback,
        );

        // Store results for notification system
        this.buildResults = results;

        // Show completion message
        const endTime = new Date();
        const duration = ((endTime - this.buildStartTime) / 1000).toFixed(2);

        // Display enhanced completion summary
        this.displayBuildCompletionSummary(results, duration);

        // Mark build as complete and enable key-to-close
        this.buildComplete = true;

        // Add message prompting user to press any key to close
        this.writeEmitter.fire(
          `\r\n\x1b[93mPress any key to close terminal...\x1b[0m\r\n`,
        );
      } catch (error) {
        // Store error information for notification system
        this.buildResults = {
          errors: [{ error: error.message, type: "critical_failure" }],
          builtTargets: 0,
          totalTargets: 0,
          processedPresets: 0,
          totalPresets: 0,
        };

        this.displayBuildFailure(error);
        this.closeEmitter.fire(1);
      }
    } catch (error) {
      const errorMessage = `Error: ${error.message}`;
      this.writeEmitter.fire(`\r\n\x1b[31m${errorMessage}\x1b[0m\r\n`);
      this.closeEmitter.fire(1);
    }
  }

  /**
   * Closes the terminal
   */
  async close() {
    this.isActive = false;
  }

  /**
   * Handles input - closes terminal if build is complete
   */
  handleInput(data) {
    // If build is complete, any keypress closes the terminal
    if (this.buildComplete) {
      this.closeEmitter.fire(0);
      return;
    }
    // During active build, ignore input to prevent accidental closure
  }

  /**
   * Sets terminal dimensions (not critical for build)
   */
  setDimensions(dimensions) {
    // Terminal dimensions don't affect build output
  }

  /**
   * Replacement for outputChannel.appendLine() - writes to terminal
   * @param {string} message - Message to write
   */
  appendLine(message) {
    if (this.isActive) {
      // Convert message to terminal format with proper line endings
      const terminalMessage = message.replace(/\n/g, "\r\n");
      this.writeEmitter.fire(`${terminalMessage}\r\n`);
    }
  }

  /**
   * Replacement for outputChannel.show() - no-op for terminals
   */
  show() {
    // Terminals are already visible when created, so this is a no-op
  }

  /**
   * Writes raw data to terminal with proper formatting
   * @param {string} data - Raw data to write
   * @param {string} color - Optional ANSI color code
   */
  writeRaw(data, color = null) {
    if (this.isActive) {
      const output = data.toString();
      const terminalOutput = output.replace(/\n/g, "\r\n");

      if (color) {
        this.writeEmitter.fire(`${color}${terminalOutput}\x1b[0m`);
      } else {
        this.writeEmitter.fire(terminalOutput);
      }
    }
  }

  /**
   * Displays enhanced build completion summary with error details
   * @param {Object} results - Build results from buildFuzzingTargetsOnly
   * @param {string} duration - Build duration in seconds
   */
  displayBuildCompletionSummary(results, duration) {
    const hasErrors = results.errors.length > 0;
    const hasBuiltTargets = results.builtTargets > 0;

    // Display main completion header
    if (hasErrors && hasBuiltTargets) {
      this.writeEmitter.fire(
        `\r\n\x1b[33m╭─ BUILD COMPLETED WITH WARNINGS ─╮\x1b[0m\r\n`,
      );
      this.writeEmitter.fire(
        `\x1b[33m│ ${results.builtTargets} target(s) built, ${results.errors.length} error(s)\x1b[0m\r\n`,
      );
    } else if (hasErrors && !hasBuiltTargets) {
      this.writeEmitter.fire(`\r\n\x1b[31m╭─ BUILD FAILED ─╮\x1b[0m\r\n`);
      this.writeEmitter.fire(
        `\x1b[31m│ No targets built, ${results.errors.length} error(s)\x1b[0m\r\n`,
      );
    } else {
      this.writeEmitter.fire(`\r\n\x1b[32m╭─ BUILD SUCCESSFUL ─╮\x1b[0m\r\n`);
      this.writeEmitter.fire(
        `\x1b[32m│ ${results.builtTargets} target(s) built successfully\x1b[0m\r\n`,
      );
    }

    this.writeEmitter.fire(`\x1b[36m│ Duration: ${duration}s\x1b[0m\r\n`);
    this.writeEmitter.fire(
      `\x1b[36m│ Presets: ${results.processedPresets}/${results.totalPresets}\x1b[0m\r\n`,
    );
    this.writeEmitter.fire(
      `\x1b[36m╰─────────────────────────────╯\x1b[0m\r\n`,
    );

    // Display successful builds
    if (results.builtFuzzers && results.builtFuzzers.length > 0) {
      this.writeEmitter.fire(
        `\r\n\x1b[32m✅ Successfully Built Targets:\x1b[0m\r\n`,
      );
      results.builtFuzzers.forEach((fuzzer) => {
        this.writeEmitter.fire(
          `\x1b[32m  • ${fuzzer.name} (${fuzzer.preset})\x1b[0m\r\n`,
        );
      });
    }

    // Display detailed error information
    if (hasErrors) {
      this.writeEmitter.fire(`\r\n\x1b[31m❌ Build Errors Summary:\x1b[0m\r\n`);

      results.errors.forEach((error, index) => {
        this.writeEmitter.fire(
          `\r\n\x1b[31m${index + 1}. Preset: ${error.preset}\x1b[0m\r\n`,
        );
        this.writeEmitter.fire(`\x1b[31m   Error: ${error.error}\x1b[0m\r\n`);

        if (error.buildErrors && error.buildErrors.length > 0) {
          this.writeEmitter.fire(
            `\x1b[33m   Failed Targets: ${error.failedTargets.join(", ")}\x1b[0m\r\n`,
          );

          // Show troubleshooting hint
          const fuzzTargetBuilder = require("./fuzzTargetBuilder");
          const commonErrors = error.buildErrors
            .map((be) => be.error)
            .join(" ");
          const hint =
            fuzzTargetBuilder.generateTroubleshootingHint(commonErrors);
          if (hint) {
            this.writeEmitter.fire(`\x1b[93m   💡 Hint: ${hint}\x1b[0m\r\n`);
          }
        }
      });
    }
  }

  /**
   * Displays build failure with enhanced error information
   * @param {Error} error - The build failure error
   */
  displayBuildFailure(error) {
    this.writeEmitter.fire(
      `\r\n\x1b[31m╭─ CRITICAL BUILD FAILURE ─╮\x1b[0m\r\n`,
    );
    this.writeEmitter.fire(
      `\x1b[31m│ Build process failed to complete\x1b[0m\r\n`,
    );
    this.writeEmitter.fire(
      `\x1b[31m╰─────────────────────────────╯\x1b[0m\r\n`,
    );

    this.writeEmitter.fire(`\r\n\x1b[31m❌ Error Details:\x1b[0m\r\n`);
    this.writeEmitter.fire(`\x1b[31m${error.message}\x1b[0m\r\n`);

    if (error.stack) {
      this.writeEmitter.fire(`\r\n\x1b[37m📋 Stack Trace:\x1b[0m\r\n`);
      this.writeEmitter.fire(`\x1b[37m${error.stack}\x1b[0m\r\n`);
    }

    // Add troubleshooting suggestions for critical failures
    this.writeEmitter.fire(`\r\n\x1b[93m🔧 Troubleshooting Steps:\x1b[0m\r\n`);
    this.writeEmitter.fire(
      `\x1b[93m  • Check Docker is running and accessible\x1b[0m\r\n`,
    );
    this.writeEmitter.fire(
      `\x1b[93m  • Verify workspace has .codeforge directory\x1b[0m\r\n`,
    );
    this.writeEmitter.fire(
      `\x1b[93m  • Ensure CMakePresets.json exists and is valid\x1b[0m\r\n`,
    );
    this.writeEmitter.fire(
      `\x1b[93m  • Try reinitializing the CodeForge project\x1b[0m\r\n`,
    );
  }
}

module.exports = {
  CodeForgeFuzzingTerminal,
  CodeForgeBuildTerminal,
};
