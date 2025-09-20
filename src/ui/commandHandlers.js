const vscode = require("vscode");
const dockerOperations = require("../core/dockerOperations");
const fuzzingOperations = require("../fuzzing/fuzzingOperations");
const { CodeForgeFuzzingTerminal } = require("../fuzzing/fuzzingTerminal");
const { CrashDiscoveryService } = require("../fuzzing/crashDiscoveryService");
const { HexDocumentProvider } = require("./hexDocumentProvider");
const fs = require("fs").promises;
const path = require("path");

// Embedded Dockerfile content
const DOCKERFILE_CONTENT = `# specify the base image (latest ubuntu lts release as of Oct 2024)
FROM ubuntu:24.04

# remove pre-installed 'ubuntu' user
RUN touch /var/mail/ubuntu && chown ubuntu /var/mail/ubuntu && userdel -r ubuntu

# Installing certain packages requires timezone and insists on requesting user input
#  These settings ensure that package installation is hands-off
ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

# Install development packages
RUN apt-get update
RUN apt-get install -y --no-install-recommends \\
    sudo \\
    build-essential \\
    gcc-arm-none-eabi \\
    git \\
    tzdata \\
    gcovr \\
    meld \\
    cpputest \\
    pkg-config \\
    cmake \\
    sloccount \\
    cppcheck cppcheck-gui \\
    clang clang-tidy clang-format libclang-rt-18-dev gdb \\
    gdbserver \\
    ninja-build \\
    just \\
    python3-pip


#################
# Fix file ownership and permissions issues between WSL and Devcontainer
#   See this video (minute 13) for more info: https://www.youtube.com/watch?v=F6PiU-SSRWs
#   That video's exact suggestions didn't work:
#      RUN groupadd --gid 1000 vscode && \\
#         useradd --uid 1000 --gid 1000 -G plugdev,dialout --shell /bin/bash -m vscode && \\
#         echo "vscode ALL=(ALL:ALL) NOPASSWD:ALL" > /etc/sudoers.d/vscode
#   But, creating a user in the container that matches the user in WSL works well.
# After creating that user, run as that user in the container by default, instead of root
#################
ARG USERNAME
ARG USERID
RUN groupadd --gid $USERID $USERNAME && \\
    useradd --gid $USERID -u $USERID -G plugdev,dialout --shell /bin/bash -m $USERNAME && \\
    mkdir -p /etc/sudoers.d && \\
    echo "$USERNAME ALL=(ALL:ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME

USER $USERNAME
`;

/**
 * Command Handlers for CodeForge Extension
 * Provides centralized command handling with proper error handling and user feedback
 */
class CodeForgeCommandHandlers {
  constructor(context, outputChannel, containerTreeProvider, webviewProvider) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.containerTreeProvider = containerTreeProvider;
    this.webviewProvider = webviewProvider;
    this.crashDiscoveryService = new CrashDiscoveryService();
  }

  /**
   * Safe wrapper for output channel operations
   */
  safeOutputLog(message, show = false) {
    try {
      if (this.outputChannel) {
        this.outputChannel.appendLine(message);
        if (show) {
          this.outputChannel.show();
        }
      }
    } catch (error) {
      // Silently ignore if output channel is disposed
      console.log(`CodeForge: ${message}`);
    }
  }

  /**
   * Get workspace folder and path with validation
   */
  getWorkspaceInfo() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("CodeForge: No workspace folder is open");
      throw new Error("No workspace folder is open");
    }
    return {
      folder: workspaceFolder,
      path: workspaceFolder.uri.fsPath,
    };
  }

  /**
   * Ensures that CodeForge is initialized and the Docker image is built
   */
  async ensureInitializedAndBuilt(workspacePath, containerName) {
    try {
      const dockerfilePath = path.join(
        workspacePath,
        ".codeforge",
        "Dockerfile",
      );

      // Check if Dockerfile exists
      let dockerfileExists = false;
      try {
        await fs.access(dockerfilePath);
        dockerfileExists = true;
      } catch (error) {
        dockerfileExists = false;
      }

      // If Dockerfile doesn't exist, automatically initialize
      if (!dockerfileExists) {
        this.safeOutputLog(
          "CodeForge: Dockerfile not found. Automatically initializing...",
          true,
        );

        // Create .codeforge directory
        const codeforgeDir = path.join(workspacePath, ".codeforge");
        await fs.mkdir(codeforgeDir, { recursive: true });
        this.outputChannel.appendLine(`Created directory: ${codeforgeDir}`);

        // Write Dockerfile
        await fs.writeFile(dockerfilePath, DOCKERFILE_CONTENT);
        this.outputChannel.appendLine(`Created Dockerfile: ${dockerfilePath}`);

        vscode.window.showInformationMessage(
          "CodeForge: Automatically initialized .codeforge directory",
        );
      }

      // Check if Docker image exists
      const imageExists =
        await dockerOperations.checkImageExists(containerName);

      // If image doesn't exist, automatically build it
      if (!imageExists) {
        this.safeOutputLog(
          `CodeForge: Docker image not found. Automatically building ${containerName}...`,
          true,
        );

        // Show progress notification
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "CodeForge: Automatically building Docker environment...",
            cancellable: false,
          },
          async (progress) => {
            try {
              // Build the Docker image
              await dockerOperations.buildDockerImage(
                workspacePath,
                containerName,
              );
              this.outputChannel.appendLine(
                `Successfully built Docker image: ${containerName}`,
              );
              vscode.window.showInformationMessage(
                `CodeForge: Automatically built Docker image ${containerName}`,
              );
            } catch (error) {
              throw error;
            }
          },
        );

        // Verify the image was built successfully
        const imageExistsAfterBuild =
          await dockerOperations.checkImageExists(containerName);
        if (!imageExistsAfterBuild) {
          this.outputChannel.appendLine("Error: Docker image build failed");
          vscode.window.showErrorMessage(
            "CodeForge: Failed to build Docker image automatically",
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      this.outputChannel.appendLine(
        `Error in ensureInitializedAndBuilt: ${error.message}`,
      );
      // Don't automatically show output window - users can access it manually
      vscode.window.showErrorMessage(
        `CodeForge: Failed to initialize/build automatically - ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Launch terminal in container
   */
  async handleLaunchTerminal() {
    try {
      const { path: workspacePath } = this.getWorkspaceInfo();
      const containerName =
        dockerOperations.generateContainerName(workspacePath);

      // Auto-initialize and build if needed
      const initialized = await this.ensureInitializedAndBuilt(
        workspacePath,
        containerName,
      );
      if (!initialized) {
        return;
      }

      // Get configuration
      const config = vscode.workspace.getConfiguration("codeforge");
      const dockerCommand = config.get("dockerCommand", "docker");
      const removeAfterRun = config.get("removeContainersAfterRun", true);
      const defaultShell = config.get("defaultShell", "/bin/bash");
      const additionalArgs = config.get("additionalDockerRunArgs", []);
      const mountWorkspace = config.get("mountWorkspace", true);

      // Use dockerOperations to generate Docker run arguments
      const options = {
        interactive: true,
        tty: true,
        removeAfterRun: removeAfterRun,
        mountWorkspace: mountWorkspace,
        workingDir: workspacePath,
        additionalArgs: additionalArgs,
        shell: defaultShell,
        enableTracking: true, // Always enable tracking for terminals
        containerType: "terminal",
      };

      const shellArgs = dockerOperations.generateDockerRunArgs(
        workspacePath,
        containerName,
        options,
      );

      const terminal = vscode.window.createTerminal({
        name: `CodeForge: ${path.basename(workspacePath)}`,
        shellPath: dockerCommand,
        shellArgs: shellArgs,
      });

      terminal.show();

      // Track the container after it's launched
      const generatedName = options.generatedContainerName;
      if (generatedName) {
        // Always attempt to track, even with auto-remove (for the duration it's running)
        dockerOperations
          .trackLaunchedContainer(
            generatedName,
            workspacePath,
            containerName,
            "terminal",
          )
          .then((tracked) => {
            if (tracked) {
              this.safeOutputLog(
                `Launched and tracked terminal container: ${generatedName}`,
              );
              vscode.window.showInformationMessage(
                `CodeForge: Terminal container started and tracked: ${generatedName}`,
              );
            } else {
              this.safeOutputLog(
                `Launched terminal but could not track container: ${generatedName}`,
              );
              if (!removeAfterRun) {
                vscode.window.showWarningMessage(
                  `CodeForge: Terminal started but container tracking failed. Container may not appear in active list.`,
                );
              }
            }
            // Update webview state
            this.updateWebviewState();
          })
          .catch((error) => {
            this.safeOutputLog(
              `Error tracking terminal container: ${error.message}`,
            );
          });
      } else {
        this.safeOutputLog(
          `Launched terminal in container: ${containerName} (no container name generated)`,
        );
      }
    } catch (error) {
      this.safeOutputLog(`Error: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to launch terminal - ${error.message}`,
      );
    }
  }

  /**
   * Run fuzzing tests
   */
  async handleRunFuzzing() {
    try {
      const { path: workspacePath } = this.getWorkspaceInfo();

      // Auto-initialize and build if needed
      const containerName =
        dockerOperations.generateContainerName(workspacePath);
      const initialized = await this.ensureInitializedAndBuilt(
        workspacePath,
        containerName,
      );
      if (!initialized) {
        return;
      }

      // Create a unique terminal name with timestamp
      const timestamp = new Date().toLocaleTimeString();
      const terminalName = `CodeForge Fuzzing: ${timestamp}`;

      // Create the fuzzing terminal
      const fuzzingTerminal = new CodeForgeFuzzingTerminal(workspacePath);

      // Create the VSCode terminal with our custom implementation
      const terminal = vscode.window.createTerminal({
        name: terminalName,
        pty: fuzzingTerminal,
        scrollback: 3000, // Double the default scrollback (1000 -> 3000) for fuzzing output history
      });

      // Show the terminal immediately
      terminal.show();

      // Show brief notification that fuzzing has started
      vscode.window.showInformationMessage(
        "CodeForge: Fuzzing tests started in terminal",
        { modal: false },
      );
    } catch (error) {
      this.safeOutputLog(`Fuzzing failed: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Fuzzing failed - ${error.message}`,
      );
    }
  }

  /**
   * Refresh container list
   */
  async handleRefreshContainers() {
    try {
      console.log("CodeForge: handleRefreshContainers called");
      this.safeOutputLog("CodeForge: Refresh containers command triggered");

      // Debug provider state
      this.safeOutputLog(
        `CodeForge: containerTreeProvider exists: ${!!this.containerTreeProvider}`,
      );
      this.safeOutputLog(
        `CodeForge: containerTreeProvider type: ${typeof this.containerTreeProvider}`,
      );

      if (this.containerTreeProvider) {
        this.safeOutputLog(
          `CodeForge: containerTreeProvider methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(this.containerTreeProvider)).join(", ")}`,
        );
      }

      // Check if container tree provider is available
      if (!this.containerTreeProvider) {
        console.error("CodeForge: Container tree provider not found!");
        this.safeOutputLog(
          "CRITICAL: Container tree provider not found - extension may not have initialized properly",
          true,
        );
        this.safeOutputLog(
          "This indicates that the extension activation failed or the provider registration failed",
          true,
        );

        // Try to provide helpful guidance
        const action = await vscode.window.showErrorMessage(
          "CodeForge: Container tree provider not initialized. This may be due to an extension startup issue.",
          "Reload Window",
          "Check Output",
          "Show Logs",
        );

        if (action === "Reload Window") {
          this.safeOutputLog("User chose to reload window");
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        } else if (action === "Check Output") {
          this.safeOutputLog("User chose to check output");
          this.safeOutputLog("", true); // Show output channel
        } else if (action === "Show Logs") {
          this.safeOutputLog("User chose to show logs");
          vscode.commands.executeCommand("workbench.action.showLogs");
        }
        return;
      }

      console.log(
        "CodeForge: Container tree provider found, calling refresh...",
      );
      this.safeOutputLog(
        "CodeForge: ✓ Container tree provider found, proceeding with refresh...",
      );

      // Refresh the container tree provider
      await this.containerTreeProvider.refresh();
      this.safeOutputLog(
        "CodeForge: ✓ Container tree provider refresh completed",
      );

      // Update webview state
      this.updateWebviewState();
      this.safeOutputLog("CodeForge: ✓ Webview state updated");

      vscode.window.showInformationMessage(
        "CodeForge: Container list refreshed",
      );
      console.log("CodeForge: Container refresh completed successfully");
      this.safeOutputLog(
        "CodeForge: ✓ Container refresh operation completed successfully",
      );
    } catch (error) {
      console.error("CodeForge: Error in handleRefreshContainers:", error);
      this.safeOutputLog(
        `CRITICAL: Error refreshing containers: ${error.message}`,
        true,
      );
      this.safeOutputLog(`Error stack: ${error.stack}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to refresh containers - ${error.message}`,
      );
    }
  }

  /**
   * Refresh crash data
   */
  async handleRefreshCrashes() {
    try {
      const { path: workspacePath } = this.getWorkspaceInfo();

      // Set loading state
      if (this.webviewProvider) {
        this.webviewProvider._setCrashLoading(true);
      }

      // Discover crashes
      const crashData =
        await this.crashDiscoveryService.discoverCrashes(workspacePath);

      // Update state
      if (this.webviewProvider) {
        this.webviewProvider._updateCrashState({
          data: crashData,
          lastUpdated: new Date().toISOString(),
          isLoading: false,
          error: null,
        });
      }

      const totalCrashes = crashData.reduce(
        (sum, fuzzer) => sum + fuzzer.crashes.length,
        0,
      );
      this.safeOutputLog(
        `Found ${crashData.length} fuzzer(s) with ${totalCrashes} total crashes`,
      );

      if (totalCrashes > 0) {
        vscode.window.showInformationMessage(
          `CodeForge: Found ${totalCrashes} crash${totalCrashes === 1 ? "" : "es"} across ${crashData.length} fuzzer${crashData.length === 1 ? "" : "s"}`,
        );
      }
    } catch (error) {
      if (this.webviewProvider) {
        this.webviewProvider._setCrashLoading(false, error.message);
      }
      this.safeOutputLog(`Error refreshing crashes: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to refresh crashes - ${error.message}`,
      );
    }
  }

  /**
   * Generate hex dump content for binary files
   * @param {string} filePath - Path to the file to dump
   * @param {number} maxSize - Maximum size to read (default 64KB)
   * @returns {Promise<string>} Hex dump content
   */
  async generateHexDump(filePath, maxSize = 1024 * 64) {
    try {
      const buffer = await fs.readFile(filePath);
      const truncated = buffer.length > maxSize;
      const data = truncated ? buffer.slice(0, maxSize) : buffer;

      let hexDump = `Hex View: ${path.basename(filePath)}\n`;
      hexDump += `File Size: ${buffer.length} bytes${truncated ? " (truncated to first 64KB)" : ""}\n`;
      hexDump += `Path: ${filePath}\n`;
      hexDump += `Generated: ${new Date().toISOString()}\n\n`;

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

      if (truncated) {
        hexDump += `\n... (file truncated at ${maxSize} bytes)\n`;
        hexDump += `Total file size: ${buffer.length} bytes\n`;
      }

      return hexDump;
    } catch (error) {
      throw new Error(`Failed to generate hex dump: ${error.message}`);
    }
  }

  /**
   * View crash file using read-only hex document provider
   */
  async handleViewCrash(params) {
    try {
      const { crashId, filePath } = params;

      if (!filePath) {
        throw new Error("Crash file path not provided");
      }

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(`Crash file not found: ${filePath}`);
      }

      // Get file stats for size information
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      // Log file information
      this.safeOutputLog(
        `Opening crash file: ${crashId} (${path.basename(filePath)}, ${fileSize} bytes)`,
      );

      // Check file size limit (1MB max with user warning)
      const maxFileSize = 1024 * 1024; // 1MB
      if (fileSize > maxFileSize) {
        const action = await vscode.window.showWarningMessage(
          `CodeForge: Crash file is large (${Math.round((fileSize / 1024 / 1024) * 100) / 100}MB). This may take a moment to process and will be truncated to the first 64KB.`,
          { modal: false },
          "Continue",
          "Cancel",
        );

        if (action !== "Continue") {
          this.safeOutputLog(
            `User cancelled viewing large crash file: ${crashId}`,
          );
          return;
        }
      }

      // Create virtual URI for the read-only hex document
      const hexUri = HexDocumentProvider.createHexUri(filePath, crashId);

      this.safeOutputLog(
        `Opening read-only hex document for crash file: ${crashId}`,
      );

      // Open the virtual document using the hex document provider
      const document = await vscode.workspace.openTextDocument(hexUri);

      // Show the document in read-only mode
      const editor = await vscode.window.showTextDocument(document, {
        preview: false,
        preserveFocus: false,
        viewColumn: vscode.ViewColumn.Active,
      });

      // Move cursor to the start of actual hex content (after the header)
      if (editor) {
        // Position after the header comments (around line 8-10)
        const startOfHexContent = new vscode.Position(8, 0);
        editor.selection = new vscode.Selection(
          startOfHexContent,
          startOfHexContent,
        );
        editor.revealRange(
          new vscode.Range(startOfHexContent, startOfHexContent),
        );
      }

      this.safeOutputLog(
        `Opened crash file with read-only hex viewer: ${crashId}`,
      );

      // Show success message
      vscode.window.showInformationMessage(
        `CodeForge: Crash file ${crashId} opened in read-only hex view`,
        { modal: false },
      );
    } catch (error) {
      this.safeOutputLog(`Error viewing crash: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to open crash file - ${error.message}`,
      );
    }
  }

  /**
   * Analyze crash (placeholder for future implementation)
   */
  async handleAnalyzeCrash(params) {
    try {
      const { crashId, fuzzerName, filePath } = params;

      // Future: Integration with debugging tools, crash analysis, etc.
      this.safeOutputLog(
        `Crash analysis requested for ${crashId} from ${fuzzerName}`,
      );

      vscode.window
        .showInformationMessage(
          `CodeForge: Crash analysis for ${crashId} from ${fuzzerName} - Feature coming soon!`,
          "View File",
        )
        .then((selection) => {
          if (selection === "View File") {
            this.handleViewCrash({ crashId, filePath });
          }
        });
    } catch (error) {
      this.safeOutputLog(`Error analyzing crash: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to analyze crash - ${error.message}`,
      );
    }
  }

  /**
   * Clear crashes for a fuzzer
   */
  async handleClearCrashes(params) {
    try {
      const { fuzzerName } = params;
      const { path: workspacePath } = this.getWorkspaceInfo();

      if (!fuzzerName) {
        throw new Error("Fuzzer name not provided");
      }

      // Find the fuzzer output directory
      const fuzzingDir = path.join(workspacePath, ".codeforge", "fuzzing");
      const fuzzerOutputDir = path.join(
        fuzzingDir,
        `codeforge-${fuzzerName}-fuzz-output`,
      );
      const corpusDir = path.join(fuzzerOutputDir, "corpus");

      try {
        await fs.access(corpusDir);
      } catch (error) {
        // No corpus directory - nothing to clear
        vscode.window.showInformationMessage(
          `CodeForge: No crashes found for ${fuzzerName}`,
        );
        return;
      }

      // Find and delete crash files
      const entries = await fs.readdir(corpusDir, { withFileTypes: true });
      const crashFiles = entries
        .filter((entry) => entry.isFile() && entry.name.startsWith("crash-"))
        .map((entry) => path.join(corpusDir, entry.name));

      if (crashFiles.length === 0) {
        vscode.window.showInformationMessage(
          `CodeForge: No crashes found for ${fuzzerName}`,
        );
        return;
      }

      // Delete crash files
      let deletedCount = 0;
      for (const crashFile of crashFiles) {
        try {
          await fs.unlink(crashFile);
          deletedCount++;
        } catch (error) {
          this.safeOutputLog(
            `Warning: Failed to delete ${crashFile}: ${error.message}`,
          );
        }
      }

      this.safeOutputLog(
        `Cleared ${deletedCount} crash files for ${fuzzerName}`,
      );
      vscode.window.showInformationMessage(
        `CodeForge: Cleared ${deletedCount} crash${deletedCount === 1 ? "" : "es"} for ${fuzzerName}`,
      );

      // Refresh crash data
      await this.handleRefreshCrashes();
    } catch (error) {
      this.safeOutputLog(`Error clearing crashes: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to clear crashes - ${error.message}`,
      );
    }
  }

  /**
   * Update webview state if available
   */
  updateWebviewState() {
    // Status detection functionality removed
    // Webview no longer tracks project status
  }

  /**
   * Get all command handlers as a map
   */
  getCommandHandlers() {
    return {
      "codeforge.launchTerminal": this.handleLaunchTerminal.bind(this),
      "codeforge.runFuzzingTests": this.handleRunFuzzing.bind(this),
      "codeforge.refreshContainers": this.handleRefreshContainers.bind(this),
      "codeforge.refreshCrashes": this.handleRefreshCrashes.bind(this),
      "codeforge.viewCrash": this.handleViewCrash.bind(this),
      "codeforge.analyzeCrash": this.handleAnalyzeCrash.bind(this),
      "codeforge.clearCrashes": this.handleClearCrashes.bind(this),
    };
  }
}

module.exports = { CodeForgeCommandHandlers };
