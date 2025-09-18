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

module.exports = {
  CodeForgeFuzzingTerminal,
};
