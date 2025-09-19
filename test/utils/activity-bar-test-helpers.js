/**
 * Activity Bar Test Helpers
 *
 * Utility functions and mocks for testing the CodeForge activity bar functionality.
 * These helpers provide common mocking patterns and test utilities for webview,
 * tree provider, and command handler testing.
 */

const sinon = require("sinon");
const vscode = require("vscode");

/**
 * Mock webview for testing webview provider functionality
 */
class MockWebview {
  constructor() {
    this.html = "";
    this.options = {};
    this.onDidReceiveMessage = sinon.stub();
    this.postMessage = sinon.stub();
    this.asWebviewUri = sinon.stub().callsFake((uri) => uri);
    this.cspSource = "vscode-webview:";
  }

  reset() {
    this.html = "";
    this.options = {};
    this.onDidReceiveMessage.reset();
    this.postMessage.reset();
    this.asWebviewUri.reset();
  }
}

/**
 * Mock webview view for testing webview provider
 */
class MockWebviewView {
  constructor() {
    this.webview = new MockWebview();
    this.onDidDispose = sinon.stub();
    this.show = sinon.stub();
    this.visible = true;
  }

  reset() {
    this.webview.reset();
    this.onDidDispose.reset();
    this.show.reset();
    this.visible = true;
  }
}

/**
 * Mock tree view for testing tree provider functionality
 */
class MockTreeView {
  constructor() {
    this.onDidChangeSelection = sinon.stub();
    this.onDidChangeVisibility = sinon.stub();
    this.onDidCollapseElement = sinon.stub();
    this.onDidExpandElement = sinon.stub();
    this.reveal = sinon.stub();
    this.dispose = sinon.stub();
    this.visible = true;
    this.selection = [];
  }

  reset() {
    this.onDidChangeSelection.reset();
    this.onDidChangeVisibility.reset();
    this.onDidCollapseElement.reset();
    this.onDidExpandElement.reset();
    this.reveal.reset();
    this.dispose.reset();
    this.visible = true;
    this.selection = [];
  }
}

/**
 * Mock terminal for testing terminal operations
 */
class MockTerminal {
  constructor(name = "Test Terminal") {
    this.name = name;
    this.processId = Promise.resolve(12345);
    this.creationOptions = {};
    this.exitStatus = undefined;
    this.state = { isInteractedWith: false };

    this.sendText = sinon.stub();
    this.show = sinon.stub();
    this.hide = sinon.stub();
    this.dispose = sinon.stub();
  }

  reset() {
    this.sendText.reset();
    this.show.reset();
    this.hide.reset();
    this.dispose.reset();
    this.exitStatus = undefined;
    this.state = { isInteractedWith: false };
  }
}

/**
 * Create a comprehensive mock for VSCode API
 */
function createVSCodeMocks(sandbox) {
  const mocks = {
    // Window mocks
    window: {
      showInformationMessage: sandbox.stub(),
      showWarningMessage: sandbox.stub(),
      showErrorMessage: sandbox.stub(),
      showInputBox: sandbox.stub(),
      showQuickPick: sandbox.stub(),
      showTextDocument: sandbox.stub(),
      createWebviewPanel: sandbox.stub(),
      createTreeView: sandbox.stub().returns(new MockTreeView()),
      createTerminal: sandbox.stub().returns(new MockTerminal()),
      createOutputChannel: sandbox.stub().returns({
        appendLine: sandbox.stub(),
        show: sandbox.stub(),
        dispose: sandbox.stub(),
      }),
    },

    // Workspace mocks
    workspace: {
      workspaceFolders: [
        {
          uri: { fsPath: "/test/workspace" },
          name: "test-workspace",
          index: 0,
        },
      ],
      getConfiguration: sandbox.stub().returns({
        get: sandbox.stub().callsFake((key, defaultValue) => {
          const config = {
            "codeforge.dockerCommand": "docker",
            "codeforge.defaultShell": "/bin/bash",
          };
          return config[`codeforge.${key}`] || defaultValue;
        }),
      }),
      openTextDocument: sandbox.stub(),
    },

    // Commands mock
    commands: {
      executeCommand: sandbox.stub(),
      registerCommand: sandbox.stub(),
      getCommands: sandbox
        .stub()
        .returns([
          "codeforge.initialize",
          "codeforge.buildDocker",
          "codeforge.launchTerminal",
          "codeforge.runFuzzing",
          "codeforge.listContainers",
          "codeforge.runCommand",
          "codeforge.terminateAll",
          "codeforge.cleanup",
          "codeforge.refreshContainers",
        ]),
    },

    // Extensions mock
    extensions: {
      getExtension: sandbox.stub().returns({
        id: "TulipTreeTechnology.codeforge",
        isActive: true,
        activate: sandbox.stub().resolves({}),
        packageJSON: {
          contributes: {
            commands: [],
            views: {},
            viewsContainers: {},
          },
        },
      }),
    },

    // URI mock
    Uri: {
      file: sandbox
        .stub()
        .callsFake((path) => ({ fsPath: path, scheme: "file" })),
      parse: sandbox
        .stub()
        .callsFake((uri) => ({ fsPath: uri, scheme: "file" })),
    },

    // TreeItem mock
    TreeItem: class MockTreeItem {
      constructor(label, collapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.tooltip = "";
        this.description = "";
        this.contextValue = "";
        this.iconPath = null;
      }
    },

    // TreeItemCollapsibleState enum
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },

    // ThemeIcon mock
    ThemeIcon: class MockThemeIcon {
      constructor(id, color) {
        this.id = id;
        this.color = color;
      }
    },

    // EventEmitter mock
    EventEmitter: class MockEventEmitter {
      constructor() {
        this.event = sinon.stub();
        this.fire = sinon.stub();
        this.dispose = sinon.stub();
      }
    },
  };

  return mocks;
}

/**
 * Create mock container data for testing
 */
function createMockContainers() {
  return [
    {
      id: "container1",
      name: "test-container-1",
      image: "test-image:latest",
      status: "running",
      running: true,
      createdAt: new Date().toISOString(),
      type: "development",
    },
    {
      id: "container2",
      name: "test-container-2",
      image: "test-image:latest",
      status: "stopped",
      running: false,
      createdAt: new Date().toISOString(),
      type: "testing",
    },
  ];
}

/**
 * Create mock webview messages for testing
 */
function createMockWebviewMessages() {
  return {
    command: {
      type: "command",
      command: "launchTerminal",
    },
    requestState: {
      type: "requestState",
    },
    invalidMessage: {
      type: "unknown",
      data: "test",
    },
  };
}

/**
 * Mock file system operations
 */
function createFileSystemMocks(sandbox) {
  const fs = require("fs").promises;

  return {
    access: sandbox.stub(fs, "access"),
    mkdir: sandbox.stub(fs, "mkdir"),
    writeFile: sandbox.stub(fs, "writeFile"),
    readFile: sandbox.stub(fs, "readFile"),
    stat: sandbox.stub(fs, "stat"),
  };
}

/**
 * Mock Docker operations
 */
function createDockerOperationsMocks(sandbox) {
  // Create mock functions that can be used whether or not the real module exists
  const mockFunctions = {
    generateContainerName: sandbox.stub().returns("test-container"),
    checkImageExists: sandbox.stub().resolves(true),
    getActiveContainers: sandbox.stub().resolves(createMockContainers()),
    stopContainer: sandbox.stub().resolves(),
    buildDockerImage: sandbox.stub().resolves(),
    getContainerStatus: sandbox.stub().resolves(createMockContainers()),
    terminateAllContainers: sandbox
      .stub()
      .resolves({ succeeded: 2, failed: 0 }),
    cleanupOrphanedContainers: sandbox.stub().resolves(0),
    generateDockerRunArgs: sandbox.stub().returns(["run", "-it", "test"]),
    runDockerCommandWithOutput: sandbox.stub().returns({
      stdout: { on: sandbox.stub() },
      stderr: { on: sandbox.stub() },
      on: sandbox.stub(),
    }),
    trackLaunchedContainer: sandbox.stub().resolves(true),
  };

  // Try to stub the actual module if it exists
  try {
    const dockerOperations = require("../../src/core/dockerOperations");
    Object.keys(mockFunctions).forEach((methodName) => {
      if (typeof dockerOperations[methodName] === "function") {
        try {
          if (!dockerOperations[methodName].isSinonProxy) {
            sandbox
              .stub(dockerOperations, methodName)
              .callsFake(mockFunctions[methodName]);
          }
        } catch (error) {
          // Method might already be stubbed or not exist
          console.warn(`Failed to stub ${methodName}:`, error.message);
        }
      }
    });

    // Ensure the mocks are properly applied by replacing the module functions
    Object.keys(mockFunctions).forEach((methodName) => {
      if (dockerOperations[methodName]) {
        dockerOperations[methodName] = mockFunctions[methodName];
      }
    });
  } catch (error) {
    // Module might not exist in test environment
    console.warn(
      "Docker operations module not available for stubbing:",
      error.message,
    );
  }

  return mockFunctions;
}

/**
 * Setup comprehensive test environment
 */
function setupTestEnvironment(sandbox) {
  const vscodeMocks = createVSCodeMocks(sandbox);
  const fsMocks = createFileSystemMocks(sandbox);
  const dockerMocks = createDockerOperationsMocks(sandbox);

  // Apply VSCode mocks more carefully
  try {
    // Mock vscode.window methods
    if (vscode.window) {
      Object.keys(vscodeMocks.window).forEach((method) => {
        if (!vscode.window[method] || !vscode.window[method].isSinonProxy) {
          try {
            sandbox
              .stub(vscode.window, method)
              .callsFake(vscodeMocks.window[method]);
          } catch (error) {
            // Method might not exist or already stubbed
          }
        }
      });
    }

    // Mock vscode.workspace methods
    if (vscode.workspace) {
      Object.keys(vscodeMocks.workspace).forEach((method) => {
        if (method === "workspaceFolders") {
          // Set workspaceFolders as a property
          try {
            sandbox
              .stub(vscode.workspace, "workspaceFolders")
              .value(vscodeMocks.workspace.workspaceFolders);
          } catch (error) {
            // Already stubbed
          }
        } else if (
          !vscode.workspace[method] ||
          !vscode.workspace[method].isSinonProxy
        ) {
          try {
            sandbox
              .stub(vscode.workspace, method)
              .callsFake(vscodeMocks.workspace[method]);
          } catch (error) {
            // Method might not exist or already stubbed
          }
        }
      });
    }

    // Mock vscode.commands methods
    if (vscode.commands) {
      Object.keys(vscodeMocks.commands).forEach((method) => {
        if (!vscode.commands[method] || !vscode.commands[method].isSinonProxy) {
          try {
            sandbox
              .stub(vscode.commands, method)
              .callsFake(vscodeMocks.commands[method]);
          } catch (error) {
            // Method might not exist or already stubbed
          }
        }
      });
    }

    // Mock other vscode properties
    [
      "Uri",
      "TreeItem",
      "TreeItemCollapsibleState",
      "ThemeIcon",
      "EventEmitter",
    ].forEach((key) => {
      if (!vscode[key] || !vscode[key].isSinonProxy) {
        try {
          sandbox.stub(vscode, key).value(vscodeMocks[key]);
        } catch (error) {
          // Already stubbed or doesn't exist
        }
      }
    });
  } catch (error) {
    console.warn("Warning: Some VSCode API mocking failed:", error.message);
  }

  return {
    vscodeMocks,
    fsMocks,
    dockerMocks,
    mockContainers: createMockContainers(),
    mockMessages: createMockWebviewMessages(),
  };
}

/**
 * Cleanup test environment
 */
function cleanupTestEnvironment(sandbox) {
  sandbox.restore();
}

/**
 * Assert webview HTML contains expected elements
 */
function assertWebviewHTML(html, expectedElements = []) {
  const defaultElements = [
    "CodeForge Control Panel",
    "Project Status",
    "Quick Actions",
    "Advanced Operations",
    "initialize-btn",
    "build-btn",
    "terminal-btn",
    "fuzzing-btn",
  ];

  const elementsToCheck =
    expectedElements.length > 0 ? expectedElements : defaultElements;

  elementsToCheck.forEach((element) => {
    if (!html.includes(element)) {
      throw new Error(`Expected HTML to contain "${element}"`);
    }
  });
}

/**
 * Wait for async operations to complete
 */
function waitForAsync(ms = 100) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a mock extension context
 */
function createMockExtensionContext() {
  return {
    subscriptions: [],
    workspaceState: {
      get: sinon.stub(),
      update: sinon.stub(),
    },
    globalState: {
      get: sinon.stub(),
      update: sinon.stub(),
    },
    extensionPath: "/test/extension/path",
    storagePath: "/test/storage/path",
    globalStoragePath: "/test/global/storage/path",
    logPath: "/test/log/path",
  };
}

module.exports = {
  MockWebview,
  MockWebviewView,
  MockTreeView,
  MockTerminal,
  createVSCodeMocks,
  createMockContainers,
  createMockWebviewMessages,
  createFileSystemMocks,
  createDockerOperationsMocks,
  setupTestEnvironment,
  cleanupTestEnvironment,
  assertWebviewHTML,
  waitForAsync,
  createMockExtensionContext,
};
