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

    // Initial state update removed
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
  async _executeCommand(command) {
    try {
      // Map webview commands to VSCode commands
      const commandMap = {
        launchTerminal: "codeforge.launchTerminal",
        runFuzzingTests: "codeforge.runFuzzingTests",
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
    // State detection removed
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
