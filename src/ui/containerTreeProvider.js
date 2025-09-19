const vscode = require("vscode");
const dockerOperations = require("../core/dockerOperations");

/**
 * Tree item representing a container
 */
class ContainerTreeItem extends vscode.TreeItem {
  constructor(container) {
    super(container.name, vscode.TreeItemCollapsibleState.None);

    this.container = container;
    this.tooltip = this._generateTooltip(container);
    this.description = this._generateDescription(container);
    this.contextValue = "container";

    // Set icon based on container status
    this.iconPath = new vscode.ThemeIcon(
      container.status === "running" ? "play-circle" : "stop-circle",
    );
  }

  _generateTooltip(container) {
    return (
      `Container: ${container.name}\n` +
      `Status: ${container.status}\n` +
      `Image: ${container.image}\n` +
      `Created: ${container.created}\n` +
      `Type: ${container.type || "unknown"}`
    );
  }

  _generateDescription(container) {
    const status = container.status === "running" ? "●" : "○";
    const type = container.type ? `[${container.type}]` : "";
    return `${status} ${type}`;
  }
}

/**
 * CodeForge Container Tree Data Provider
 * Manages the tree view of active containers
 */
class CodeForgeContainerTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._containers = [];
    this._isLoading = false;
  }

  /**
   * Get tree item for a given element
   */
  getTreeItem(element) {
    return element;
  }

  /**
   * Get children for a given element (or root if element is undefined)
   */
  async getChildren(element) {
    if (element) {
      // No children for container items
      return [];
    }

    // Return root level items (containers)
    try {
      if (this._isLoading) {
        return [
          new vscode.TreeItem(
            "Loading containers...",
            vscode.TreeItemCollapsibleState.None,
          ),
        ];
      }

      if (this._containers.length === 0) {
        const noContainersItem = new vscode.TreeItem(
          "No active containers",
          vscode.TreeItemCollapsibleState.None,
        );
        noContainersItem.description = "Click refresh to check again";
        noContainersItem.iconPath = new vscode.ThemeIcon("info");
        return [noContainersItem];
      }

      return this._containers.map(
        (container) => new ContainerTreeItem(container),
      );
    } catch (error) {
      console.error("Error getting container children:", error);
      const errorItem = new vscode.TreeItem(
        "Error loading containers",
        vscode.TreeItemCollapsibleState.None,
      );
      errorItem.description = error.message;
      errorItem.iconPath = new vscode.ThemeIcon("error");
      return [errorItem];
    }
  }

  /**
   * Refresh the container list
   */
  async refresh() {
    try {
      console.log("CodeForge: Starting container refresh...");
      this._isLoading = true;
      this._onDidChangeTreeData.fire();

      // Get active containers from dockerOperations
      console.log(
        "CodeForge: Calling dockerOperations.getActiveContainers()...",
      );
      const containers = await dockerOperations.getActiveContainers();
      console.log(
        `CodeForge: Found ${containers.length} tracked containers:`,
        containers,
      );

      // Transform container data for tree view
      this._containers = containers.map((container) => ({
        name: container.name || container.id,
        status: container.running ? "running" : "stopped",
        image: container.image || "unknown",
        created: container.createdAt
          ? new Date(container.createdAt).toLocaleString()
          : "unknown",
        type: container.type || "container",
        id: container.id,
      }));

      console.log(
        `CodeForge: Transformed ${this._containers.length} containers for tree view`,
      );
      this._isLoading = false;
      this._onDidChangeTreeData.fire();
      console.log("CodeForge: Container refresh completed successfully");
    } catch (error) {
      console.error("CodeForge: Error refreshing containers:", error);
      this._isLoading = false;
      this._containers = [];
      this._onDidChangeTreeData.fire();

      // Show error message to user
      vscode.window.showErrorMessage(
        `Failed to refresh containers: ${error.message}`,
      );
    }
  }

  /**
   * Get container by tree item
   */
  getContainer(treeItem) {
    if (treeItem instanceof ContainerTreeItem) {
      return treeItem.container;
    }
    return null;
  }

  /**
   * Terminate a specific container
   */
  async terminateContainer(treeItem) {
    const container = this.getContainer(treeItem);
    if (!container) {
      vscode.window.showErrorMessage("Invalid container selection");
      return;
    }

    try {
      const result = await vscode.window.showWarningMessage(
        `Are you sure you want to terminate container "${container.name}"?`,
        { modal: true },
        "Yes",
        "No",
      );

      if (result !== "Yes") {
        return;
      }

      // Use dockerOperations to stop the container
      await dockerOperations.stopContainer(container.id, true);

      vscode.window.showInformationMessage(
        `Container "${container.name}" terminated successfully`,
      );

      // Refresh the tree view
      await this.refresh();
    } catch (error) {
      console.error("Error terminating container:", error);
      vscode.window.showErrorMessage(
        `Failed to terminate container: ${error.message}`,
      );
    }
  }

  /**
   * Show container logs
   */
  async showContainerLogs(treeItem) {
    const container = this.getContainer(treeItem);
    if (!container) {
      vscode.window.showErrorMessage("Invalid container selection");
      return;
    }

    try {
      const config = vscode.workspace.getConfiguration("codeforge");
      const dockerCommand = config.get("dockerCommand", "docker");

      // Create a new terminal to show logs
      const terminal = vscode.window.createTerminal({
        name: `Logs: ${container.name}`,
        shellPath: dockerCommand,
        shellArgs: ["logs", "-f", container.id],
      });

      terminal.show();
    } catch (error) {
      console.error("Error showing container logs:", error);
      vscode.window.showErrorMessage(
        `Failed to show container logs: ${error.message}`,
      );
    }
  }

  /**
   * Connect to container shell
   */
  async connectToContainer(treeItem) {
    const container = this.getContainer(treeItem);
    if (!container) {
      vscode.window.showErrorMessage("Invalid container selection");
      return;
    }

    try {
      const config = vscode.workspace.getConfiguration("codeforge");
      const dockerCommand = config.get("dockerCommand", "docker");
      const defaultShell = config.get("defaultShell", "/bin/bash");

      // Create a new terminal to connect to the container
      const terminal = vscode.window.createTerminal({
        name: `Shell: ${container.name}`,
        shellPath: dockerCommand,
        shellArgs: ["exec", "-it", container.id, defaultShell],
      });

      terminal.show();
    } catch (error) {
      console.error("Error connecting to container:", error);
      vscode.window.showErrorMessage(
        `Failed to connect to container: ${error.message}`,
      );
    }
  }

  /**
   * Inspect container details
   */
  async inspectContainer(treeItem) {
    const container = this.getContainer(treeItem);
    if (!container) {
      vscode.window.showErrorMessage("Invalid container selection");
      return;
    }

    try {
      const config = vscode.workspace.getConfiguration("codeforge");
      const dockerCommand = config.get("dockerCommand", "docker");

      // Use docker inspect command to get container details
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);

      try {
        const { stdout } = await execAsync(
          `${dockerCommand} inspect ${container.id}`,
        );
        const details = JSON.parse(stdout);

        // Create a new document to show the details
        const doc = await vscode.workspace.openTextDocument({
          content: JSON.stringify(details, null, 2),
          language: "json",
        });

        await vscode.window.showTextDocument(doc);
      } catch (inspectError) {
        throw new Error(`Failed to inspect container: ${inspectError.message}`);
      }
    } catch (error) {
      console.error("Error inspecting container:", error);
      vscode.window.showErrorMessage(
        `Failed to inspect container: ${error.message}`,
      );
    }
  }

  /**
   * Get the current container count
   */
  getContainerCount() {
    return this._containers.length;
  }

  /**
   * Check if containers are currently loading
   */
  isLoading() {
    return this._isLoading;
  }

  /**
   * Dispose of the tree provider
   */
  dispose() {
    this._onDidChangeTreeData.dispose();
  }
}

module.exports = { CodeForgeContainerTreeProvider, ContainerTreeItem };
