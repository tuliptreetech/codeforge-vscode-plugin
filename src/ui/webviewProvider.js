const vscode = require("vscode");
const path = require("path");
const fs = require("fs").promises;
const dockerOperations = require("../core/dockerOperations");

/**
 * CodeForge Webview View Provider
 * Manages the webview panel in the activity bar
 */
class CodeForgeWebviewProvider {
  constructor(context) {
    this._context = context;
    this._view = undefined;
    this._currentState = {
      isInitialized: false,
      isBuilt: false,
      containerCount: 0,
      isLoading: false,
    };

    // Bind methods to preserve 'this' context
    this.resolveWebviewView = this.resolveWebviewView.bind(this);
    this._handleMessage = this._handleMessage.bind(this);
    this._updateState = this._updateState.bind(this);
  }

  /**
   * Called when the webview view is first created
   */
  resolveWebviewView(webviewView, context, token) {
    this._view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this._context.extensionPath, "src", "ui")),
      ],
    };

    // Set initial HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(this._handleMessage);

    // Handle webview disposal
    webviewView.onDidDispose(() => {
      this._view = undefined;
    });

    // Initial state update
    this._detectAndUpdateState();
  }

  /**
   * Handle messages from the webview
   */
  async _handleMessage(message) {
    if (!this._view) return;

    try {
      switch (message.type) {
        case "command":
          await this._executeCommand(message.command);
          break;
        case "requestState":
          await this._detectAndUpdateState();
          break;
        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error("Error handling webview message:", error);
      this._sendMessage({
        type: "error",
        message: error.message,
      });
    }
  }

  /**
   * Execute a command from the webview
   */
  async _executeCommand(command) {
    try {
      // Map webview commands to VSCode commands
      const commandMap = {
        initialize: "codeforge.initialize",
        buildEnvironment: "codeforge.buildEnvironment",
        launchTerminal: "codeforge.launchTerminal",
        runFuzzingTests: "codeforge.runFuzzingTests",
        listContainers: "codeforge.listContainers",
        runCommand: "codeforge.runCommand",
        terminateAllContainers: "codeforge.terminateAllContainers",
        cleanupOrphaned: "codeforge.cleanupOrphaned",
        refreshContainers: "codeforge.refreshContainers",
      };

      const vscodeCommand = commandMap[command];
      if (!vscodeCommand) {
        throw new Error(`Unknown command: ${command}`);
      }

      // Execute the VSCode command
      await vscode.commands.executeCommand(vscodeCommand);

      // Send success message
      this._sendMessage({
        type: "commandComplete",
        success: true,
        command: command,
      });

      // Update state after command execution
      setTimeout(() => this._detectAndUpdateState(), 1000);
    } catch (error) {
      console.error(`Error executing command ${command}:`, error);
      this._sendMessage({
        type: "commandComplete",
        success: false,
        command: command,
        error: error.message,
      });
    }
  }

  /**
   * Detect current project state and update the webview
   */
  async _detectAndUpdateState() {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        this._updateState({
          isInitialized: false,
          isBuilt: false,
          containerCount: 0,
        });
        return;
      }

      const workspacePath = workspaceFolder.uri.fsPath;
      const codeforgeDir = path.join(workspacePath, ".codeforge");
      const dockerfilePath = path.join(codeforgeDir, "Dockerfile");

      // Check if CodeForge is initialized
      let isInitialized = false;
      try {
        await fs.access(dockerfilePath);
        isInitialized = true;
      } catch (error) {
        // Dockerfile doesn't exist
      }

      // Check if Docker image is built
      let isBuilt = false;
      if (isInitialized) {
        try {
          const containerName =
            dockerOperations.generateContainerName(workspacePath);
          const config = vscode.workspace.getConfiguration("codeforge");
          const dockerCommand = config.get("dockerCommand", "docker");

          // Check if image exists
          isBuilt = await dockerOperations.checkImageExists(
            containerName,
            dockerCommand,
          );
        } catch (error) {
          console.warn("Error checking Docker image:", error);
        }
      }

      // Get active container count
      let containerCount = 0;
      try {
        const containers = await dockerOperations.getActiveContainers();
        containerCount = containers.length;
      } catch (error) {
        console.warn("Error getting container count:", error);
      }

      // Update state
      this._updateState({
        isInitialized,
        isBuilt,
        containerCount,
      });
    } catch (error) {
      console.error("Error detecting project state:", error);
    }
  }

  /**
   * Update the current state and notify the webview
   */
  _updateState(newState) {
    this._currentState = { ...this._currentState, ...newState };
    this._sendMessage({
      type: "stateUpdate",
      state: this._currentState,
    });
  }

  /**
   * Send a message to the webview
   */
  _sendMessage(message) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  /**
   * Generate HTML content for the webview
   */
  _getHtmlForWebview(webview) {
    // Get URIs for CSS and JS files
    const cssUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this._context.extensionPath, "src", "ui", "webview.css"),
      ),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this._context.extensionPath, "src", "ui", "webview.js"),
      ),
    );

    // Generate nonce for security
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>CodeForge Control Panel</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body>
    <div class="container">
        <!-- Project Status Section -->
        <section class="status-section">
            <h2>Project Status</h2>
            <div class="status-grid">
                <div class="status-item">
                    <span class="status-label">CodeForge:</span>
                    <span class="status-value" id="codeforge-status">Not Initialized</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Docker Image:</span>
                    <span class="status-value" id="docker-status">Not Built</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Active Containers:</span>
                    <span class="status-value" id="container-count">0</span>
                </div>
            </div>
        </section>

        <!-- Quick Actions Section -->
        <section class="actions-section">
            <h2>Quick Actions</h2>
            <div class="button-grid">
                <button class="action-btn primary" id="initialize-btn">
                    <span class="btn-icon">🚀</span>
                    <span class="btn-text">Initialize CodeForge</span>
                </button>
                <button class="action-btn secondary" id="build-btn" disabled>
                    <span class="btn-icon">🔨</span>
                    <span class="btn-text">Build Docker Environment</span>
                </button>
                <button class="action-btn secondary" id="terminal-btn" disabled>
                    <span class="btn-icon">💻</span>
                    <span class="btn-text">Launch Terminal</span>
                </button>
                <button class="action-btn tertiary" id="fuzzing-btn" disabled>
                    <span class="btn-icon">🧪</span>
                    <span class="btn-text">Run Fuzzing Tests</span>
                </button>
            </div>
        </section>

        <!-- Advanced Operations Section -->
        <section class="advanced-section">
            <h2>Advanced Operations</h2>
            <div class="button-grid">
                <button class="action-btn outline" id="list-containers-btn">
                    <span class="btn-icon">📋</span>
                    <span class="btn-text">List Containers</span>
                </button>
                <button class="action-btn outline" id="run-command-btn" disabled>
                    <span class="btn-icon">⚡</span>
                    <span class="btn-text">Run Command</span>
                </button>
                <button class="action-btn danger" id="terminate-all-btn">
                    <span class="btn-icon">🛑</span>
                    <span class="btn-text">Terminate All</span>
                </button>
                <button class="action-btn outline" id="cleanup-btn">
                    <span class="btn-icon">🧹</span>
                    <span class="btn-text">Cleanup Orphaned</span>
                </button>
            </div>
        </section>

        <!-- Loading Overlay -->
        <div class="loading-overlay" id="loading-overlay" style="display: none;">
            <div class="loading-spinner"></div>
            <div class="loading-text" id="loading-text">Processing...</div>
        </div>
    </div>

    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  /**
   * Generate a random nonce for CSP
   */
  _getNonce() {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Refresh the webview state (called externally)
   */
  refresh() {
    this._detectAndUpdateState();
  }

  /**
   * Dispose of the webview provider
   */
  dispose() {
    if (this._view) {
      this._view = undefined;
    }
  }
}

module.exports = { CodeForgeWebviewProvider };
