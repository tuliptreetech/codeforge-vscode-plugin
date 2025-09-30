const vscode = require("vscode");
const dockerOperations = require("../core/dockerOperations");
const fuzzingOperations = require("../fuzzing/fuzzingOperations");
const {
  CodeForgeFuzzingTerminal,
  CodeForgeBuildTerminal,
} = require("../fuzzing/fuzzingTerminal");
const { FuzzerDiscoveryService } = require("../fuzzing/fuzzerDiscoveryService");
const { GdbIntegration } = require("../fuzzing/gdbIntegration");
const { HexDocumentProvider } = require("./hexDocumentProvider");
const {
  InitializationDetectionService,
} = require("../core/initializationDetectionService");
const fs = require("fs").promises;
const path = require("path");

/**
 * Command Handlers for CodeForge Extension
 * Provides centralized command handling with proper error handling and user feedback
 */
class CodeForgeCommandHandlers {
  constructor(
    context,
    outputChannel,
    containerTreeProvider,
    webviewProvider,
    resourceManager,
  ) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.containerTreeProvider = containerTreeProvider;
    this.webviewProvider = webviewProvider;
    this.resourceManager = resourceManager;
    this.fuzzerDiscoveryService = new FuzzerDiscoveryService();
    this.gdbIntegration = new GdbIntegration(dockerOperations);
    this.initializationService = new InitializationDetectionService(
      resourceManager,
    );
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
   * Now requires user permission for initialization
   */
  async ensureInitializedAndBuilt(workspacePath, containerName) {
    try {
      // Check if project is initialized using the initialization service
      const initializationResult =
        await this.initializationService.isCodeForgeInitialized(workspacePath);

      if (!initializationResult.isInitialized) {
        // Project is not initialized - ask user for permission
        const action = await vscode.window.showInformationMessage(
          "CodeForge: This project is not initialized. Would you like to initialize it now?",
          { modal: true },
          "Initialize Now",
          "Cancel",
        );

        if (action !== "Initialize Now") {
          this.safeOutputLog(
            "User cancelled initialization - operation aborted",
          );
          return false;
        }

        // User agreed to initialize - call the initialization handler
        this.safeOutputLog(
          "User requested initialization - proceeding...",
          true,
        );

        try {
          // Use the existing initialization handler which provides progress feedback
          await this.handleInitializeProject();

          // Verify initialization was successful
          const nowInitializedResult =
            await this.initializationService.isCodeForgeInitialized(
              workspacePath,
            );
          if (!nowInitializedResult.isInitialized) {
            throw new Error(
              "Initialization completed but project still appears uninitialized",
            );
          }

          this.safeOutputLog("Project initialization completed successfully");
        } catch (error) {
          this.safeOutputLog(`Initialization failed: ${error.message}`, true);
          vscode.window.showErrorMessage(
            `CodeForge: Failed to initialize project - ${error.message}`,
          );
          return false;
        }
      }

      // Check if Docker image exists
      const imageExists =
        await dockerOperations.checkImageExists(containerName);

      // If image doesn't exist, ask user permission to build it
      if (!imageExists) {
        const buildAction = await vscode.window.showInformationMessage(
          `CodeForge: Docker image '${containerName}' not found. Would you like to build it now?`,
          { modal: true },
          "Build Now",
          "Cancel",
        );

        if (buildAction !== "Build Now") {
          this.safeOutputLog(
            "User cancelled Docker image build - operation aborted",
          );
          return false;
        }

        this.safeOutputLog(
          `CodeForge: User requested Docker image build for ${containerName}...`,
          true,
        );

        // Show progress notification
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "CodeForge: Building Docker environment...",
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
            "CodeForge: Failed to build Docker image",
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      this.outputChannel.appendLine(
        `Error in ensureInitializedAndBuilt: ${error.message}`,
      );
      vscode.window.showErrorMessage(
        `CodeForge: Failed to ensure initialization/build - ${error.message}`,
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

      // Check initialization and build status
      const initialized = await this.ensureInitializedAndBuilt(
        workspacePath,
        containerName,
      );
      if (!initialized) {
        vscode.window.showInformationMessage(
          "CodeForge: Terminal launch cancelled - project initialization required",
        );
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

      // Check initialization and build status
      const containerName =
        dockerOperations.generateContainerName(workspacePath);
      const initialized = await this.ensureInitializedAndBuilt(
        workspacePath,
        containerName,
      );
      if (!initialized) {
        vscode.window.showInformationMessage(
          "CodeForge: Fuzzing cancelled - project initialization and Docker build required",
        );
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
    } catch (error) {
      this.safeOutputLog(`Fuzzing failed: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Fuzzing failed - ${error.message}`,
      );
    }
  }

  /**
   * Build fuzzing targets only (without running fuzzers)
   */
  async handleBuildFuzzTargets() {
    try {
      const { path: workspacePath } = this.getWorkspaceInfo();

      // Check initialization and build status
      const containerName =
        dockerOperations.generateContainerName(workspacePath);
      const initialized = await this.ensureInitializedAndBuilt(
        workspacePath,
        containerName,
      );
      if (!initialized) {
        vscode.window.showInformationMessage(
          "CodeForge: Build cancelled - project initialization and Docker build required",
        );
        return;
      }

      // Show initial progress notification
      vscode.window.showInformationMessage(
        "CodeForge: Starting fuzzing build process...",
        { modal: false },
      );

      // Create a unique terminal name with timestamp
      const timestamp = new Date().toLocaleTimeString();
      const terminalName = `CodeForge Build: ${timestamp}`;

      // Create the build terminal with enhanced error handling
      const buildTerminal = new CodeForgeBuildTerminal(workspacePath);

      // Set up build completion monitoring for user notifications
      this.setupBuildNotifications(buildTerminal);

      // Create the VSCode terminal with our custom implementation
      const terminal = vscode.window.createTerminal({
        name: terminalName,
        pty: buildTerminal,
        scrollback: 3000, // Double the default scrollback (1000 -> 3000) for build output history
      });

      // Show the terminal immediately
      terminal.show();
    } catch (error) {
      this.safeOutputLog(`Fuzzing build failed: ${error.message}`, false);

      // Enhanced error notification with actionable information
      const errorMessage = this.generateUserFriendlyErrorMessage(error);
      const actions = this.getBuildErrorActions(error);

      const errorPromise = vscode.window.showErrorMessage(
        `CodeForge: ${errorMessage}`,
        ...actions,
      );

      if (errorPromise && typeof errorPromise.then === "function") {
        errorPromise
          .then((selectedAction) => {
            if (selectedAction) {
              this.handleBuildErrorAction(selectedAction, error);
            }
          })
          .catch((err) => {
            console.error("Error handling build error action:", err);
          });
      }
    }
  }

  /**
   * Sets up build completion notifications
   * @param {CodeForgeBuildTerminal} buildTerminal - The build terminal instance
   */
  setupBuildNotifications(buildTerminal) {
    // Monitor build completion through terminal events
    const originalClose = buildTerminal.close.bind(buildTerminal);
    buildTerminal.close = async function () {
      // Check if build completed successfully or with errors
      if (this.buildResults) {
        const results = this.buildResults;

        if (results.errors && results.errors.length > 0) {
          if (results.builtTargets > 0) {
            // Partial success
            vscode.window
              .showWarningMessage(
                `CodeForge: Build completed with warnings. ${results.builtTargets} target(s) built, ${results.errors.length} error(s).`,
                "View Details",
                "Retry Build",
              )
              .then((action) => {
                if (action === "Retry Build") {
                  vscode.commands.executeCommand("codeforge.buildFuzzTargets");
                }
              });
          } else {
            // Complete failure
            vscode.window
              .showErrorMessage(
                `CodeForge: Build failed. No targets were built. ${results.errors.length} error(s) encountered.`,
                "View Details",
                "Troubleshoot",
                "Retry Build",
              )
              .then((action) => {
                if (action === "Retry Build") {
                  vscode.commands.executeCommand("codeforge.buildFuzzTargets");
                } else if (action === "Troubleshoot") {
                  vscode.window.showInformationMessage(
                    "Common build issues:\n• Check CMakePresets.json configuration\n• Verify dependencies are installed\n• Ensure Docker container has required tools\n• Try cleaning build directories",
                    { modal: true },
                  );
                }
              });
          }
        } else if (results.builtTargets > 0) {
          // Complete success
          vscode.window
            .showInformationMessage(
              `CodeForge: Build successful! ${results.builtTargets} fuzz target(s) built and ready for fuzzing.`,
              "Start Fuzzing",
            )
            .then((action) => {
              if (action === "Start Fuzzing") {
                vscode.commands.executeCommand("codeforge.startFuzzing");
              }
            });
        }
      }

      return originalClose();
    };
  }

  /**
   * Generates user-friendly error messages from technical errors
   * @param {Error} error - The technical error
   * @returns {string} User-friendly error message
   */
  generateUserFriendlyErrorMessage(error) {
    const message = error.message.toLowerCase();

    if (message.includes("docker")) {
      return "Docker connection failed. Please ensure Docker is running.";
    }

    if (message.includes("cmake")) {
      return "CMake configuration error. Check your CMakePresets.json file.";
    }

    if (message.includes("permission")) {
      return "Permission denied. Check file and directory permissions.";
    }

    if (message.includes("not found") || message.includes("no such file")) {
      return "Required files or dependencies not found.";
    }

    return `Build initialization failed: ${error.message}`;
  }

  /**
   * Gets appropriate actions for build errors
   * @param {Error} error - The build error
   * @returns {string[]} Array of action button labels
   */
  getBuildErrorActions(error) {
    const message = error.message.toLowerCase();
    const actions = ["View Logs"];

    // Add specific actions based on error type
    if (error.errorType) {
      switch (error.errorType) {
        case "cmake_preset_error":
        case "cmake_target_error":
        case "cmake_error":
          actions.push("Check CMake Config");
          break;
        case "docker_error":
          actions.push("Check Docker");
          break;
        case "compilation_error":
        case "linker_error":
          actions.push("Troubleshoot");
          break;
        case "permission_error":
          actions.push("Check Docker");
          break;
        case "network_error":
          actions.push("Check Docker");
          break;
      }
    } else {
      // Fallback to message-based detection
      if (message.includes("docker")) {
        actions.push("Check Docker");
      }

      if (message.includes("cmake") || message.includes("preset")) {
        actions.push("Check CMake Config");
      }

      if (
        message.includes("compilation") ||
        message.includes("linker") ||
        message.includes("undefined reference")
      ) {
        actions.push("Troubleshoot");
      }
    }

    // Always add troubleshoot if not already added
    if (!actions.includes("Troubleshoot")) {
      actions.push("Troubleshoot");
    }

    actions.push("Retry");
    return actions;
  }

  /**
   * Handles user actions from build error notifications
   * @param {string} action - The selected action
   * @param {Error} error - The original error
   */
  handleBuildErrorAction(action, error, fuzzerName) {
    switch (action) {
      case "View Logs":
        this.safeOutputLog(
          `Build error details for ${fuzzerName || "fuzzer"}:`,
          true,
        );
        this.safeOutputLog(error.message, true);
        if (error.buildContext && error.buildContext.stderr) {
          this.safeOutputLog("Build output:", true);
          this.safeOutputLog(error.buildContext.stderr, true);
        }
        if (error.stack) {
          this.safeOutputLog("Stack trace:", true);
          this.safeOutputLog(error.stack, true);
        }
        break;
      case "Check Docker":
        vscode.window.showInformationMessage(
          "Docker Troubleshooting:\n• Ensure Docker Desktop is running\n• Check Docker daemon is accessible\n• Verify Docker permissions\n• Try rebuilding the Docker image",
          { modal: true },
        );
        break;
      case "Check CMake Config":
        vscode.window.showInformationMessage(
          "CMake Configuration:\n• Verify CMakePresets.json exists\n• Check preset configurations\n• Ensure all dependencies are specified\n• Verify fuzzer target is defined in CMakeLists.txt",
          { modal: true },
        );
        break;
      case "Retry":
        setTimeout(() => {
          if (fuzzerName) {
            vscode.commands.executeCommand("codeforge.buildFuzzer", {
              fuzzerName,
            });
          } else {
            vscode.commands.executeCommand("codeforge.buildFuzzTargets");
          }
        }, 1000);
        break;
      case "Troubleshoot":
        const troubleshootMessage = this.generateTroubleshootMessage(
          error,
          fuzzerName,
        );
        vscode.window.showInformationMessage(troubleshootMessage, {
          modal: true,
        });
        break;
    }
  }

  /**
   * Generates detailed build error information with user-friendly messages
   * @param {Error} error - The build error
   * @param {string} fuzzerName - Name of the fuzzer that failed to build
   * @returns {Object} Object with message and suggestions
   */
  generateDetailedBuildError(error, fuzzerName) {
    let message = `CodeForge: Failed to build ${fuzzerName}`;
    let suggestions = [];

    // Check if error has enhanced context from buildFuzzTarget
    if (error.suggestions && Array.isArray(error.suggestions)) {
      suggestions = error.suggestions;
    }

    if (error.errorType) {
      switch (error.errorType) {
        case "cmake_preset_error":
          message += " - CMake preset configuration error";
          break;
        case "cmake_target_error":
          message += " - CMake target not found";
          break;
        case "compilation_error":
          message += " - Source code compilation failed";
          break;
        case "linker_error":
          message += " - Linking failed";
          break;
        case "docker_error":
          message += " - Docker container issue";
          break;
        case "permission_error":
          message += " - Permission denied";
          break;
        case "network_error":
          message += " - Network connectivity issue";
          break;
        case "no_targets_built":
          message += " - No build targets found";
          break;
        default:
          message += " - Build process failed";
      }
    }

    // Add specific error details if available
    if (error.buildContext && error.buildContext.stderr) {
      const stderr = error.buildContext.stderr.trim();
      if (stderr && stderr.length < 200) {
        message += `\n\nError details: ${stderr}`;
      }
    }

    // Fallback suggestions if none provided
    if (suggestions.length === 0) {
      suggestions = [
        "Check the Output panel for detailed build logs",
        "Verify the fuzzer name exists in your CMakePresets.json",
        "Ensure Docker container has required build tools",
        "Try cleaning build directories and rebuilding",
      ];
    }

    return { message, suggestions };
  }

  /**
   * Generates troubleshooting message based on error type
   * @param {Error} error - The build error
   * @param {string} fuzzerName - Name of the fuzzer that failed to build
   * @returns {string} Troubleshooting message
   */
  generateTroubleshootMessage(error, fuzzerName) {
    let message = `Troubleshooting ${fuzzerName || "fuzzer"} build failure:\n\n`;

    if (error.errorType) {
      switch (error.errorType) {
        case "cmake_preset_error":
          message += `CMake Preset Issues:
• Check that your CMakePresets.json file exists and is valid
• Verify the preset name matches exactly (case-sensitive)
• Ensure all required variables are defined in the preset
• Try running 'cmake --list-presets' to see available presets`;
          break;
        case "cmake_target_error":
          message += `CMake Target Issues:
• Verify the fuzzer target '${fuzzerName}' is defined in CMakeLists.txt
• Check that the target name matches exactly
• Ensure the target is properly configured for fuzzing
• Try building other targets to isolate the issue`;
          break;
        case "compilation_error":
          message += `Compilation Issues:
• Check for syntax errors in your source code
• Verify all required header files are included
• Ensure compiler flags are correctly set
• Check for missing dependencies or libraries`;
          break;
        case "linker_error":
          message += `Linking Issues:
• Verify all required libraries are available
• Check library paths and linking flags
• Ensure all object files are being linked correctly
• Look for undefined symbol errors`;
          break;
        case "docker_error":
          message += `Docker Issues:
• Ensure Docker is running and accessible
• Verify the Docker image is built and available
• Check container permissions and resource limits
• Try rebuilding the Docker image`;
          break;
        default:
          message += `General Build Issues:
• Check the build output for specific error messages
• Verify all build dependencies are installed
• Try cleaning build directories and rebuilding
• Ensure sufficient disk space and memory`;
      }
    } else {
      message += `General troubleshooting steps:
• Check the Output panel for detailed error logs
• Verify your CMakePresets.json configuration
• Ensure Docker container has required build tools
• Try building with verbose output for more information
• Consider cleaning build directories and rebuilding`;
    }

    return message;
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
  async handleRefreshFuzzers() {
    try {
      const { path: workspacePath } = this.getWorkspaceInfo();

      // Set loading state
      if (this.webviewProvider) {
        this.webviewProvider._setFuzzerLoading(true);
      }

      // Discover fuzzers with associated crashes
      const imageName = dockerOperations.generateContainerName(workspacePath);
      const fuzzerData = await this.fuzzerDiscoveryService.discoverFuzzers(
        workspacePath,
        imageName,
      );

      // Update state
      if (this.webviewProvider) {
        this.webviewProvider._updateFuzzerState({
          data: fuzzerData,
          lastUpdated: new Date().toISOString(),
          isLoading: false,
          error: null,
        });
      }

      const totalCrashes = fuzzerData.reduce(
        (sum, fuzzer) => sum + fuzzer.crashes.length,
        0,
      );
      this.safeOutputLog(
        `Found ${fuzzerData.length} fuzzer(s) with ${totalCrashes} total crashes`,
      );
    } catch (error) {
      if (this.webviewProvider) {
        this.webviewProvider._setFuzzerLoading(false, error.message);
      }
      this.safeOutputLog(`Error refreshing fuzzers: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to refresh fuzzers - ${error.message}`,
      );
    }
  }

  /**
   * Run a specific fuzzer
   */

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
      const { crashId, filePath, fuzzerName } = params;

      if (!filePath) {
        throw new Error("Crash file path not provided");
      }

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(`Crash file not found: ${filePath}`);
      }

      // Get workspace path
      const { path: workspacePath } = this.getWorkspaceInfo();

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

      // Create virtual URI for the read-only hex document with backtrace support
      const hexUri = HexDocumentProvider.createHexUri(
        filePath,
        crashId,
        fuzzerName,
        workspacePath,
      );

      this.safeOutputLog(
        `Opening read-only hex document for crash file: ${crashId}`,
      );

      // Open the virtual document using the hex document provider
      const document = await vscode.workspace.openTextDocument(hexUri);

      // Show document in editor - VSCode will detect ANSI escape codes and render colors
      await vscode.window.showTextDocument(document, {
        preview: true,
        preserveFocus: false,
      });

      this.safeOutputLog(
        `Opened crash file with read-only hex viewer: ${crashId}`,
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
      const { path: workspacePath } = this.getWorkspaceInfo();

      this.safeOutputLog(
        `Starting GDB crash analysis for ${crashId} from ${fuzzerName}`,
      );

      // Validate parameters
      if (!crashId || !fuzzerName || !filePath) {
        throw new Error(
          "Missing required parameters: crashId, fuzzerName, or filePath",
        );
      }

      // Check initialization and build status
      const containerName =
        dockerOperations.generateContainerName(workspacePath);
      const initialized = await this.ensureInitializedAndBuilt(
        workspacePath,
        containerName,
      );
      if (!initialized) {
        vscode.window.showInformationMessage(
          "CodeForge: Crash analysis cancelled - project initialization and Docker build required",
        );
        return;
      }

      // Validate analysis requirements
      const validation = await this.gdbIntegration.validateAnalysisRequirements(
        workspacePath,
        fuzzerName,
        filePath,
      );

      if (!validation.valid) {
        const errorMessage = `Cannot analyze crash: ${validation.issues.join(", ")}`;
        this.safeOutputLog(errorMessage, false);
        vscode.window.showErrorMessage(`CodeForge: ${errorMessage}`);
        return;
      }

      // Perform GDB analysis
      const analysisResult = await this.gdbIntegration.analyzeCrash(
        workspacePath,
        fuzzerName,
        filePath,
        {
          removeAfterRun: true, // Clean up container after analysis
          terminalName: `CodeForge GDB: ${fuzzerName} - ${crashId}`,
        },
      );

      if (!analysisResult.success) {
        throw new Error(analysisResult.error);
      }

      // Create the GDB terminal
      const terminal = vscode.window.createTerminal({
        name: analysisResult.terminalConfig.terminalName,
        shellPath: analysisResult.terminalConfig.shellPath,
        shellArgs: analysisResult.terminalConfig.shellArgs,
      });

      terminal.show();

      // Track the container if needed
      const generatedName =
        analysisResult.terminalConfig.generatedContainerName;
      if (generatedName) {
        dockerOperations
          .trackLaunchedContainer(
            generatedName,
            workspacePath,
            containerName,
            "gdb-analysis",
          )
          .then((tracked) => {
            if (tracked) {
              this.safeOutputLog(
                `Launched and tracked GDB analysis container: ${generatedName}`,
              );
            } else {
              this.safeOutputLog(
                `Launched GDB analysis but could not track container: ${generatedName}`,
              );
            }
            // Update webview state
            this.updateWebviewState();
          })
          .catch((error) => {
            this.safeOutputLog(
              `Error tracking GDB analysis container: ${error.message}`,
            );
          });
      } else {
        this.safeOutputLog(
          `Launched GDB analysis terminal for ${crashId} (no container name generated)`,
        );
      }

      this.safeOutputLog(
        `GDB analysis terminal created successfully for ${crashId} from ${fuzzerName}`,
      );
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

      // Refresh fuzzer data
      await this.handleRefreshFuzzers();
    } catch (error) {
      this.safeOutputLog(`Error clearing crashes: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to clear crashes - ${error.message}`,
      );
    }
  }

  /**
   * Handle project initialization with progress feedback
   */
  async handleInitializeProject() {
    try {
      const { path: workspacePath } = this.getWorkspaceInfo();

      // Show progress notification with detailed feedback
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "CodeForge: Initializing project...",
          cancellable: false,
        },
        async (progress, token) => {
          // Progress callback to update the notification
          const progressCallback = (message, percentage) => {
            progress.report({
              message: message,
              increment: percentage - (progress._lastPercentage || 0),
            });
            progress._lastPercentage = percentage;
          };

          try {
            // Initialize the project with progress reporting
            const result =
              await this.initializationService.initializeProjectWithProgress(
                workspacePath,
                progressCallback,
              );

            if (result.success) {
              // Update webview state to reflect initialization
              if (
                this.webviewProvider &&
                this.webviewProvider._checkInitializationStatus
              ) {
                setTimeout(
                  () => this.webviewProvider._checkInitializationStatus(),
                  100,
                );
              }

              // Show success message
              const createdComponents = result.details?.createdComponents || [];
              if (createdComponents.length > 0) {
                vscode.window.showInformationMessage(
                  `CodeForge: Project initialized successfully! Created: ${createdComponents.join(", ")}`,
                );
              } else {
                vscode.window.showInformationMessage(
                  "CodeForge: Project was already initialized and is ready to use!",
                );
              }

              this.safeOutputLog(
                "CodeForge: Project initialization completed successfully",
              );
            } else {
              throw new Error(result.error || "Unknown initialization error");
            }
          } catch (error) {
            // Re-throw to be caught by outer try-catch
            throw error;
          }
        },
      );
    } catch (error) {
      this.safeOutputLog(`Initialization failed: ${error.message}`, true);

      // Show detailed error message with helpful actions
      const actions = ["View Logs", "Retry"];

      // Add specific actions based on error type
      if (error.message.toLowerCase().includes("permission")) {
        actions.push("Check Permissions");
      }
      if (error.message.toLowerCase().includes("resource")) {
        actions.push("Check Resources");
      }

      const selectedAction = await vscode.window.showErrorMessage(
        `CodeForge: Failed to initialize project - ${error.message}`,
        ...actions,
      );

      // Handle user actions
      if (selectedAction === "View Logs") {
        this.outputChannel.show();
      } else if (selectedAction === "Retry") {
        // Retry initialization
        setTimeout(() => this.handleInitializeProject(), 1000);
      } else if (selectedAction === "Check Permissions") {
        vscode.window.showInformationMessage(
          "Please ensure you have write permissions to the workspace directory and that no files are locked by other processes.",
          { modal: true },
        );
      } else if (selectedAction === "Check Resources") {
        vscode.window.showInformationMessage(
          "Please ensure the CodeForge extension resources are available and not corrupted. Try reloading the window or reinstalling the extension.",
          { modal: true },
        );
      }
    }
  }

  /**
   * Update webview state if available
   */
  updateWebviewState() {
    if (this.webviewProvider && this.webviewProvider.refresh) {
      this.webviewProvider.refresh();
    }
  }

  /**
   * Get all command handlers as a map
   */
  getCommandHandlers() {
    return {
      "codeforge.launchTerminal": this.handleLaunchTerminal.bind(this),
      "codeforge.runFuzzingTests": this.handleRunFuzzing.bind(this),
      "codeforge.buildFuzzingTests": this.handleBuildFuzzTargets.bind(this),
      "codeforge.refreshContainers": this.handleRefreshContainers.bind(this),
      "codeforge.refreshFuzzers": this.handleRefreshFuzzers.bind(this),
      "codeforge.viewCrash": this.handleViewCrash.bind(this),
      "codeforge.analyzeCrash": this.handleAnalyzeCrash.bind(this),
      "codeforge.clearCrashes": this.handleClearCrashes.bind(this),
      "codeforge.initializeProject": this.handleInitializeProject.bind(this),
    };
  }
}

module.exports = { CodeForgeCommandHandlers };
