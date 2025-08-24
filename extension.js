const vscode = require("vscode");
const dockerOperations = require("./dockerOperations");
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
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log("CodeForge extension is now active!");

  // Create output channel for CodeForge
  outputChannel = vscode.window.createOutputChannel("CodeForge");
  context.subscriptions.push(outputChannel);

  // Check if Docker is available
  checkDockerAvailable().then((available) => {
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
        outputChannel.appendLine(`Created directory: ${codeforgeDir}`);

        // Write Dockerfile
        await fs.writeFile(dockerfilePath, DOCKERFILE_CONTENT);
        outputChannel.appendLine(`Created Dockerfile: ${dockerfilePath}`);

        vscode.window.showInformationMessage(
          "CodeForge: Successfully initialized .codeforge directory",
        );
        outputChannel.show();
      } catch (error) {
        outputChannel.appendLine(`Error: ${error.message}`);
        outputChannel.show();
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
        outputChannel.appendLine(`Building Docker image: ${containerName}`);
        outputChannel.show();

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
        outputChannel.appendLine(`Build failed: ${error.message}`);
        outputChannel.show();
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

        // Check if Docker image exists
        const imageExists =
          await dockerOperations.checkImageExists(containerName);
        if (!imageExists) {
          const result = await vscode.window.showWarningMessage(
            "CodeForge: Docker image not found. Would you like to build it now?",
            "Yes",
            "No",
          );
          if (result === "Yes") {
            await vscode.commands.executeCommand("codeforge.buildEnvironment");
            // Check again after build
            const imageExistsAfterBuild =
              await dockerOperations.checkImageExists(containerName);
            if (!imageExistsAfterBuild) {
              return;
            }
          } else {
            return;
          }
        }

        // Create a new terminal
        // Get configuration
        const config = vscode.workspace.getConfiguration("codeforge");
        const dockerCommand = config.get("dockerCommand", "docker");
        const workspaceMount = config.get("workspaceMount", "/workspace");
        const removeAfterRun = config.get("removeContainersAfterRun", true);
        const defaultShell = config.get("defaultShell", "/bin/bash");
        const additionalArgs = config.get("additionalDockerRunArgs", []);

        const shellArgs = ["run", "-it"];

        if (removeAfterRun) {
          shellArgs.push("--rm");
        }

        if (config.get("mountWorkspace", true)) {
          shellArgs.push("-v", `${workspacePath}:${workspaceMount}`);
          shellArgs.push("-w", workspaceMount);
        }

        shellArgs.push(...additionalArgs);
        shellArgs.push(containerName);
        shellArgs.push(defaultShell);

        const terminal = vscode.window.createTerminal({
          name: `CodeForge: ${path.basename(workspacePath)}`,
          shellPath: dockerCommand,
          shellArgs: shellArgs,
        });

        terminal.show();
        outputChannel.appendLine(
          `Launched terminal in container: ${containerName}`,
        );
      } catch (error) {
        outputChannel.appendLine(`Error: ${error.message}`);
        outputChannel.show();
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

        // Check if Docker image exists
        const imageExists =
          await dockerOperations.checkImageExists(containerName);
        if (!imageExists) {
          const result = await vscode.window.showWarningMessage(
            "CodeForge: Docker image not found. Would you like to build it now?",
            "Yes",
            "No",
          );
          if (result === "Yes") {
            await vscode.commands.executeCommand("codeforge.buildEnvironment");
            // Check again after build
            const imageExistsAfterBuild =
              await dockerOperations.checkImageExists(containerName);
            if (!imageExistsAfterBuild) {
              return;
            }
          } else {
            return;
          }
        }

        // Prompt user for command
        const command = await vscode.window.showInputBox({
          prompt: "Enter command to run in container",
          placeHolder: "e.g., ls -la, python script.py, make build",
        });

        if (!command) {
          return;
        }

        outputChannel.appendLine(`Running command in container: ${command}`);

        // Get configuration
        const config = vscode.workspace.getConfiguration("codeforge");
        const dockerCommand = config.get("dockerCommand", "docker");
        const workspaceMount = config.get("workspaceMount", "/workspace");
        const removeAfterRun = config.get("removeContainersAfterRun", true);
        const defaultShell = config.get("defaultShell", "/bin/bash");
        const additionalArgs = config.get("additionalDockerRunArgs", []);
        const showOutput = config.get("showOutputChannel", true);

        if (showOutput) {
          outputChannel.show();
        }

        // We need to spawn the process with pipe stdio to capture output
        const { spawn } = require("child_process");
        const dockerArgs = ["run"];

        if (removeAfterRun) {
          dockerArgs.push("--rm");
        }

        if (config.get("mountWorkspace", true)) {
          dockerArgs.push("-v", `${workspacePath}:${workspaceMount}`);
          dockerArgs.push("-w", workspaceMount);
        }

        dockerArgs.push(...additionalArgs);
        dockerArgs.push(containerName);
        dockerArgs.push(defaultShell, "-c", command);

        const dockerProcess = spawn(dockerCommand, dockerArgs, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        // Capture output
        dockerProcess.stdout.on("data", (data) => {
          outputChannel.append(data.toString());
        });

        dockerProcess.stderr.on("data", (data) => {
          outputChannel.append(data.toString());
        });

        dockerProcess.on("close", (code) => {
          if (code === 0) {
            outputChannel.appendLine(`\nCommand completed successfully`);
            vscode.window.showInformationMessage(
              "CodeForge: Command completed successfully",
            );
          } else {
            outputChannel.appendLine(`\nCommand failed with exit code ${code}`);
            vscode.window.showErrorMessage(
              `CodeForge: Command failed with exit code ${code}`,
            );
          }
        });

        dockerProcess.on("error", (error) => {
          outputChannel.appendLine(`\nError: ${error.message}`);
          vscode.window.showErrorMessage(
            `CodeForge: Failed to run command - ${error.message}`,
          );
        });
      } catch (error) {
        outputChannel.appendLine(`Error: ${error.message}`);
        outputChannel.show();
        vscode.window.showErrorMessage(
          `CodeForge: Failed to run command - ${error.message}`,
        );
      }
    },
  );

  // Add all commands to subscriptions
  context.subscriptions.push(initializeCommand);
  context.subscriptions.push(buildEnvironmentCommand);
  context.subscriptions.push(launchTerminalCommand);
  context.subscriptions.push(runCommandCommand);

  // Register check Docker command (not shown in command palette)
  let checkDockerCommand = vscode.commands.registerCommand(
    "codeforge.checkDocker",
    async function () {
      const available = await checkDockerAvailable();
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
 * Check if Docker is available on the system
 * @returns {Promise<boolean>} True if Docker is available, false otherwise
 */
async function checkDockerAvailable() {
  const { exec } = require("child_process");
  const { promisify } = require("util");
  const execAsync = promisify(exec);

  try {
    const config = vscode.workspace.getConfiguration("codeforge");
    const dockerCommand = config.get("dockerCommand", "docker");

    await execAsync(`${dockerCommand} --version`);
    // Also check if Docker daemon is running
    await execAsync(`${dockerCommand} ps`);
    return true;
  } catch (error) {
    outputChannel.appendLine(`Docker check failed: ${error.message}`);
    return false;
  }
}

function deactivate() {
  console.log("CodeForge extension is now deactivated");
  if (outputChannel) {
    outputChannel.dispose();
  }
}

module.exports = {
  activate,
  deactivate,
};
