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
const { CorpusDocumentProvider } = require("./corpusDocumentProvider");
const {
  InitializationDetectionService,
} = require("../core/initializationDetectionService");
const { LaunchConfigManager } = require("../utils/launchConfig");
const fs = require("fs").promises;
const path = require("path");

/**
 * Command Handlers for CodeForge Extension
 * Provides centralized command handling with proper error handling and user feedback
 */
class CodeForgeCommandHandlers {
  constructor(context, outputChannel, webviewProvider, resourceManager) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.webviewProvider = webviewProvider;
    this.resourceManager = resourceManager;
    this.fuzzerDiscoveryService = new FuzzerDiscoveryService(resourceManager);
    this.gdbIntegration = new GdbIntegration(dockerOperations, resourceManager);
    this.initializationService = new InitializationDetectionService(
      resourceManager,
    );
    this.launchConfigManager = new LaunchConfigManager();
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
      const removeAfterRun = config.get("removeContainersAfterRun", true);
      const defaultShell = config.get("defaultShell", "/bin/bash");
      const additionalArgs = config.get("additionalDockerRunArgs", []);
      const mountWorkspace = config.get("mountWorkspace", true);

      // Build launch script path and arguments
      // Use workspace .codeforge/scripts directory
      const scriptPath = path.join(
        workspacePath,
        ".codeforge",
        "scripts",
        "launch-process-in-docker.sh",
      );

      const scriptArgs = [
        // First argument must be workspace directory (required by script)
        workspacePath,
        // NOTE: Use --stdin instead of -i! VSCode provides stdin but not a TTY
        // Using -i (which adds -it) causes "input device is not a TTY" error
        "--stdin",
        "--image",
        containerName,
        "--shell",
        defaultShell,
        "--type",
        "terminal",
      ];

      // Add keep flag if not auto-removing
      if (!removeAfterRun) {
        scriptArgs.push("-k");
      }

      // Add workspace mounting flag
      if (!mountWorkspace) {
        scriptArgs.push("--no-mount");
      }

      // Add additional docker arguments
      for (const arg of additionalArgs) {
        scriptArgs.push("--docker-arg", arg);
      }

      // Add the shell command to start an interactive session
      scriptArgs.push(defaultShell);

      const terminal = vscode.window.createTerminal({
        name: `CodeForge: ${path.basename(workspacePath)}`,
        shellPath: scriptPath,
        shellArgs: scriptArgs,
      });

      terminal.show();

      // Container tracking is now handled by the launch-process-in-docker.sh script
      // It will track containers in .codeforge/tracked-containers
      this.safeOutputLog(
        `Launched terminal using ${containerName} (tracking handled by script)`,
      );
      this.updateWebviewState();
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
      const fuzzingTerminal = new CodeForgeFuzzingTerminal(
        workspacePath,
        null,
        this.resourceManager,
      );

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
      const buildTerminal = new CodeForgeBuildTerminal(
        workspacePath,
        this.resourceManager,
      );

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
   * Refresh crash data
   */
  async handleRefreshFuzzers() {
    try {
      const { path: workspacePath } = this.getWorkspaceInfo();

      // Check initialization status without prompting
      const initializationResult =
        await this.initializationService.isCodeForgeInitialized(workspacePath);

      if (!initializationResult.isInitialized) {
        // Project not initialized, silently skip refresh
        this.safeOutputLog(
          "Fuzzer refresh skipped - project not initialized",
          false,
        );
        return;
      }

      // Check if Docker image exists without prompting
      const containerName =
        dockerOperations.generateContainerName(workspacePath);
      const imageExists =
        await dockerOperations.checkImageExists(containerName);

      if (!imageExists) {
        // Docker image not built, silently skip refresh
        this.safeOutputLog(
          "Fuzzer refresh skipped - Docker image not built",
          false,
        );
        return;
      }

      // Set loading state
      if (this.webviewProvider) {
        this.webviewProvider._setFuzzerLoading(true);
      }

      // Refresh fuzzers with associated crashes (bypasses cache)
      const fuzzerData = await this.fuzzerDiscoveryService.refreshFuzzerData(
        workspacePath,
        containerName,
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
   * Regenerate fuzzer list by running find-fuzzers script with -c parameter
   * This forces a clean regeneration of the fuzzer cache
   */
  async handleRegenerateFuzzerList() {
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
          "CodeForge: Fuzzer list regeneration cancelled - project initialization and Docker build required",
        );
        return;
      }

      this.safeOutputLog("Regenerating fuzzer list with clean cache...", false);

      // Show progress notification
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "CodeForge: Regenerating fuzzer list...",
          cancellable: false,
        },
        async (progress) => {
          try {
            // Execute find-fuzz-tests.sh script with -c parameter to clean cache
            const regenerateCommand =
              ".codeforge/scripts/find-fuzz-tests.sh -c -q";

            const options = {
              removeAfterRun: true,
              mountWorkspace: true,
              dockerCommand: "docker",
              containerType: "fuzzer_regeneration",
              resourceManager: this.resourceManager,
            };

            const regenerateProcess =
              dockerOperations.runDockerCommandWithOutput(
                workspacePath,
                containerName,
                regenerateCommand,
                "/bin/bash",
                options,
              );

            let stdout = "";
            let stderr = "";

            regenerateProcess.stdout.on("data", (data) => {
              stdout += data.toString();
            });

            regenerateProcess.stderr.on("data", (data) => {
              stderr += data.toString();
            });

            await new Promise((resolve, reject) => {
              regenerateProcess.on("close", (code) => {
                if (code !== 0) {
                  // Handle case where no fuzzers are found (not an error)
                  if (
                    stderr.includes("No fuzz targets found") ||
                    stdout.includes("No fuzz targets found")
                  ) {
                    this.safeOutputLog(
                      "No fuzz targets found in project",
                      false,
                    );
                    resolve();
                    return;
                  }

                  this.safeOutputLog(
                    `Regenerate fuzzer list script failed with exit code ${code}: ${stderr}`,
                    false,
                  );
                  reject(
                    new Error(
                      `Regenerate script failed with exit code ${code}: ${stderr}`,
                    ),
                  );
                  return;
                }

                this.safeOutputLog("Successfully regenerated fuzzer list");
                resolve();
              });

              regenerateProcess.on("error", (error) => {
                reject(
                  new Error(
                    `Failed to execute regenerate script: ${error.message}`,
                  ),
                );
              });
            });

            // After regenerating the list, refresh the fuzzer data in the UI
            await this.handleRefreshFuzzers();

            vscode.window.showInformationMessage(
              "CodeForge: Fuzzer list regenerated successfully",
            );
          } catch (error) {
            throw error;
          }
        },
      );
    } catch (error) {
      this.safeOutputLog(
        `Error regenerating fuzzer list: ${error.message}`,
        false,
      );
      vscode.window.showErrorMessage(
        `CodeForge: Failed to regenerate fuzzer list - ${error.message}`,
      );
    }
  }

  /**
   * Run a specific fuzzer
   */
  async handleRunFuzzer(params) {
    try {
      const { fuzzerName } = params;
      const { path: workspacePath } = this.getWorkspaceInfo();

      if (!fuzzerName) {
        throw new Error("Fuzzer name not provided");
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
          "CodeForge: Fuzzer run cancelled - project initialization and Docker build required",
        );
        return;
      }

      this.safeOutputLog(`Starting fuzzer: ${fuzzerName}`, false);

      // Create a unique terminal name with timestamp
      const timestamp = new Date().toLocaleTimeString();
      const terminalName = `CodeForge Fuzzing: ${fuzzerName} - ${timestamp}`;

      // Create the fuzzing terminal
      const fuzzingTerminal = new CodeForgeFuzzingTerminal(
        workspacePath,
        fuzzerName,
        this.resourceManager,
      );

      // Create the VSCode terminal with our custom implementation
      const terminal = vscode.window.createTerminal({
        name: terminalName,
        pty: fuzzingTerminal,
        scrollback: 3000,
      });

      // Show the terminal immediately
      terminal.show();

      this.safeOutputLog(
        `Fuzzer ${fuzzerName} started in terminal: ${terminalName}`,
      );
    } catch (error) {
      this.safeOutputLog(`Error running fuzzer: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to run fuzzer - ${error.message}`,
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
   * Analyze crash with GDB in a terminal
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
   * Launch GDB server for remote debugging
   */
  async handleDebugCrash(params) {
    try {
      const { crashId, fuzzerName, filePath } = params;
      const { path: workspacePath } = this.getWorkspaceInfo();

      this.safeOutputLog(
        `Launching GDB server for crash ${crashId} from ${fuzzerName}`,
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
          "CodeForge: GDB server launch cancelled - project initialization and Docker build required",
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
        const errorMessage = `Cannot launch GDB server: ${validation.issues.join(", ")}`;
        this.safeOutputLog(errorMessage, false);
        vscode.window.showErrorMessage(`CodeForge: ${errorMessage}`);
        return;
      }

      // Resolve fuzzer executable and map paths
      const fuzzerExecutable =
        await this.gdbIntegration.fuzzerResolver.resolveFuzzerExecutable(
          workspacePath,
          fuzzerName,
        );

      const containerCrashPath =
        this.gdbIntegration.pathMapper.mapHostToContainer(
          filePath,
          workspacePath,
        );

      const containerFuzzerPath =
        this.gdbIntegration.pathMapper.mapHostToContainer(
          fuzzerExecutable,
          workspacePath,
        );

      // Find available port
      const hostPort =
        await this.gdbIntegration.gdbServerLauncher.findAvailablePort();
      const containerPort = 2000;

      // Build gdbserver command
      // Use --once to exit after first connection, and --attach would require PID
      // Instead, we'll use the standard mode but the program will wait for continue
      // Disable LLVM profiling to prevent default.profraw from being created
      const gdbserverCommand = `LLVM_PROFILE_FILE=/dev/null gdbserver --once 0.0.0.0:${containerPort} ${containerFuzzerPath} ${containerCrashPath}`;

      // Get configuration
      const config = vscode.workspace.getConfiguration("codeforge");
      const dockerCommand = config.get("dockerCommand", "docker");
      const additionalArgs = config.get("additionalDockerRunArgs", []);
      const mountWorkspace = config.get("mountWorkspace", true);

      // Generate unique container name for tracking
      const gdbserverContainerName = `${containerName}_gdbserver_${Date.now()}`;

      // Generate Docker run arguments with port forwarding
      const dockerArgs = [
        "run",
        "--name",
        gdbserverContainerName,
        "-i",
        "-t",
        "--rm", // Auto-remove when done
        "-p",
        `${hostPort}:${containerPort}`,
        ...additionalArgs,
      ];

      if (mountWorkspace) {
        dockerArgs.push("-v", `${workspacePath}:${workspacePath}`);
        dockerArgs.push("-w", workspacePath);
      }

      dockerArgs.push(containerName);
      dockerArgs.push("/bin/bash", "-c", gdbserverCommand);

      // Create terminal with gdbserver
      const terminal = vscode.window.createTerminal({
        name: `GDB Server: ${fuzzerName} - ${crashId}`,
        shellPath: dockerCommand,
        shellArgs: dockerArgs,
      });

      terminal.show();

      // Track the container for cleanup
      dockerOperations
        .trackLaunchedContainer(
          gdbserverContainerName,
          workspacePath,
          containerName,
          "gdbserver",
        )
        .then((tracked) => {
          if (tracked) {
            this.safeOutputLog(
              `Tracked GDB server container: ${gdbserverContainerName}`,
            );
          }
        })
        .catch((error) => {
          this.safeOutputLog(
            `Warning: Could not track GDB server container: ${error.message}`,
          );
        });

      // Set up terminal close handler to immediately kill the container
      const closeListener = vscode.window.onDidCloseTerminal(
        async (closedTerminal) => {
          if (closedTerminal === terminal) {
            this.safeOutputLog(
              `Terminal closed, killing GDB server container: ${gdbserverContainerName}`,
            );

            try {
              // Immediately kill the container (SIGKILL)
              await dockerOperations.killContainer(
                gdbserverContainerName,
                true,
              );
              this.safeOutputLog(
                `GDB server container killed: ${gdbserverContainerName}`,
              );
            } catch (error) {
              this.safeOutputLog(
                `Container cleanup completed or failed: ${error.message}`,
              );
            }

            // Clean up the listener
            closeListener.dispose();

            // Update webview state
            this.updateWebviewState();
          }
        },
      );

      // Store the listener in context subscriptions for cleanup on extension deactivation
      this.context.subscriptions.push(closeListener);

      // Create or update launch configuration for GDB attach
      const launchConfigName = `CodeForge GDB: ${fuzzerName}`;
      const launchConfigResult =
        await this.launchConfigManager.createOrUpdateGdbAttachConfig(
          workspacePath,
          launchConfigName,
          hostPort,
          fuzzerExecutable,
          {
            autorun: [
              // Configure GDB for remote debugging
              "set confirm off",
              "set breakpoint pending on",
              // Note: reverse debugging (target record-full) is not enabled
              // as it significantly degrades performance
            ],
            valuesFormatting: "parseText",
            printCalls: false,
            stopAtConnect: true,
          },
        );

      if (launchConfigResult.success) {
        this.safeOutputLog(
          `Launch configuration ${launchConfigResult.action}: ${launchConfigName}`,
          false,
        );
      } else {
        this.safeOutputLog(
          `Warning: Failed to create launch configuration: ${launchConfigResult.error}`,
          false,
        );
      }

      // Show connection info immediately
      const connectionString = `localhost:${hostPort}`;
      const copyCommand = `target remote ${connectionString}`;

      this.safeOutputLog(
        `GDB server launching in terminal for ${crashId} from ${fuzzerName}`,
        false,
      );
      this.safeOutputLog(`Connection: ${connectionString}`, false);
      this.safeOutputLog(`Container: ${gdbserverContainerName}`, false);
      this.safeOutputLog(`Command: ${copyCommand}`, false);

      // Wait a moment for gdbserver to start, then automatically connect debugger
      setTimeout(async () => {
        try {
          if (launchConfigResult.success) {
            this.safeOutputLog(
              `Automatically connecting debugger to ${connectionString}...`,
              false,
            );

            // Launch the debugger with the created configuration
            const debugStarted = await vscode.debug.startDebugging(
              vscode.workspace.workspaceFolders[0],
              launchConfigName,
            );

            if (debugStarted) {
              this.safeOutputLog(
                `Debugger connected successfully to ${fuzzerName}`,
                false,
              );
              vscode.window.showInformationMessage(
                `CodeForge: Debugger connected to ${fuzzerName}`,
              );
            } else {
              this.safeOutputLog(
                `Failed to start debugger for ${fuzzerName}`,
                false,
              );
              vscode.window
                .showWarningMessage(
                  `CodeForge: Failed to start debugger. You can manually connect using: ${copyCommand}`,
                  "Copy Command",
                )
                .then((action) => {
                  if (action === "Copy Command") {
                    vscode.env.clipboard.writeText(copyCommand);
                  }
                });
            }
          } else {
            vscode.window
              .showWarningMessage(
                `CodeForge: GDB server running but launch configuration failed. Connect manually using: ${copyCommand}`,
                "Copy Command",
                "Show Output",
              )
              .then((action) => {
                if (action === "Copy Command") {
                  vscode.env.clipboard.writeText(copyCommand);
                } else if (action === "Show Output") {
                  this.outputChannel.show();
                }
              });
          }
        } catch (error) {
          this.safeOutputLog(
            `Error auto-connecting debugger: ${error.message}`,
            false,
          );
          vscode.window
            .showErrorMessage(
              `CodeForge: Failed to auto-connect debugger - ${error.message}`,
              "Copy Command",
            )
            .then((action) => {
              if (action === "Copy Command") {
                vscode.env.clipboard.writeText(copyCommand);
              }
            });
        }
      }, 2000); // Wait 2 seconds for gdbserver to be ready
    } catch (error) {
      this.safeOutputLog(`Error launching GDB server: ${error.message}`, true);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to launch GDB server - ${error.message}`,
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

      // Get fuzzer preset from cache
      const cachedFuzzer =
        this.fuzzerDiscoveryService.getCachedFuzzer(fuzzerName);
      if (!cachedFuzzer || !cachedFuzzer.preset) {
        throw new Error(`Could not find preset for fuzzer: ${fuzzerName}`);
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
          "CodeForge: Clear crashes cancelled - project initialization and Docker build required",
        );
        return;
      }

      this.safeOutputLog(`Clearing crashes for fuzzer: ${fuzzerName}`, false);

      // Execute clear-crashes.sh script inside Docker container
      // The script expects fuzzer name in "preset:fuzzer_name" format
      const fuzzerIdentifier = `${cachedFuzzer.preset}:${fuzzerName}`;
      const clearCommand = `.codeforge/scripts/clear-crashes.sh "${fuzzerIdentifier}"`;

      const options = {
        removeAfterRun: true,
        mountWorkspace: true,
        dockerCommand: "docker",
        containerType: "clear_crashes",
        resourceManager: this.resourceManager,
      };

      const clearProcess = dockerOperations.runDockerCommandWithOutput(
        workspacePath,
        containerName,
        clearCommand,
        "/bin/bash",
        options,
      );

      let stdout = "";
      let stderr = "";

      clearProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      clearProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      await new Promise((resolve, reject) => {
        clearProcess.on("close", (code) => {
          if (code !== 0) {
            this.safeOutputLog(
              `Clear crashes script failed with exit code ${code}: ${stderr}`,
              false,
            );
            reject(
              new Error(
                `Clear crashes script failed with exit code ${code}: ${stderr}`,
              ),
            );
            return;
          }

          this.safeOutputLog(`Successfully cleared crashes for ${fuzzerName}`);
          resolve();
        });

        clearProcess.on("error", (error) => {
          reject(
            new Error(
              `Failed to execute clear crashes script: ${error.message}`,
            ),
          );
        });
      });

      // Refresh fuzzer data
      await this.handleRefreshFuzzers();

      vscode.window.showInformationMessage(
        `CodeForge: Cleared crashes for ${fuzzerName}`,
      );
    } catch (error) {
      this.safeOutputLog(`Error clearing crashes: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to clear crashes - ${error.message}`,
      );
    }
  }

  /**
   * Reevaluate crashes for a fuzzer
   */
  async handleReevaluateCrashes(params) {
    try {
      const { fuzzerName } = params;
      const { path: workspacePath } = this.getWorkspaceInfo();

      if (!fuzzerName) {
        throw new Error("Fuzzer name not provided");
      }

      // Get fuzzer preset from cache, or refresh if not found
      let cachedFuzzer =
        this.fuzzerDiscoveryService.getCachedFuzzer(fuzzerName);

      // If fuzzer not in cache or cache is invalid, refresh the fuzzer data
      if (!cachedFuzzer || !cachedFuzzer.preset) {
        this.safeOutputLog(
          `Fuzzer ${fuzzerName} not in cache, refreshing fuzzer data...`,
          false,
        );

        const containerName =
          dockerOperations.generateContainerName(workspacePath);

        // Refresh fuzzer data to populate cache
        await this.fuzzerDiscoveryService.refreshFuzzerData(
          workspacePath,
          containerName,
        );

        // Try to get the fuzzer again
        cachedFuzzer = this.fuzzerDiscoveryService.getCachedFuzzer(fuzzerName);

        if (!cachedFuzzer || !cachedFuzzer.preset) {
          throw new Error(`Could not find preset for fuzzer: ${fuzzerName}`);
        }
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
          "CodeForge: Reevaluate crashes cancelled - project initialization and Docker build required",
        );
        return;
      }

      this.safeOutputLog(
        `Reevaluating crashes for fuzzer: ${fuzzerName}`,
        false,
      );

      // Show progress notification
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `CodeForge: Reevaluating crashes for ${fuzzerName}...`,
          cancellable: false,
        },
        async (progress) => {
          try {
            // First, rebuild the fuzzer to ensure we have the latest binary
            progress.report({ message: "Building fuzzer..." });

            const fuzzerIdentifier = `${cachedFuzzer.preset}:${fuzzerName}`;
            const buildCommand = `.codeforge/scripts/build-fuzz-tests.sh "${fuzzerIdentifier}"`;

            const buildOptions = {
              removeAfterRun: true,
              mountWorkspace: true,
              dockerCommand: "docker",
              containerType: "build_fuzzer",
              resourceManager: this.resourceManager,
            };

            const buildProcess = dockerOperations.runDockerCommandWithOutput(
              workspacePath,
              containerName,
              buildCommand,
              "/bin/bash",
              buildOptions,
            );

            let buildStdout = "";
            let buildStderr = "";

            buildProcess.stdout.on("data", (data) => {
              buildStdout += data.toString();
            });

            buildProcess.stderr.on("data", (data) => {
              buildStderr += data.toString();
            });

            await new Promise((resolve, reject) => {
              buildProcess.on("close", (code) => {
                if (code !== 0) {
                  this.safeOutputLog(
                    `Build failed with exit code ${code}: ${buildStderr}`,
                    false,
                  );
                  reject(
                    new Error(
                      `Build failed with exit code ${code}: ${buildStderr}`,
                    ),
                  );
                  return;
                }

                this.safeOutputLog(`Successfully built ${fuzzerName}`);
                resolve();
              });

              buildProcess.on("error", (error) => {
                reject(
                  new Error(`Failed to execute build script: ${error.message}`),
                );
              });
            });

            // Now reevaluate crashes
            progress.report({ message: "Reevaluating crashes..." });

            const reevaluateCommand = `.codeforge/scripts/reevaluate-crashes.sh "${fuzzerIdentifier}"`;

            const reevaluateOptions = {
              removeAfterRun: true,
              mountWorkspace: true,
              dockerCommand: "docker",
              containerType: "reevaluate_crashes",
              resourceManager: this.resourceManager,
            };

            const reevaluateProcess =
              dockerOperations.runDockerCommandWithOutput(
                workspacePath,
                containerName,
                reevaluateCommand,
                "/bin/bash",
                reevaluateOptions,
              );

            let reevaluateStdout = "";
            let reevaluateStderr = "";

            reevaluateProcess.stdout.on("data", (data) => {
              reevaluateStdout += data.toString();
            });

            reevaluateProcess.stderr.on("data", (data) => {
              reevaluateStderr += data.toString();
            });

            await new Promise((resolve, reject) => {
              reevaluateProcess.on("close", (code) => {
                if (code !== 0) {
                  this.safeOutputLog(
                    `Reevaluate crashes script failed with exit code ${code}: ${reevaluateStderr}`,
                    false,
                  );
                  reject(
                    new Error(
                      `Reevaluate crashes script failed with exit code ${code}: ${reevaluateStderr}`,
                    ),
                  );
                  return;
                }

                this.safeOutputLog(
                  `Successfully reevaluated crashes for ${fuzzerName}`,
                );
                resolve();
              });

              reevaluateProcess.on("error", (error) => {
                reject(
                  new Error(
                    `Failed to execute reevaluate crashes script: ${error.message}`,
                  ),
                );
              });
            });
          } catch (error) {
            throw error;
          }
        },
      );

      // Refresh fuzzer data
      await this.handleRefreshFuzzers();

      vscode.window.showInformationMessage(
        `CodeForge: Reevaluated crashes for ${fuzzerName}`,
      );
    } catch (error) {
      this.safeOutputLog(`Error reevaluating crashes: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to reevaluate crashes - ${error.message}`,
      );
    }
  }

  /**
   * View corpus files for a fuzzer
   */
  async handleViewCorpus(params) {
    try {
      const { fuzzerName } = params;

      if (!fuzzerName) {
        throw new Error("Fuzzer name not provided");
      }

      // Get workspace path
      const { path: workspacePath } = this.getWorkspaceInfo();

      // Log the action
      this.safeOutputLog(`Opening corpus viewer for fuzzer: ${fuzzerName}`);

      // Create virtual URI for the corpus document
      const corpusUri = CorpusDocumentProvider.createCorpusUri(
        fuzzerName,
        workspacePath,
      );

      // Open the virtual document using the corpus document provider
      const document = await vscode.workspace.openTextDocument(corpusUri);

      // Show document in editor
      await vscode.window.showTextDocument(document, {
        preview: true,
        preserveFocus: false,
      });

      this.safeOutputLog(`Opened corpus viewer for fuzzer: ${fuzzerName}`);
    } catch (error) {
      this.safeOutputLog(`Error viewing corpus: ${error.message}`, false);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to open corpus viewer - ${error.message}`,
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
      "codeforge.refreshFuzzers": this.handleRefreshFuzzers.bind(this),
      "codeforge.regenerateFuzzerList":
        this.handleRegenerateFuzzerList.bind(this),
      "codeforge.runFuzzer": this.handleRunFuzzer.bind(this),
      "codeforge.viewCrash": this.handleViewCrash.bind(this),
      "codeforge.analyzeCrash": this.handleAnalyzeCrash.bind(this),
      "codeforge.debugCrash": this.handleDebugCrash.bind(this),
      "codeforge.clearCrashes": this.handleClearCrashes.bind(this),
      "codeforge.reevaluateCrashes": this.handleReevaluateCrashes.bind(this),
      "codeforge.viewCorpus": this.handleViewCorpus.bind(this),
      "codeforge.initializeProject": this.handleInitializeProject.bind(this),
    };
  }
}

module.exports = { CodeForgeCommandHandlers };
