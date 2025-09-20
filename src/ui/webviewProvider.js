const vscode = require("vscode");
const path = require("path");
const fs = require("fs").promises;
const dockerOperations = require("../core/dockerOperations");
const { CrashDiscoveryService } = require("../fuzzing/crashDiscoveryService");

/**
 * CodeForge Webview View Provider
 * Manages the webview panel in the activity bar
 */
class CodeForgeWebviewProvider {
  constructor(context) {
    this._context = context;
    this._view = undefined;
    this._currentState = {
      isLoading: false,
      crashes: {
        isLoading: false,
        lastUpdated: null,
        data: [],
        error: null,
      },
    };

    // Initialize crash discovery service
    this._crashDiscoveryService = new CrashDiscoveryService();

    // Bind methods to preserve 'this' context
    this.resolveWebviewView = this.resolveWebviewView.bind(this);
    this._handleMessage = this._handleMessage.bind(this);
    this._updateState = this._updateState.bind(this);
    this._updateCrashState = this._updateCrashState.bind(this);
    this._setCrashLoading = this._setCrashLoading.bind(this);
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

    // Trigger initial crash discovery when webview is first created (asynchronously)
    setTimeout(() => this._performInitialCrashDiscovery(), 0);
  }

  /**
   * Handle messages from the webview
   */
  async _handleMessage(message) {
    if (!this._view) return;

    try {
      switch (message.type) {
        case "command":
          await this._executeCommand(message.command, message.params);
          break;
        case "requestState":
          // State detection removed - send current state
          this._sendMessage({
            type: "stateUpdate",
            state: this._currentState,
          });
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
  async _executeCommand(command, params = {}) {
    try {
      // Map webview commands to VSCode commands
      const commandMap = {
        launchTerminal: "codeforge.launchTerminal",
        runFuzzingTests: "codeforge.runFuzzingTests",
        refreshContainers: "codeforge.refreshContainers",
        refreshCrashes: "codeforge.refreshCrashes",
        viewCrash: "codeforge.viewCrash",
        analyzeCrash: "codeforge.analyzeCrash",
        clearCrashes: "codeforge.clearCrashes",
      };

      const vscodeCommand = commandMap[command];
      if (!vscodeCommand) {
        throw new Error(`Unknown command: ${command}`);
      }

      // Execute the VSCode command with parameters
      if (Object.keys(params).length > 0) {
        await vscode.commands.executeCommand(vscodeCommand, params);
      } else {
        await vscode.commands.executeCommand(vscodeCommand);
      }

      // Send success message
      this._sendMessage({
        type: "commandComplete",
        success: true,
        command: command,
      });

      // State update after command execution removed
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
   * Update crash state and notify the webview
   */
  _updateCrashState(crashData) {
    this._currentState.crashes = {
      ...this._currentState.crashes,
      ...crashData,
    };
    this._sendMessage({
      type: "stateUpdate",
      state: this._currentState,
    });
  }

  /**
   * Set crash loading state
   */
  _setCrashLoading(loading, error = null) {
    this._currentState.crashes.isLoading = loading;
    this._currentState.crashes.error = error;
    this._sendMessage({
      type: "stateUpdate",
      state: this._currentState,
    });
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
        <!-- Quick Actions Section -->
        <section class="actions-section">
            <h2>Quick Actions</h2>
            <div class="button-grid">
                <button class="action-btn outline" id="terminal-btn" disabled>
                    <span class="btn-text">Launch Terminal</span>
                </button>
                <button class="action-btn outline" id="fuzzing-btn" disabled>
                    <span class="btn-text">Run Fuzzing Tests</span>
                </button>
            </div>
        </section>

        <!-- Fuzzing Crashes Section -->
        <section class="crashes-section" id="crashes-section">
            <div class="section-header">
                <h2>Fuzzing Crashes</h2>
                <button class="refresh-btn" id="refresh-crashes-btn" title="Refresh crash data">
                    <span class="btn-icon">🔄</span>
                </button>
            </div>
            
            <div class="crashes-content" id="crashes-content">
                <!-- Dynamic content populated by JavaScript -->
            </div>
        </section>

        <!-- Loading Overlay -->
        <div class="loading-overlay" id="loading-overlay" style="display: none;">
            <div class="loading-spinner"></div>
            <div class="loading-text" id="loading-text">Processing...</div>
        </div>
    </div>

    <script nonce="${nonce}">
        // Pass initial state to webview
        window.initialState = ${JSON.stringify(this._currentState)};
    </script>
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
    // State detection removed
  }

  /**
   * Perform initial crash discovery when webview is first created
   * This ensures crash data is available immediately when the user opens the panel
   */
  async _performInitialCrashDiscovery() {
    try {
      // Check if there's an open workspace
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return;
      }

      const workspacePath = workspaceFolder.uri.fsPath;
      const codeforgeDir = path.join(workspacePath, ".codeforge");

      // Check if .codeforge directory exists
      try {
        await fs.access(codeforgeDir);
      } catch (error) {
        // .codeforge directory doesn't exist yet, skip crash discovery
        return;
      }

      // Set loading state
      this._setCrashLoading(true);

      // Discover crashes
      const crashData =
        await this._crashDiscoveryService.discoverCrashes(workspacePath);

      // Update state with discovered crashes
      this._updateCrashState({
        data: crashData,
        lastUpdated: new Date().toISOString(),
        isLoading: false,
        error: null,
      });
    } catch (error) {
      // Handle errors gracefully - don't show error messages for initial discovery
      this._setCrashLoading(false, error.message);
      console.warn(`Initial crash discovery failed: ${error.message}`);
    }
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
