const vscode = require("vscode");
const dockerOperations = require("./core/dockerOperations");
const { CodeForgeTaskProvider } = require("./tasks/taskProvider");
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

let outputChannel;

/**
 * Safe wrapper for output channel operations
 */
function safeOutputLog(message, show = false) {
  try {
    if (outputChannel) {
      outputChannel.appendLine(message);
      if (show) {
        outputChannel.show();
      }
    }
  } catch (error) {
    // Silently ignore if output channel is disposed
    console.log(`CodeForge: ${message}`);
  }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // Create output channel for CodeForge
  outputChannel = vscode.window.createOutputChannel("CodeForge");
  context.subscriptions.push(outputChannel);

  // Register the task provider
  try {
    const taskProvider = new CodeForgeTaskProvider(context, outputChannel);
    const taskProviderDisposable = vscode.tasks.registerTaskProvider(
      "codeforge",
      taskProvider,
    );

    if (!taskProviderDisposable) {
      throw new Error("Failed to create task provider disposable");
    }

    context.subscriptions.push(taskProviderDisposable);
  } catch (error) {
    vscode.window.showErrorMessage(
      `CodeForge: Failed to register task provider - ${error.message}`,
    );
  }

  // Automatically initialize .codeforge directory on activation
  initializeCodeForgeOnActivation();

  // Check if Docker is available
  const config = vscode.workspace.getConfiguration("codeforge");
  const dockerCommand = config.get("dockerCommand", "docker");
  dockerOperations.checkDockerAvailable(dockerCommand).then((available) => {
    if (!available) {
      vscode.window
        .showWarningMessage(
          "CodeForge: Docker is not installed or not running. Please install Docker and ensure it is running.",
          "Check Again",
          "Ignore",
        )
        .then((selection) => {
          if (selection === "Check Again") {
            vscode.commands.executeCommand("codeforge.checkDocker");
          }
        });
    }
  });

  // Register the initialize command
  let initializeCommand = vscode.commands.registerCommand(
    "codeforge.initialize",
    async function () {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage(
            "CodeForge: No workspace folder is open",
          );
          return;
        }

        const workspacePath = workspaceFolder.uri.fsPath;
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
        safeOutputLog(`Created directory: ${codeforgeDir}`);

        // Write Dockerfile
        await fs.writeFile(dockerfilePath, DOCKERFILE_CONTENT);
        safeOutputLog(`Created Dockerfile: ${dockerfilePath}`);

        vscode.window.showInformationMessage(
          "CodeForge: Successfully initialized .codeforge directory",
        );
        safeOutputLog("", true); // Just show the output channel
      } catch (error) {
        safeOutputLog(`Error: ${error.message}`, true);
        vscode.window.showErrorMessage(
          `CodeForge: Failed to initialize - ${error.message}`,
        );
      }
    },
  );

  // Register the build environment command
  let buildEnvironmentCommand = vscode.commands.registerCommand(
    "codeforge.buildEnvironment",
    async function () {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage(
            "CodeForge: No workspace folder is open",
          );
          return;
        }

        const workspacePath = workspaceFolder.uri.fsPath;
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
        safeOutputLog(`Building Docker image: ${containerName}`, true);

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
              outputChannel.appendLine(
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
      } catch (error) {
        safeOutputLog(`Build failed: ${error.message}`, true);
        vscode.window.showErrorMessage(
          `CodeForge: Build failed - ${error.message}`,
        );
      }
    },
  );

  // Register the launch terminal command
  let launchTerminalCommand = vscode.commands.registerCommand(
    "codeforge.launchTerminal",
    async function () {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage(
            "CodeForge: No workspace folder is open",
          );
          return;
        }

        const workspacePath = workspaceFolder.uri.fsPath;
        const containerName =
          dockerOperations.generateContainerName(workspacePath);

        // Auto-initialize and build if needed
        const initialized = await ensureInitializedAndBuilt(
          workspacePath,
          containerName,
        );
        if (!initialized) {
          return;
        }

        // Create a new terminal
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
                safeOutputLog(
                  `Launched and tracked terminal container: ${generatedName}`,
                );
                vscode.window.showInformationMessage(
                  `CodeForge: Terminal container started and tracked: ${generatedName}`,
                );
              } else {
                safeOutputLog(
                  `Launched terminal but could not track container: ${generatedName}`,
                );
                if (!removeAfterRun) {
                  vscode.window.showWarningMessage(
                    `CodeForge: Terminal started but container tracking failed. Container may not appear in active list.`,
                  );
                }
              }
            })
            .catch((error) => {
              safeOutputLog(
                `Error tracking terminal container: ${error.message}`,
              );
            });
        } else {
          safeOutputLog(
            `Launched terminal in container: ${containerName} (no container name generated)`,
          );
        }
      } catch (error) {
        safeOutputLog(`Error: ${error.message}`, true);
        vscode.window.showErrorMessage(
          `CodeForge: Failed to launch terminal - ${error.message}`,
        );
      }
    },
  );

  // Register the run command
  let runCommandCommand = vscode.commands.registerCommand(
    "codeforge.runCommand",
    async function () {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage(
            "CodeForge: No workspace folder is open",
          );
          return;
        }

        const workspacePath = workspaceFolder.uri.fsPath;
        const containerName =
          dockerOperations.generateContainerName(workspacePath);

        // Auto-initialize and build if needed
        const initialized = await ensureInitializedAndBuilt(
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

        safeOutputLog(`Running command in container: ${command}`);

        // Get configuration
        const config = vscode.workspace.getConfiguration("codeforge");
        const removeAfterRun = config.get("removeContainersAfterRun", true);
        const defaultShell = config.get("defaultShell", "/bin/bash");
        const additionalArgs = config.get("additionalDockerRunArgs", []);
        const showOutput = config.get("showOutputChannel", true);
        const dockerCommand = config.get("dockerCommand", "docker");
        const mountWorkspace = config.get("mountWorkspace", true);

        /// CHANGE THIS TO use the terminal instead of the output channel
        if (showOutput) {
          safeOutputLog("", true); // Just show the output channel
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
          outputChannel.append(data.toString());
        });

        dockerProcess.stderr.on("data", (data) => {
          outputChannel.append(data.toString());
        });

        dockerProcess.on("close", (code) => {
          if (code === 0) {
            safeOutputLog(`\nCommand completed successfully`);
            vscode.window.showInformationMessage(
              "CodeForge: Command completed successfully",
            );
          } else {
            safeOutputLog(`\nCommand failed with exit code ${code}`);
            vscode.window.showErrorMessage(
              `CodeForge: Command failed with exit code ${code}`,
            );
          }
        });

        dockerProcess.on("error", (error) => {
          safeOutputLog(`\nError: ${error.message}`);
          vscode.window.showErrorMessage(
            `CodeForge: Failed to run command - ${error.message}`,
          );
        });
      } catch (error) {
        safeOutputLog(`Error: ${error.message}`, true);
        vscode.window.showErrorMessage(
          `CodeForge: Failed to run command - ${error.message}`,
        );
      }
    },
  );

  // Register the register task command
  let registerTaskCommand = vscode.commands.registerCommand(
    "codeforge.registerTask",
    async function () {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage(
            "CodeForge: No workspace folder is open",
          );
          return;
        }

        // Prompt for the command to run
        const command = await vscode.window.showInputBox({
          prompt: "Enter the command to run in the container",
          placeHolder: "e.g., npm test, make build, python script.py",
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Command cannot be empty";
            }
            return null;
          },
        });

        if (!command) {
          return; // User cancelled
        }

        // Auto-generate label and description
        const taskLabel = `CodeForge: ${command}`;
        const taskDetail = `Run command in CodeForge container`;

        // Create the task definition
        const taskDefinition = {
          type: "codeforge",
          label: taskLabel,
          command: command,
          detail: taskDetail,
          problemMatcher: [],
        };

        // Get or create tasks.json
        const tasksJsonPath = path.join(
          workspaceFolder.uri.fsPath,
          ".vscode",
          "tasks.json",
        );

        let tasksConfig = {
          version: "2.0.0",
          tasks: [],
        };

        // Check if tasks.json exists
        try {
          const tasksJsonContent = await fs.readFile(tasksJsonPath, "utf8");
          // Parse the JSON, handling comments
          const jsonWithoutComments = tasksJsonContent.replace(
            /\/\*[\s\S]*?\*\/|\/\/.*/g,
            "",
          );
          tasksConfig = JSON.parse(jsonWithoutComments);
        } catch (error) {
          // File doesn't exist or is invalid, we'll create a new one
          safeOutputLog(`Creating new tasks.json file at ${tasksJsonPath}`);
        }

        // Add the new task
        if (!tasksConfig.tasks) {
          tasksConfig.tasks = [];
        }

        // Check if a task with the same label already exists
        const existingTaskIndex = tasksConfig.tasks.findIndex(
          (task) => task.label === taskLabel,
        );

        if (existingTaskIndex !== -1) {
          const overwrite = await vscode.window.showWarningMessage(
            `A task with label "${taskLabel}" already exists. Do you want to overwrite it?`,
            "Yes",
            "No",
          );
          if (overwrite !== "Yes") {
            return;
          }
          // Replace the existing task
          tasksConfig.tasks[existingTaskIndex] = taskDefinition;
        } else {
          // Add the new task
          tasksConfig.tasks.push(taskDefinition);
        }

        // Ensure .vscode directory exists
        const vscodeDir = path.join(workspaceFolder.uri.fsPath, ".vscode");
        await fs.mkdir(vscodeDir, { recursive: true });

        // Write the updated tasks.json
        const tasksJsonString = JSON.stringify(tasksConfig, null, 2);
        await fs.writeFile(tasksJsonPath, tasksJsonString, "utf8");

        safeOutputLog(`Successfully registered task: ${taskLabel}`);
      } catch (error) {
        safeOutputLog(`Error registering task: ${error.message}`, true);
        vscode.window.showErrorMessage(
          `CodeForge: Failed to register task - ${error.message}`,
        );
      }
    },
  );

  // Register container management commands
  let listContainersCommand = vscode.commands.registerCommand(
    "codeforge.listContainers",
    async function () {
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
            } else if (action === "Stop and Remove Container") {
              await dockerOperations.stopContainer(container.id, true);
              vscode.window.showInformationMessage(
                `Stopped and removed container: ${container.name}`,
              );
            }
          }
        }
      } catch (error) {
        safeOutputLog(`Error listing containers: ${error.message}`, true);
        vscode.window.showErrorMessage(
          `CodeForge: Failed to list containers - ${error.message}`,
        );
      }
    },
  );

  let terminateAllContainersCommand = vscode.commands.registerCommand(
    "codeforge.terminateAllContainers",
    async function () {
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

        safeOutputLog(
          `Container termination complete: ${results.succeeded} succeeded, ${results.failed} failed`,
        );
      } catch (error) {
        safeOutputLog(`Error terminating containers: ${error.message}`, true);
        vscode.window.showErrorMessage(
          `CodeForge: Failed to terminate containers - ${error.message}`,
        );
      }
    },
  );

  let cleanupOrphanedCommand = vscode.commands.registerCommand(
    "codeforge.cleanupOrphaned",
    async function () {
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

        safeOutputLog(`Cleaned up ${cleaned} orphaned container(s)`);
      } catch (error) {
        safeOutputLog(
          `Error cleaning up orphaned containers: ${error.message}`,
          true,
        );
        vscode.window.showErrorMessage(
          `CodeForge: Failed to cleanup orphaned containers - ${error.message}`,
        );
      }
    },
  );

  // Register the run fuzzing tests command
  let runFuzzingTestsCommand = vscode.commands.registerCommand(
    "codeforge.runFuzzingTests",
    async function () {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage(
            "CodeForge: No workspace folder is open",
          );
          return;
        }

        const workspacePath = workspaceFolder.uri.fsPath;

        // Auto-initialize and build if needed
        const containerName =
          dockerOperations.generateContainerName(workspacePath);
        const initialized = await ensureInitializedAndBuilt(
          workspacePath,
          containerName,
        );
        if (!initialized) {
          return;
        }

        // Import the fuzzing terminal
        const {
          CodeForgeFuzzingTerminal,
        } = require("./fuzzing/fuzzingTerminal");

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
        safeOutputLog(`Fuzzing failed: ${error.message}`, true);
        vscode.window.showErrorMessage(
          `CodeForge: Fuzzing failed - ${error.message}`,
        );
      }
    },
  );

  // Add all commands to subscriptions
  context.subscriptions.push(initializeCommand);
  context.subscriptions.push(buildEnvironmentCommand);
  context.subscriptions.push(launchTerminalCommand);
  context.subscriptions.push(runCommandCommand);
  context.subscriptions.push(registerTaskCommand);
  context.subscriptions.push(listContainersCommand);
  context.subscriptions.push(terminateAllContainersCommand);
  context.subscriptions.push(cleanupOrphanedCommand);
  context.subscriptions.push(runFuzzingTestsCommand);

  // Register check Docker command (not shown in command palette)
  let checkDockerCommand = vscode.commands.registerCommand(
    "codeforge.checkDocker",
    async function () {
      const config = vscode.workspace.getConfiguration("codeforge");
      const dockerCommand = config.get("dockerCommand", "docker");
      const available =
        await dockerOperations.checkDockerAvailable(dockerCommand);
      if (available) {
        vscode.window.showInformationMessage(
          "CodeForge: Docker is installed and running properly!",
        );
      } else {
        vscode.window.showErrorMessage(
          "CodeForge: Docker is not available. Please ensure Docker is installed and running.",
        );
      }
    },
  );
  context.subscriptions.push(checkDockerCommand);
}

/**
 * Automatically initializes the .codeforge directory when the extension is activated
 * This function runs silently and only creates the directory/Dockerfile if they don't exist
 */
async function initializeCodeForgeOnActivation() {
  try {
    // Check if there's an open workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      // No workspace open, silently skip initialization
      safeOutputLog(
        "No workspace folder open, skipping automatic initialization",
      );
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const codeforgeDir = path.join(workspacePath, ".codeforge");
    const dockerfilePath = path.join(codeforgeDir, "Dockerfile");

    // Check if .codeforge directory exists
    let dirExists = false;
    try {
      await fs.access(codeforgeDir);
      dirExists = true;
    } catch (error) {
      // Directory doesn't exist
      dirExists = false;
    }

    // Check if Dockerfile exists
    let dockerfileExists = false;
    if (dirExists) {
      try {
        await fs.access(dockerfilePath);
        dockerfileExists = true;
      } catch (error) {
        // Dockerfile doesn't exist
        dockerfileExists = false;
      }
    }

    // If both directory and Dockerfile exist, nothing to do
    if (dirExists && dockerfileExists) {
      safeOutputLog(
        "CodeForge already initialized, skipping automatic initialization",
      );
      return;
    }

    // Create .codeforge directory if it doesn't exist
    if (!dirExists) {
      await fs.mkdir(codeforgeDir, { recursive: true });
      safeOutputLog(`Auto-created .codeforge directory: ${codeforgeDir}`);
    }

    // Create Dockerfile if it doesn't exist
    if (!dockerfileExists) {
      await fs.writeFile(dockerfilePath, DOCKERFILE_CONTENT);
      safeOutputLog(`Auto-created Dockerfile: ${dockerfilePath}`);

      // Show a subtle notification that initialization occurred
      vscode.window.showInformationMessage(
        "CodeForge: Initialized .codeforge directory with Dockerfile",
      );
    }
  } catch (error) {
    // Log the error but don't show an error message to avoid disrupting the user
    outputChannel.appendLine(
      `Error during automatic initialization: ${error.message}`,
    );
    // Silently fail - the user can still manually initialize if needed
  }
}

/**
 * Ensures that CodeForge is initialized and the Docker image is built
 * @param {string} workspacePath - The path to the workspace
 * @param {string} containerName - The name of the container/image
 * @returns {Promise<boolean>} True if everything is ready, false otherwise
 */
async function ensureInitializedAndBuilt(workspacePath, containerName) {
  try {
    const dockerfilePath = path.join(workspacePath, ".codeforge", "Dockerfile");

    // Check if Dockerfile exists
    let dockerfileExists = false;
    try {
      await fs.access(dockerfilePath);
      dockerfileExists = true;
    } catch (error) {
      // Dockerfile doesn't exist
      dockerfileExists = false;
    }

    // If Dockerfile doesn't exist, automatically initialize
    if (!dockerfileExists) {
      safeOutputLog(
        "CodeForge: Dockerfile not found. Automatically initializing...",
        true,
      );

      // Create .codeforge directory
      const codeforgeDir = path.join(workspacePath, ".codeforge");
      await fs.mkdir(codeforgeDir, { recursive: true });
      outputChannel.appendLine(`Created directory: ${codeforgeDir}`);

      // Write Dockerfile
      await fs.writeFile(dockerfilePath, DOCKERFILE_CONTENT);
      outputChannel.appendLine(`Created Dockerfile: ${dockerfilePath}`);

      vscode.window.showInformationMessage(
        "CodeForge: Automatically initialized .codeforge directory",
      );
    }

    // Check if Docker image exists
    const imageExists = await dockerOperations.checkImageExists(containerName);

    // If image doesn't exist, automatically build it
    if (!imageExists) {
      safeOutputLog(
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
            outputChannel.appendLine(
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
        outputChannel.appendLine("Error: Docker image build failed");
        vscode.window.showErrorMessage(
          "CodeForge: Failed to build Docker image automatically",
        );
        return false;
      }
    }

    return true;
  } catch (error) {
    outputChannel.appendLine(
      `Error in ensureInitializedAndBuilt: ${error.message}`,
    );
    outputChannel.show();
    vscode.window.showErrorMessage(
      `CodeForge: Failed to initialize/build automatically - ${error.message}`,
    );
    return false;
  }
}

async function deactivate() {
  // Clean up resources
  try {
    // Optionally terminate all containers on deactivation
    const config = vscode.workspace.getConfiguration("codeforge");
    const terminateOnDeactivate = config.get(
      "terminateContainersOnDeactivate",
      true,
    );

    if (terminateOnDeactivate) {
      const containers = await dockerOperations.getActiveContainers();
      if (containers.length > 0) {
        console.log(
          `Terminating ${containers.length} container(s) on deactivation...`,
        );
        await dockerOperations.terminateAllContainers(true);
      }
    }
  } catch (error) {
    console.error(`Error during deactivation cleanup: ${error.message}`);
  }

  if (outputChannel) {
    outputChannel.dispose();
  }
}

// Export the activate and deactivate functions
// IMPORTANT: VSCode requires these exports to properly activate the extension
module.exports = {
  activate,
  deactivate,
};
