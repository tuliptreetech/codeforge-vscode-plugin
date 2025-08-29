const vscode = require("vscode");
const dockerOperations = require("./dockerOperations");
const path = require("path");
const fs = require("fs").promises;

/**
 * CodeForge Task Provider
 * Provides tasks that run commands inside Docker containers
 */
class CodeForgeTaskProvider {
  constructor(context, outputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
    this._tasks = [];
  }

  /**
   * VSCode calls this to get all available tasks
   * @returns {vscode.Task[]} Array of available tasks
   */
  async provideTasks() {
    // Get the workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    // Return a sample task to ensure the provider is recognized
    // This helps VSCode recognize that codeforge tasks are available
    const sampleTask = this.createTask(
      "CodeForge: Sample Task",
      "CodeForge: Sample Task",
      'echo "Hello from CodeForge! Configure your tasks in .vscode/tasks.json"',
      workspaceFolder,
      "Sample task - configure your own tasks in .vscode/tasks.json",
      {
        type: "codeforge",
        label: "CodeForge: Sample Task",
        command:
          'echo "Hello from CodeForge! Configure your tasks in .vscode/tasks.json"',
      },
    );

    // IMPORTANT: Users should configure their own tasks in .vscode/tasks.json
    // Example tasks.json configuration:
    // {
    //     "version": "2.0.0",
    //     "tasks": [
    //         {
    //             "type": "codeforge",
    //             "label": "Run in Container",
    //             "command": "your-command-here",
    //             "problemMatcher": []
    //         }
    //     ]
    // }

    return [sampleTask];
  }

  /**
   * VSCode calls this to resolve a task (fill in its execution details)
   * This method handles user-defined tasks from .vscode/tasks.json
   * @param {vscode.Task} task - The task to resolve
   * @returns {vscode.Task|undefined} The resolved task
   */
  async resolveTask(task) {
    const definition = task.definition;

    // Only handle our task type
    if (definition.type !== "codeforge") {
      return undefined;
    }

    // Ensure the task has a command property - this is required for CodeForge tasks
    if (!definition.command) {
      const errorMsg =
        'CodeForge task is missing required "command" property. ' +
        'Please add a "command" property to your task in .vscode/tasks.json';

      vscode.window.showErrorMessage(errorMsg);
      return undefined;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    try {
      task.scope instanceof vscode.WorkspaceFolder;
      workspaceFolder = task.scope;
    } catch (e) {}
    if (!workspaceFolder) {
      return undefined;
    }

    // Create the resolved task with the user-defined configuration
    const resolvedTask = this.createTask(
      task.name,
      definition.label || task.name,
      definition.command,
      workspaceFolder,
      definition.detail ||
        task.detail ||
        `Run '${definition.command}' in container`,
      definition,
    );

    return resolvedTask;
  }

  /**
   * Creates a CodeForge task
   * @param {string} name - Task name
   * @param {string} label - Task label
   * @param {string} command - Command to run in container
   * @param {vscode.WorkspaceFolder} workspaceFolder - Workspace folder
   * @param {string} detail - Task description
   * @param {object} definition - Task definition
   * @returns {vscode.Task} The created task
   */
  createTask(name, label, command, workspaceFolder, detail, definition) {
    // Create or use provided definition
    const taskDefinition = definition || {
      type: "codeforge",
      label: label,
      command: command,
    };

    // Create the task
    const task = new vscode.Task(
      taskDefinition,
      workspaceFolder,
      name,
      "codeforge",
      new vscode.CustomExecution(async () => {
        return new CodeForgeTaskTerminal(
          workspaceFolder.uri.fsPath,
          taskDefinition,
          this.outputChannel,
        );
      }),
      [],
    );

    task.detail = detail;
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Shared, // Changed from New to Shared to reuse the same panel
      clear: false, // Don't clear the terminal, we want to append
      echo: true,
      focus: true, // Focus the terminal when task starts
    };

    return task;
  }
}

/**
 * Custom terminal implementation for CodeForge tasks
 */
class CodeForgeTaskTerminal {
  constructor(workspacePath, definition, outputChannel) {
    this.workspacePath = workspacePath;
    this.definition = definition;
    this.outputChannel = outputChannel;
    this.command = definition.command || "/bin/bash";
    this.writeEmitter = new vscode.EventEmitter();
    this.closeEmitter = new vscode.EventEmitter();
    this.dockerProcess = null;
    this.taskStartTime = null;
  }

  get onDidWrite() {
    return this.writeEmitter.event;
  }

  get onDidClose() {
    return this.closeEmitter.event;
  }

  async open(initialDimensions) {
    try {
      // Record task start time
      this.taskStartTime = new Date();

      // Get configuration
      const config = vscode.workspace.getConfiguration("codeforge");
      const dockerCommand = config.get("dockerCommand", "docker");
      const removeAfterRun = config.get("removeContainersAfterRun", true);
      const defaultShell = config.get("defaultShell", "/bin/bash");
      const additionalArgs = config.get("additionalDockerRunArgs", []);
      const mountWorkspace = config.get("mountWorkspace", true);

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

      // Prepare the command
      let finalCommand = this.command;

      // Check if this is an interactive shell task
      const isInteractive =
        this.definition.interactive ||
        this.command === "/bin/bash" ||
        this.command === "/bin/sh" ||
        this.command === "bash" ||
        this.command === "sh";

      const runMessage = `CodeForge: Running command in container: ${this.command}`;
      const containerMessage = `Container: ${containerName}`;
      this.writeEmitter.fire(`\x1b[36m${runMessage}\x1b[0m\r\n`);
      this.writeEmitter.fire(`\x1b[90m${containerMessage}\x1b[0m\r\n\r\n`);

      if (isInteractive) {
        // For interactive shells, we need to use a different approach
        // We'll create a terminal instead of using the task system
        const interactiveMessage =
          'Note: For interactive shells, please use "CodeForge: Launch Terminal in Container" command instead.';
        this.writeEmitter.fire(`\x1b[33m${interactiveMessage}\x1b[0m\r\n`);
        this.closeEmitter.fire(0);
        return;
      }

      // Run the command using dockerOperations
      this.dockerProcess = dockerOperations.runDockerCommandWithOutput(
        this.workspacePath,
        containerName,
        finalCommand,
        defaultShell,
        {
          removeAfterRun: removeAfterRun,
          additionalArgs: additionalArgs,
          dockerCommand: dockerCommand,
          mountWorkspace: mountWorkspace,
        },
      );

      // Handle stdout
      this.dockerProcess.stdout.on("data", (data) => {
        // Convert buffer to string and handle line endings for terminal
        const output = data.toString();
        const terminalOutput = output.replace(/\n/g, "\r\n");
        this.writeEmitter.fire(terminalOutput);
      });

      // Handle stderr
      this.dockerProcess.stderr.on("data", (data) => {
        // Convert buffer to string and handle line endings for terminal
        const output = data.toString();
        const terminalOutput = output.replace(/\n/g, "\r\n");
        this.writeEmitter.fire(`\x1b[31m${terminalOutput}\x1b[0m`);
      });

      // Handle process close
      this.dockerProcess.on("close", (code) => {
        let message;
        const endTime = new Date();
        const duration = ((endTime - this.taskStartTime) / 1000).toFixed(2);

        if (code === 0) {
          message = "Task completed successfully";
          this.writeEmitter.fire(`\r\n\x1b[32m${message}\x1b[0m\r\n`);
        } else {
          message = `Task failed with exit code ${code}`;
          this.writeEmitter.fire(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
        }

        this.closeEmitter.fire(code || 0);
      });

      // Handle process error
      this.dockerProcess.on("error", (error) => {
        const errorMessage = `Error: ${error.message}`;
        this.writeEmitter.fire(`\r\n\x1b[31m${errorMessage}\x1b[0m\r\n`);

        this.closeEmitter.fire(1);
      });
    } catch (error) {
      const errorMessage = `Error: ${error.message}`;
      this.writeEmitter.fire(`\r\n\x1b[31m${errorMessage}\x1b[0m\r\n`);

      this.closeEmitter.fire(1);
    }
  }

  close() {
    // Kill the Docker process if it's still running
    if (this.dockerProcess && !this.dockerProcess.killed) {
      this.dockerProcess.kill();
    }
  }

  handleInput(data) {
    // For non-interactive tasks, we typically don't handle input
    // But we could forward it to the process if needed
    if (this.dockerProcess && !this.dockerProcess.killed) {
      this.dockerProcess.stdin.write(data);
    }
  }

  setDimensions(dimensions) {
    // Terminal dimensions changed - we could handle this if needed
    // For Docker containers, this typically doesn't matter for non-interactive tasks
  }
}

module.exports = {
  CodeForgeTaskProvider,
  CodeForgeTaskTerminal,
};
