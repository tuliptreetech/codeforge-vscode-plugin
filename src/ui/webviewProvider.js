const vscode = require("vscode");
const path = require("path");
const fs = require("fs").promises;
const dockerOperations = require("../core/dockerOperations");
const { FuzzerDiscoveryService } = require("../fuzzing/fuzzerDiscoveryService");
const {
  InitializationDetectionService,
} = require("../core/initializationDetectionService");

/**
 * CodeForge Webview View Provider
 * Manages the webview panel in the activity bar
 */
class CodeForgeWebviewProvider {
  constructor(context, resourceManager = null) {
    this._context = context;
    this._view = undefined;
    this._currentState = {
      isLoading: false,
      initialization: {
        isInitialized: false,
        isLoading: false,
        lastChecked: null,
        error: null,
        missingComponents: [],
        details: {},
      },
      fuzzers: {
        isLoading: false,
        lastUpdated: null,
        data: [],
        error: null,
      },
      dockerImage: {
        isUpToDate: true,
        isChecking: false,
        lastChecked: null,
        error: null,
      },
    };

    // Add backward compatibility getter for crashes
    Object.defineProperty(this._currentState, "crashes", {
      get: function () {
        return this.fuzzers;
      },
      set: function (value) {
        this.fuzzers = value;
      },
    });

    // Initialize services
    this._fuzzerDiscoveryService = new FuzzerDiscoveryService(resourceManager);
    this._initializationService = new InitializationDetectionService(
      resourceManager,
    );

    // Bind methods to preserve 'this' context
    this.resolveWebviewView = this.resolveWebviewView.bind(this);
    this._handleMessage = this._handleMessage.bind(this);
    this._updateState = this._updateState.bind(this);
    this._updateFuzzerState = this._updateFuzzerState.bind(this);
    this._setFuzzerLoading = this._setFuzzerLoading.bind(this);
    this._checkInitializationStatus =
      this._checkInitializationStatus.bind(this);
    this._updateInitializationState =
      this._updateInitializationState.bind(this);
    this._setInitializationLoading = this._setInitializationLoading.bind(this);

    // Backward compatibility methods for tests
    this._updateCrashState = this._updateFuzzerState.bind(this);
    this._setCrashLoading = this._setFuzzerLoading.bind(this);
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

    // Check initialization status when webview is first created
    setTimeout(() => this._checkInitializationStatus(), 0);

    // Check Docker image status when webview is first created
    setTimeout(() => this._checkDockerImageStatus(), 50);

    // Trigger initial fuzzer discovery when webview is first created (asynchronously)
    setTimeout(() => this._performInitialFuzzerDiscovery(), 100);
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
        case "initializeCodeForge":
          await this._executeCommand(
            "initializeCodeForge",
            message.params || {},
          );
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
        refreshFuzzers: "codeforge.refreshFuzzers",
        refreshCrashes: "codeforge.refreshFuzzers", // Backward compatibility
        runFuzzer: "codeforge.runFuzzer",
        viewCrash: "codeforge.viewCrash",
        analyzeCrash: "codeforge.analyzeCrash",
        debugCrash: "codeforge.debugCrash",
        clearCrashes: "codeforge.clearCrashes",
        reevaluateCrashes: "codeforge.reevaluateCrashes",
        viewCorpus: "codeforge.viewCorpus",
        initializeCodeForge: "codeforge.initializeProject",
        updateDockerImage: "codeforge.updateDockerImage",
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
   * Update fuzzer state and notify the webview
   */
  _updateFuzzerState(fuzzerData) {
    this._currentState.fuzzers = {
      ...this._currentState.fuzzers,
      ...fuzzerData,
    };
    this._sendMessage({
      type: "stateUpdate",
      state: this._currentState,
    });
  }

  /**
   * Set fuzzer loading state
   */
  _setFuzzerLoading(loading, error = null) {
    this._currentState.fuzzers.isLoading = loading;
    this._currentState.fuzzers.error = error;
    this._sendMessage({
      type: "stateUpdate",
      state: this._currentState,
    });
  }

  /**
   * Check initialization status and update state
   */
  async _checkInitializationStatus() {
    try {
      // Check if there's an open workspace
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        this._updateInitializationState({
          isInitialized: false,
          error: "No workspace folder open",
          missingComponents: ["workspace"],
          details: {},
          lastChecked: new Date().toISOString(),
        });
        return;
      }

      const workspacePath = workspaceFolder.uri.fsPath;

      // Set loading state
      this._setInitializationLoading(true);

      // Check initialization status
      const status =
        await this._initializationService.isCodeForgeInitialized(workspacePath);

      // Update state with results
      this._updateInitializationState({
        isInitialized: status.isInitialized,
        missingComponents: status.missingComponents,
        details: status.details,
        lastChecked: new Date().toISOString(),
        isLoading: false,
        error: null,
      });
    } catch (error) {
      // Handle errors gracefully
      this._setInitializationLoading(false, error.message);
      console.warn(`Initialization status check failed: ${error.message}`);
    }
  }

  /**
   * Update initialization state and notify the webview
   */
  _updateInitializationState(initializationData) {
    this._currentState.initialization = {
      ...this._currentState.initialization,
      ...initializationData,
    };
    this._sendMessage({
      type: "stateUpdate",
      state: this._currentState,
    });
  }

  /**
   * Set initialization loading state
   */
  _setInitializationLoading(loading, error = null) {
    this._currentState.initialization.isLoading = loading;
    this._currentState.initialization.error = error;
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
        <!-- Initialization Section -->
        <section class="initialization-section" id="initialization-section" style="display: none;">
            <div class="init-content">
                <div class="init-icon">🔧</div>
                <h2>Initialize CodeForge</h2>
                <p class="init-description">Set up CodeForge in your workspace to enable fuzzing capabilities.</p>
                <button class="action-btn primary" id="initialize-btn">
                    <span class="btn-text">Initialize CodeForge</span>
                </button>
            </div>
        </section>

        <!-- Initialization Progress Section -->
        <section class="initialization-progress-section" id="initialization-progress-section" style="display: none;">
            <div class="init-progress-content">
                <div class="init-progress-icon">
                    <div class="loading-spinner"></div>
                </div>
                <h2>Initializing CodeForge</h2>
                <div class="init-progress-steps" id="init-progress-steps">
                    <!-- Dynamic progress steps populated by JavaScript -->
                </div>
                <div class="init-status-message" id="init-status-message">
                    Setting up your workspace...
                </div>
            </div>
        </section>

        <!-- Unknown State Section -->
        <section class="unknown-state-section" id="unknown-state-section" style="display: none;">
            <div class="unknown-state-content">
                <div class="loading-spinner"></div>
                <div class="unknown-state-text">Checking initialization status...</div>
            </div>
        </section>

        <!-- Quick Actions Section -->
        <section class="actions-section" id="actions-section">
            <h2>Quick Actions</h2>
            <div class="button-grid">
                <button class="action-btn outline" id="terminal-btn" disabled>
                    <span class="btn-text">Launch Terminal</span>
                </button>
                <button class="action-btn outline" id="fuzzing-btn" disabled>
                    <span class="btn-text">Run Fuzzing Tests</span>
                </button>
            </div>
            <button class="action-btn update-image-btn" id="update-image-btn" style="display: none;">
                <span class="btn-text">Update Image</span>
            </button>
        </section>

        <!-- Fuzzers Section -->
        <section class="fuzzers-section" id="fuzzers-section">
            <div class="section-header">
                <h2>Fuzzers</h2>
                <button class="refresh-btn" id="refresh-fuzzers-btn" title="Refresh fuzzer data">
                    <span class="btn-icon">🔄</span>
                </button>
            </div>
            
            <div class="fuzzers-content" id="fuzzers-content">
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
   * Check Docker image status and update state
   */
  async _checkDockerImageStatus() {
    try {
      // Check if there's an open workspace
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        console.log("[_checkDockerImageStatus] No workspace folder");
        return;
      }

      const workspacePath = workspaceFolder.uri.fsPath;
      console.log(
        `[_checkDockerImageStatus] Checking Docker image status for: ${workspacePath}`,
      );

      // Set checking state
      this._currentState.dockerImage.isChecking = true;
      this._sendMessage({
        type: "stateUpdate",
        state: this._currentState,
      });

      // Verify Docker image
      const imageStatus =
        await dockerOperations.verifyDockerImageUpToDate(workspacePath);

      console.log(
        `[_checkDockerImageStatus] Image verification result: isUpToDate=${imageStatus.isUpToDate}`,
      );

      // Update state with results
      this._currentState.dockerImage = {
        isUpToDate: imageStatus.isUpToDate,
        isChecking: false,
        lastChecked: new Date().toISOString(),
        error: null,
      };

      this._sendMessage({
        type: "stateUpdate",
        state: this._currentState,
      });

      console.log(
        `[_checkDockerImageStatus] State updated, button should ${imageStatus.isUpToDate ? "NOT" : ""} show`,
      );
    } catch (error) {
      // Handle errors gracefully
      console.error(`[_checkDockerImageStatus] Error: ${error.message}`, error);
      this._currentState.dockerImage = {
        isUpToDate: true, // Assume up to date on error to avoid false warnings
        isChecking: false,
        lastChecked: new Date().toISOString(),
        error: error.message,
      };
      this._sendMessage({
        type: "stateUpdate",
        state: this._currentState,
      });
      console.warn(`Docker image status check failed: ${error.message}`);
    }
  }

  /**
   * Perform initial fuzzer discovery when webview is first created
   * This ensures fuzzer data is available immediately when the user opens the panel
   */
  async _performInitialFuzzerDiscovery() {
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
        // .codeforge directory doesn't exist yet, skip fuzzer discovery
        return;
      }

      // Check if project is properly initialized before attempting fuzzer discovery
      const initStatus =
        await this._initializationService.isCodeForgeInitialized(workspacePath);
      if (!initStatus.isInitialized) {
        // Project not initialized, skip fuzzer discovery
        return;
      }

      // Check if Docker image exists before attempting fuzzer discovery
      const imageName = dockerOperations.generateContainerName(workspacePath);
      const imageExists = await dockerOperations.checkImageExists(imageName);
      if (!imageExists) {
        // Docker image not built yet, skip fuzzer discovery
        return;
      }

      // Set loading state
      this._setFuzzerLoading(true);

      // Discover fuzzers
      const fuzzerData = await this._fuzzerDiscoveryService.discoverFuzzers(
        workspacePath,
        imageName,
      );

      // Update state with discovered fuzzers
      this._updateFuzzerState({
        data: fuzzerData,
        lastUpdated: new Date().toISOString(),
        isLoading: false,
        error: null,
      });
    } catch (error) {
      // Handle errors gracefully - don't show error messages for initial discovery
      this._setFuzzerLoading(false, error.message);
      console.warn(`Initial fuzzer discovery failed: ${error.message}`);
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
