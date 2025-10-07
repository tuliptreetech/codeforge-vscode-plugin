const vscode = require("vscode");
const dockerOperations = require("./core/dockerOperations");
const { ResourceManager } = require("./core/resourceManager");
const { CodeForgeTaskProvider } = require("./tasks/taskProvider");
const { CodeForgeWebviewProvider } = require("./ui/webviewProvider");
const { CodeForgeCommandHandlers } = require("./ui/commandHandlers");
const { HexDocumentProvider } = require("./ui/hexDocumentProvider");
const { CorpusDocumentProvider } = require("./ui/corpusDocumentProvider");
const fs = require("fs").promises;
const path = require("path");

let outputChannel;

// Module-level storage for provider references
let webviewProvider = null;

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
  console.log("CodeForge: Extension activation started");

  // Create output channel for CodeForge
  outputChannel = vscode.window.createOutputChannel("CodeForge");
  context.subscriptions.push(outputChannel);

  safeOutputLog("CodeForge: Extension activation started", false);

  // Initialize ResourceManager
  try {
    resourceManager = new ResourceManager(context.extensionPath);
    safeOutputLog("CodeForge: ✓ ResourceManager initialized successfully");
  } catch (error) {
    vscode.window.showErrorMessage(
      `CodeForge: Failed to initialize ResourceManager - ${error.message}`,
    );
    safeOutputLog(
      `CRITICAL: Failed to initialize ResourceManager: ${error.message}`,
      true,
    );
    return; // Cannot continue without ResourceManager
  }

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

  // Register the webview provider
  try {
    webviewProvider = new CodeForgeWebviewProvider(context, resourceManager);
    const webviewProviderDisposable = vscode.window.registerWebviewViewProvider(
      "codeforge.controlPanel",
      webviewProvider,
    );

    if (!webviewProviderDisposable) {
      throw new Error("Failed to create webview provider disposable");
    }

    context.subscriptions.push(webviewProviderDisposable);

    safeOutputLog("CodeForge: ✓ Webview provider stored in module variable");
  } catch (error) {
    vscode.window.showErrorMessage(
      `CodeForge: Failed to register webview provider - ${error.message}`,
    );
  }

  // Register the crash report document provider for read-only crash file viewing
  try {
    const hexDocumentProvider = new HexDocumentProvider();
    const hexProviderDisposable =
      vscode.workspace.registerTextDocumentContentProvider(
        "codeforge-crash",
        hexDocumentProvider,
      );

    if (!hexProviderDisposable) {
      throw new Error(
        "Failed to create crash report document provider disposable",
      );
    }

    context.subscriptions.push(hexProviderDisposable);
    safeOutputLog(
      "CodeForge: ✓ Crash report document provider registered successfully",
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `CodeForge: Failed to register crash report document provider - ${error.message}`,
    );
  }

  // Register the corpus document provider for read-only corpus file viewing
  try {
    const corpusDocumentProvider = new CorpusDocumentProvider();
    const corpusProviderDisposable =
      vscode.workspace.registerTextDocumentContentProvider(
        "codeforge-corpus",
        corpusDocumentProvider,
      );

    if (!corpusProviderDisposable) {
      throw new Error("Failed to create corpus document provider disposable");
    }

    context.subscriptions.push(corpusProviderDisposable);
    safeOutputLog(
      "CodeForge: ✓ Corpus document provider registered successfully",
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `CodeForge: Failed to register corpus document provider - ${error.message}`,
    );
  }

  // Create command handlers instance AFTER providers are stored in module variables
  // This ensures that all providers are available when commands are executed
  safeOutputLog("CodeForge: Starting command handlers registration...");
  try {
    safeOutputLog("CodeForge: Creating CodeForgeCommandHandlers instance...");
    const commandHandlers = new CodeForgeCommandHandlers(
      context,
      outputChannel,
      webviewProvider,
      resourceManager,
    );

    // Verify provider state before registering commands
    safeOutputLog(
      `CodeForge: Provider verification - webviewProvider: ${webviewProvider ? "PRESENT" : "NULL"}`,
    );

    // Register all command handlers from the command handlers module
    safeOutputLog("CodeForge: Getting command handlers map...");
    const handlers = commandHandlers.getCommandHandlers();
    safeOutputLog(
      `CodeForge: Found ${Object.keys(handlers).length} command handlers to register`,
    );

    for (const [commandName, handler] of Object.entries(handlers)) {
      safeOutputLog(`CodeForge: Registering command: ${commandName}`);
      const command = vscode.commands.registerCommand(commandName, handler);
      context.subscriptions.push(command);
    }

    safeOutputLog("CodeForge: ✓ All command handlers registered successfully");
  } catch (error) {
    console.error("CodeForge: Command handlers registration failed:", error);
    safeOutputLog(
      `CRITICAL: Failed to register command handlers: ${error.message}`,
      true,
    );
    safeOutputLog(`Error stack: ${error.stack}`, false);
    vscode.window.showErrorMessage(
      `CodeForge: Failed to register command handlers - ${error.message}`,
    );
  }

  // Trigger initialization status check in webview after providers are ready
  setTimeout(() => {
    if (webviewProvider && webviewProvider._checkInitializationStatus) {
      webviewProvider._checkInitializationStatus();
    }
  }, 500);

  // Run fuzzer discovery asynchronously after extension activation
  runInitialFuzzerDiscovery();

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

  // Register the register task command (keeping this one as it's not in the command handlers)
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
        safeOutputLog(`Error registering task: ${error.message}`, false);
        vscode.window.showErrorMessage(
          `CodeForge: Failed to register task - ${error.message}`,
        );
      }
    },
  );

  // Add registerTask command to subscriptions (keeping this one as it's not in the command handlers)
  context.subscriptions.push(registerTaskCommand);

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
      try {
        await resourceManager.dumpDockerfile(codeforgeDir);
        outputChannel.appendLine(`Created Dockerfile: ${dockerfilePath}`);
      } catch (error) {
        outputChannel.appendLine(`Error creating Dockerfile: ${error.message}`);
        throw error;
      }

      // Write .gitignore
      try {
        await resourceManager.dumpGitignore(codeforgeDir);
        const gitignorePath = path.join(codeforgeDir, ".gitignore");
        outputChannel.appendLine(`Created .gitignore: ${gitignorePath}`);
      } catch (error) {
        outputChannel.appendLine(`Error creating .gitignore: ${error.message}`);
        throw error;
      }
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
    // Don't automatically show output window - users can access it manually
    vscode.window.showErrorMessage(
      `CodeForge: Failed to initialize/build automatically - ${error.message}`,
    );
    return false;
  }
}
/**
 * Runs initial fuzzer discovery asynchronously after extension activation
 * This ensures fuzzers are available immediately when the webview is opened
 */
async function runInitialFuzzerDiscovery() {
  try {
    // Check if there's an open workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      safeOutputLog(
        "No workspace folder open, skipping initial fuzzer discovery",
      );
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const codeforgeDir = path.join(workspacePath, ".codeforge");

    // Check if .codeforge directory exists
    try {
      await fs.access(codeforgeDir);
    } catch (error) {
      // .codeforge directory doesn't exist yet, skip fuzzer discovery
      safeOutputLog(
        "CodeForge directory not found, skipping initial fuzzer discovery",
      );
      return;
    }

    // Run fuzzer discovery asynchronously without blocking extension activation
    setTimeout(async () => {
      try {
        if (webviewProvider) {
          safeOutputLog("Running initial fuzzer discovery...");

          // Use the command handler to refresh fuzzers
          const { CodeForgeCommandHandlers } = require("./ui/commandHandlers");
          const commandHandlers = new CodeForgeCommandHandlers(
            null, // context not needed for this operation
            outputChannel,
            webviewProvider,
            resourceManager,
          );

          await commandHandlers.handleRefreshFuzzers();
          safeOutputLog("Initial fuzzer discovery completed");
        }
      } catch (error) {
        safeOutputLog(
          `Error during initial fuzzer discovery: ${error.message}`,
        );
        // Don't show error to user as this is a background operation
      }
    }, 1000); // Delay to ensure extension is fully activated
  } catch (error) {
    safeOutputLog(
      `Error setting up initial fuzzer discovery: ${error.message}`,
    );
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
  runInitialFuzzerDiscovery,
  runInitialCrashDiscovery: runInitialFuzzerDiscovery, // Backward compatibility
};
