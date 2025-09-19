const vscode = require("vscode");
const dockerOperations = require("../core/dockerOperations");
const fuzzingOperations = require("../fuzzing/fuzzingOperations");
const { CodeForgeFuzzingTerminal } = require("../fuzzing/fuzzingTerminal");
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
      this.outputChannel.show();
      vscode.window.showErrorMessage(
        `CodeForge: Failed to initialize/build automatically - ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Initialize CodeForge project
   */
  async handleInitialize() {
    try {
      const { path: workspacePath } = this.getWorkspaceInfo();
      const codeforgeDir = path.join(workspacePath, ".codeforge");
      const dockerfilePath = path.join(codeforgeDir, "Dockerfile");

      // Check if .codeforge directory already exists
      try {
        await fs.access(codeforgeDir);
        const result = await vscode.window.showWarningMessage(
          "CodeForge: .codeforge directory already exists. Do you want to overwrite it?",
          "Yes",
          "No",
        );
        if (result !== "Yes") {
          return;
        }
      } catch (error) {
        // Directory doesn't exist, which is fine
      }

      // Create .codeforge directory
      await fs.mkdir(codeforgeDir, { recursive: true });
      this.safeOutputLog(`Created directory: ${codeforgeDir}`);

      // Write Dockerfile
      await fs.writeFile(dockerfilePath, DOCKERFILE_CONTENT);
      this.safeOutputLog(`Created Dockerfile: ${dockerfilePath}`);

      vscode.window.showInformationMessage(
        "CodeForge: Successfully initialized .codeforge directory",
      );
      this.safeOutputLog("", true); // Just show the output channel

      // Update webview state if available
      this.updateWebviewState();
    } catch (error) {
      this.safeOutputLog(`Error: ${error.message}`, true);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to initialize - ${error.message}`,
      );
    }
  }

  /**
   * Build Docker environment
   */
  async handleBuildDocker() {
    try {
      const { path: workspacePath } = this.getWorkspaceInfo();
      const dockerfilePath = path.join(
        workspacePath,
        ".codeforge",
        "Dockerfile",
      );

      // Check if Dockerfile exists
      try {
        await fs.access(dockerfilePath);
      } catch (error) {
        vscode.window.showErrorMessage(
          'CodeForge: Dockerfile not found. Please run "Initialize CodeForge" first.',
        );
        return;
      }

      // Generate container name
      const containerName =
        dockerOperations.generateContainerName(workspacePath);
      this.safeOutputLog(`Building Docker image: ${containerName}`, true);

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
            vscode.window.showInformationMessage(
              `CodeForge: Successfully built Docker image ${containerName}`,
            );
          } catch (error) {
            throw error;
          }
        },
      );

      // Update webview state if available
      this.updateWebviewState();
    } catch (error) {
      this.safeOutputLog(`Build failed: ${error.message}`, true);
      vscode.window.showErrorMessage(
        `CodeForge: Build failed - ${error.message}`,
      );
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
      this.safeOutputLog(`Error: ${error.message}`, true);
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
      this.safeOutputLog(`Fuzzing failed: ${error.message}`, true);
      vscode.window.showErrorMessage(
        `CodeForge: Fuzzing failed - ${error.message}`,
      );
    }
  }

  /**
   * List active containers
   */
  async handleListContainers() {
    try {
      const containers = await dockerOperations.getContainerStatus();

      if (containers.length === 0) {
        vscode.window.showInformationMessage(
          "CodeForge: No active containers tracked by this extension",
        );
        return;
      }

      // Format container information for display
      const containerInfo = containers.map((c) => {
        const status = c.running ? "🟢 Running" : "🔴 Stopped";
        const age = Math.round(
          (Date.now() - new Date(c.createdAt).getTime()) / 1000 / 60,
        );
        return `${status} | ${c.name} | Type: ${c.type} | Age: ${age}m | Image: ${c.image}`;
      });

      const selected = await vscode.window.showQuickPick(containerInfo, {
        placeHolder: "Active containers (select to manage)",
        canPickMany: false,
      });

      if (selected) {
        // Extract container name from the selected item
        const containerName = selected.split(" | ")[1];
        const container = containers.find((c) => c.name === containerName);

        if (container) {
          const action = await vscode.window.showQuickPick(
            ["Stop Container", "Stop and Remove Container", "Cancel"],
            { placeHolder: `Action for ${container.name}` },
          );

          if (action === "Stop Container") {
            await dockerOperations.stopContainer(container.id, false);
            vscode.window.showInformationMessage(
              `Stopped container: ${container.name}`,
            );
            this.updateWebviewState();
          } else if (action === "Stop and Remove Container") {
            await dockerOperations.stopContainer(container.id, true);
            vscode.window.showInformationMessage(
              `Stopped and removed container: ${container.name}`,
            );
            this.updateWebviewState();
          }
        }
      }
    } catch (error) {
      this.safeOutputLog(`Error listing containers: ${error.message}`, true);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to list containers - ${error.message}`,
      );
    }
  }

  /**
   * Run command in container
   */
  async handleRunCommand() {
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

      // Prompt user for command
      const command = await vscode.window.showInputBox({
        prompt: "Enter command to run in container",
        placeHolder: "e.g., ls -la, python script.py, make build",
      });

      if (!command) {
        return;
      }

      this.safeOutputLog(`Running command in container: ${command}`);

      // Get configuration
      const config = vscode.workspace.getConfiguration("codeforge");
      const removeAfterRun = config.get("removeContainersAfterRun", true);
      const defaultShell = config.get("defaultShell", "/bin/bash");
      const additionalArgs = config.get("additionalDockerRunArgs", []);
      const showOutput = config.get("showOutputChannel", true);
      const dockerCommand = config.get("dockerCommand", "docker");
      const mountWorkspace = config.get("mountWorkspace", true);

      if (showOutput) {
        this.safeOutputLog("", true); // Just show the output channel
      }

      // Use dockerOperations.runDockerCommandWithOutput for proper output capture
      const dockerProcess = dockerOperations.runDockerCommandWithOutput(
        workspacePath,
        containerName,
        command,
        defaultShell,
        {
          removeAfterRun: removeAfterRun,
          additionalArgs: additionalArgs,
          dockerCommand: dockerCommand,
          mountWorkspace: mountWorkspace,
        },
      );

      // Capture output
      dockerProcess.stdout.on("data", (data) => {
        this.outputChannel.append(data.toString());
      });

      dockerProcess.stderr.on("data", (data) => {
        this.outputChannel.append(data.toString());
      });

      dockerProcess.on("close", (code) => {
        if (code === 0) {
          this.safeOutputLog(`\nCommand completed successfully`);
          vscode.window.showInformationMessage(
            "CodeForge: Command completed successfully",
          );
        } else {
          this.safeOutputLog(`\nCommand failed with exit code ${code}`);
          vscode.window.showErrorMessage(
            `CodeForge: Command failed with exit code ${code}`,
          );
        }
      });

      dockerProcess.on("error", (error) => {
        this.safeOutputLog(`\nError: ${error.message}`);
        vscode.window.showErrorMessage(
          `CodeForge: Failed to run command - ${error.message}`,
        );
      });
    } catch (error) {
      this.safeOutputLog(`Error: ${error.message}`, true);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to run command - ${error.message}`,
      );
    }
  }

  /**
   * Terminate all containers
   */
  async handleTerminateAll() {
    try {
      const containers = await dockerOperations.getActiveContainers();

      if (containers.length === 0) {
        vscode.window.showInformationMessage(
          "CodeForge: No active containers to terminate",
        );
        return;
      }

      const results = await dockerOperations.terminateAllContainers(true);

      if (results.succeeded > 0) {
        vscode.window.showInformationMessage(
          `CodeForge: Terminated ${results.succeeded} container(s)`,
        );
      }

      if (results.failed > 0) {
        vscode.window.showWarningMessage(
          `CodeForge: Failed to terminate ${results.failed} container(s)`,
        );
      }

      this.safeOutputLog(
        `Container termination complete: ${results.succeeded} succeeded, ${results.failed} failed`,
      );

      // Update webview state
      this.updateWebviewState();
    } catch (error) {
      this.safeOutputLog(
        `Error terminating containers: ${error.message}`,
        true,
      );
      vscode.window.showErrorMessage(
        `CodeForge: Failed to terminate containers - ${error.message}`,
      );
    }
  }

  /**
   * Cleanup orphaned containers
   */
  async handleCleanup() {
    try {
      const cleaned = await dockerOperations.cleanupOrphanedContainers();

      if (cleaned > 0) {
        vscode.window.showInformationMessage(
          `CodeForge: Cleaned up ${cleaned} orphaned container(s) from tracking`,
        );
      } else {
        vscode.window.showInformationMessage(
          "CodeForge: No orphaned containers found",
        );
      }

      this.safeOutputLog(`Cleaned up ${cleaned} orphaned container(s)`);

      // Update webview state
      this.updateWebviewState();
    } catch (error) {
      this.safeOutputLog(
        `Error cleaning up orphaned containers: ${error.message}`,
        true,
      );
      vscode.window.showErrorMessage(
        `CodeForge: Failed to cleanup orphaned containers - ${error.message}`,
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
      this.safeOutputLog(`Error stack: ${error.stack}`, true);
      vscode.window.showErrorMessage(
        `CodeForge: Failed to refresh containers - ${error.message}`,
      );
    }
  }

  /**
   * Update webview state if available
   */
  updateWebviewState() {
    if (this.webviewProvider && this.webviewProvider._detectAndUpdateState) {
      // Delay the update slightly to allow for container state changes to propagate
      setTimeout(() => {
        this.webviewProvider._detectAndUpdateState();
      }, 500);
    }
  }

  /**
   * Get all command handlers as a map
   */
  getCommandHandlers() {
    return {
      "codeforge.initialize": this.handleInitialize.bind(this),
      "codeforge.buildEnvironment": this.handleBuildDocker.bind(this),
      "codeforge.launchTerminal": this.handleLaunchTerminal.bind(this),
      "codeforge.runFuzzingTests": this.handleRunFuzzing.bind(this),
      "codeforge.listContainers": this.handleListContainers.bind(this),
      "codeforge.runCommand": this.handleRunCommand.bind(this),
      "codeforge.terminateAllContainers": this.handleTerminateAll.bind(this),
      "codeforge.cleanupOrphaned": this.handleCleanup.bind(this),
      "codeforge.refreshContainers": this.handleRefreshContainers.bind(this),
    };
  }
}

module.exports = { CodeForgeCommandHandlers };
