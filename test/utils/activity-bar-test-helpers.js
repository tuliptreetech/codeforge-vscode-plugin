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

  /**
   * Helper to simulate receiving a message from the webview
   */
  simulateMessage(message) {
    const handler = this.onDidReceiveMessage.getCall(0)?.args[0];
    if (handler) {
      return handler(message);
    }
  }

  /**
   * Helper to get the last posted message
   */
  getLastPostedMessage() {
    const calls = this.postMessage.getCalls();
    return calls.length > 0 ? calls[calls.length - 1].args[0] : null;
  }

  /**
   * Helper to get all posted messages
   */
  getAllPostedMessages() {
    return this.postMessage.getCalls().map((call) => call.args[0]);
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
          "codeforge.initializeProject",
          "codeforge.launchTerminal",
          "codeforge.runFuzzingTests",
          "codeforge.buildFuzzingTests",
          "codeforge.regenerateFuzzerList",
          "codeforge.registerTask",
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
      parse: sandbox.stub().callsFake((uri) => {
        // Parse the URI string to extract scheme and other components
        if (typeof uri === "string") {
          const match = uri.match(/^([^:]+):/);
          const scheme = match ? match[1] : "file";
          const queryMatch = uri.match(/\?(.+)$/);
          const query = queryMatch ? queryMatch[1] : "";
          const pathMatch = uri.match(/^[^:]+:([^?]+)/);
          const path = pathMatch ? pathMatch[1] : uri;
          return {
            fsPath: uri,
            scheme: scheme,
            path: path,
            query: query,
            toString: () => uri,
          };
        }
        return { fsPath: uri, scheme: "file" };
      }),
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
 * Create mock crash data for testing
 */
function createMockCrashData() {
  return [
    {
      fuzzerName: "libfuzzer",
      crashes: [
        {
          id: "crash-abc123",
          filePath:
            "/test/workspace/.codeforge/fuzzing/codeforge-libfuzzer-fuzz-output/corpus/crash-abc123",
          hash: "abc123def456",
          fileSize: 1024,
          size: 1024, // Keep both for compatibility
          createdAt: "2024-01-15T10:30:00.000Z",
          timestamp: "2024-01-15T10:30:00.000Z", // Keep both for compatibility
        },
        {
          id: "crash-def456",
          filePath:
            "/test/workspace/.codeforge/fuzzing/codeforge-libfuzzer-fuzz-output/corpus/crash-def456",
          hash: "def456ghi789",
          fileSize: 2048,
          size: 2048, // Keep both for compatibility
          createdAt: "2024-01-15T11:45:00.000Z",
          timestamp: "2024-01-15T11:45:00.000Z", // Keep both for compatibility
        },
      ],
      outputDir:
        "/test/workspace/.codeforge/fuzzing/codeforge-libfuzzer-fuzz-output",
      lastScan: "2024-01-15T12:00:00.000Z",
    },
    {
      fuzzerName: "afl",
      crashes: [
        {
          id: "crash-ghi789",
          filePath:
            "/test/workspace/.codeforge/fuzzing/codeforge-afl-fuzz-output/corpus/crash-ghi789",
          hash: "ghi789jkl012",
          fileSize: 512,
          size: 512, // Keep both for compatibility
          createdAt: "2024-01-15T09:15:00.000Z",
          timestamp: "2024-01-15T09:15:00.000Z", // Keep both for compatibility
        },
      ],
      outputDir: "/test/workspace/.codeforge/fuzzing/codeforge-afl-fuzz-output",
      lastScan: "2024-01-15T12:00:00.000Z",
    },
  ];
}

/**
 * Create mock fuzzer data for testing (new fuzzer-centric approach)
 */
function createMockFuzzerData() {
  return [
    {
      name: "libfuzzer_test",
      preset: "Debug",
      status: "ready",
      buildInfo: {
        isBuilt: true,
        lastBuild: "2024-01-15T10:00:00.000Z",
        buildPath: "/test/workspace/build/Debug/libfuzzer_test",
      },
      runInfo: {
        isRunning: false,
        pid: null,
        startTime: null,
        duration: null,
      },
      crashes: [
        {
          id: "crash-abc123",
          filePath:
            "/test/workspace/.codeforge/fuzzing/codeforge-libfuzzer_test-fuzz-output/corpus/crash-abc123",
          fileName: "crash-abc123",
          fileSize: 1024,
          createdAt: "2024-01-15T10:30:00.000Z",
          fuzzerName: "libfuzzer_test",
        },
        {
          id: "crash-def456",
          filePath:
            "/test/workspace/.codeforge/fuzzing/codeforge-libfuzzer_test-fuzz-output/corpus/crash-def456",
          fileName: "crash-def456",
          fileSize: 2048,
          createdAt: "2024-01-15T11:45:00.000Z",
          fuzzerName: "libfuzzer_test",
        },
      ],
      lastUpdated: new Date("2024-01-15T12:00:00.000Z"),
    },
    {
      name: "afl_test",
      preset: "Debug",
      status: "building",
      buildInfo: {
        isBuilt: false,
        lastBuild: null,
        buildPath: "/test/workspace/build/Debug/afl_test",
      },
      runInfo: {
        isRunning: false,
        pid: null,
        startTime: null,
        duration: null,
      },
      crashes: [
        {
          id: "crash-ghi789",
          filePath:
            "/test/workspace/.codeforge/fuzzing/codeforge-afl_test-fuzz-output/corpus/crash-ghi789",
          fileName: "crash-ghi789",
          fileSize: 512,
          createdAt: "2024-01-15T09:15:00.000Z",
          fuzzerName: "afl_test",
        },
      ],
      lastUpdated: new Date("2024-01-15T12:00:00.000Z"),
    },
    {
      name: "running_fuzzer",
      preset: "Debug",
      status: "running",
      buildInfo: {
        isBuilt: true,
        lastBuild: "2024-01-15T08:00:00.000Z",
        buildPath: "/test/workspace/build/Debug/running_fuzzer",
      },
      runInfo: {
        isRunning: true,
        pid: 12345,
        startTime: "2024-01-15T12:00:00.000Z",
        duration: 3600,
      },
      crashes: [],
      lastUpdated: new Date("2024-01-15T12:00:00.000Z"),
    },
  ];
}

/**
 * Assert fuzzer data structure is valid
 */
function assertFuzzerDataStructure(fuzzerData) {
  assert.ok(Array.isArray(fuzzerData), "Fuzzer data should be an array");

  fuzzerData.forEach((fuzzer, index) => {
    assert.ok(fuzzer.name, `Fuzzer ${index} should have a name`);
    assert.ok(fuzzer.preset, `Fuzzer ${index} should have a preset`);
    assert.ok(fuzzer.status, `Fuzzer ${index} should have a status`);
    assert.ok(fuzzer.buildInfo, `Fuzzer ${index} should have buildInfo`);
    assert.ok(fuzzer.runInfo, `Fuzzer ${index} should have runInfo`);
    assert.ok(
      Array.isArray(fuzzer.crashes),
      `Fuzzer ${index} crashes should be an array`,
    );
    assert.ok(fuzzer.lastUpdated, `Fuzzer ${index} should have lastUpdated`);

    // Validate buildInfo structure
    assert.ok(
      typeof fuzzer.buildInfo.isBuilt === "boolean",
      `Fuzzer ${index} buildInfo.isBuilt should be boolean`,
    );
    assert.ok(
      fuzzer.buildInfo.buildPath,
      `Fuzzer ${index} should have buildPath`,
    );

    // Validate runInfo structure
    assert.ok(
      typeof fuzzer.runInfo.isRunning === "boolean",
      `Fuzzer ${index} runInfo.isRunning should be boolean`,
    );

    // Validate crash structure
    fuzzer.crashes.forEach((crash, crashIndex) => {
      assert.ok(crash.id, `Fuzzer ${index} crash ${crashIndex} should have id`);
      assert.ok(
        crash.filePath,
        `Fuzzer ${index} crash ${crashIndex} should have filePath`,
      );
      assert.ok(
        crash.fileName,
        `Fuzzer ${index} crash ${crashIndex} should have fileName`,
      );
      assert.ok(
        typeof crash.fileSize === "number",
        `Fuzzer ${index} crash ${crashIndex} fileSize should be number`,
      );
      assert.ok(
        crash.createdAt,
        `Fuzzer ${index} crash ${crashIndex} should have createdAt`,
      );
      assert.ok(
        crash.fuzzerName,
        `Fuzzer ${index} crash ${crashIndex} should have fuzzerName`,
      );
    });
  });
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
    // Fuzzer-related messages
    refreshFuzzers: {
      type: "command",
      command: "refreshFuzzers",
    },
    buildFuzzer: {
      type: "command",
      command: "buildFuzzer",
      params: {
        fuzzerName: "libfuzzer_test",
        preset: "Debug",
      },
    },
    // Crash-related messages (still needed for crash operations within fuzzers)
    refreshCrashes: {
      type: "command",
      command: "refreshCrashes",
    },
    viewCrash: {
      type: "command",
      command: "viewCrash",
      params: {
        crashId: "crash-abc123",
        filePath:
          "/test/workspace/.codeforge/fuzzing/codeforge-libfuzzer_test-fuzz-output/corpus/crash-abc123",
      },
    },
    analyzeCrash: {
      type: "command",
      command: "analyzeCrash",
      params: {
        crashId: "crash-abc123",
        fuzzerName: "libfuzzer_test",
        filePath:
          "/test/workspace/.codeforge/fuzzing/codeforge-libfuzzer_test-fuzz-output/corpus/crash-abc123",
      },
    },
    clearCrashes: {
      type: "command",
      command: "clearCrashes",
      params: {
        fuzzerName: "libfuzzer_test",
      },
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
    readdir: sandbox.stub(fs, "readdir"),
    stat: sandbox.stub(fs, "stat"),
    unlink: sandbox.stub(fs, "unlink"),
    constants: {
      X_OK: 1, // Execute permission constant
      R_OK: 4, // Read permission constant
      W_OK: 2, // Write permission constant
      F_OK: 0, // File exists constant
    },
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
 * Mock CrashDiscoveryService operations
 */
function createCrashDiscoveryServiceMocks(sandbox) {
  const mockFunctions = {
    discoverCrashes: sandbox.stub().resolves(createMockCrashData()),
    findFuzzerDirectories: sandbox
      .stub()
      .resolves([
        "/test/workspace/.codeforge/fuzzing/codeforge-libfuzzer-fuzz-output",
        "/test/workspace/.codeforge/fuzzing/codeforge-afl-fuzz-output",
      ]),
    extractFuzzerName: sandbox.stub().callsFake((dir) => {
      const match = dir.match(/codeforge-(.+)-fuzz-output/);
      return match ? match[1] : "unknown";
    }),
    extractFuzzerNameFromPath: sandbox.stub().callsFake((filePath) => {
      const match = filePath.match(/codeforge-(.+)-fuzz-output/);
      return match ? match[1] : "unknown";
    }),
    findCrashFiles: sandbox.stub().resolves([
      {
        id: "crash-abc123",
        filePath:
          "/test/workspace/.codeforge/fuzzing/codeforge-libfuzzer-fuzz-output/corpus/crash-abc123",
        hash: "abc123def456",
        size: 1024,
        timestamp: "2024-01-15T10:30:00.000Z",
      },
    ]),
    parseCrashFile: sandbox.stub().resolves({
      id: "crash-abc123",
      filePath:
        "/test/workspace/.codeforge/fuzzing/codeforge-libfuzzer-fuzz-output/corpus/crash-abc123",
      hash: "abc123def456",
      size: 1024,
      timestamp: "2024-01-15T10:30:00.000Z",
    }),
  };

  // Try to stub the actual module if it exists
  try {
    const {
      CrashDiscoveryService,
    } = require("../../src/fuzzing/crashDiscoveryService");
    Object.keys(mockFunctions).forEach((methodName) => {
      if (typeof CrashDiscoveryService.prototype[methodName] === "function") {
        try {
          if (!CrashDiscoveryService.prototype[methodName].isSinonProxy) {
            sandbox
              .stub(CrashDiscoveryService.prototype, methodName)
              .callsFake(mockFunctions[methodName]);
          }
        } catch (error) {
          console.warn(
            `Failed to stub CrashDiscoveryService.${methodName}:`,
            error.message,
          );
        }
      }
    });
  } catch (error) {
    console.warn(
      "CrashDiscoveryService module not available for stubbing:",
      error.message,
    );
  }

  return mockFunctions;
}

/**
 * Mock FuzzerDiscoveryService operations
 */
function createFuzzerDiscoveryServiceMocks(sandbox) {
  const mockFunctions = {
    discoverFuzzers: sandbox.stub().resolves(createMockFuzzerData()),
    getFuzzerStatus: sandbox.stub().resolves({
      status: "ready",
      buildInfo: {
        isBuilt: true,
        lastBuild: "2024-01-15T10:00:00.000Z",
        buildPath: "/test/workspace/build/Debug/libfuzzer_test",
      },
      runInfo: {
        isRunning: false,
        pid: null,
        startTime: null,
        duration: null,
      },
    }),
    updateFuzzerStatus: sandbox.stub().resolves(),
    associateCrashesWithFuzzers: sandbox.stub().returns([]),
    refreshFuzzerData: sandbox.stub().resolves(createMockFuzzerData()),
    getCachedFuzzer: sandbox.stub().callsFake((fuzzerName) => {
      // Return a mock fuzzer with preset
      return {
        name: fuzzerName,
        preset: "libfuzzer",
        crashes: [],
        lastUpdated: new Date(),
        outputDir: `/test/workspace/.codeforge/fuzzing/${fuzzerName}-output`,
        testCount: 100,
      };
    }),
  };

  // Try to stub the actual module if it exists
  try {
    const {
      FuzzerDiscoveryService,
    } = require("../../src/fuzzing/fuzzerDiscoveryService");
    Object.keys(mockFunctions).forEach((methodName) => {
      if (typeof FuzzerDiscoveryService.prototype[methodName] === "function") {
        try {
          if (!FuzzerDiscoveryService.prototype[methodName].isSinonProxy) {
            sandbox
              .stub(FuzzerDiscoveryService.prototype, methodName)
              .callsFake(mockFunctions[methodName]);
          }
        } catch (error) {
          console.warn(
            `Failed to stub FuzzerDiscoveryService.${methodName}:`,
            error.message,
          );
        }
      }
    });
  } catch (error) {
    console.warn(
      "FuzzerDiscoveryService module not available for stubbing:",
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
  const crashMocks = createCrashDiscoveryServiceMocks(sandbox);
  const fuzzerMocks = createFuzzerDiscoveryServiceMocks(sandbox);

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
    crashMocks,
    fuzzerMocks,
    mockContainers: createMockContainers(),
    mockCrashData: createMockCrashData(),
    mockFuzzerData: createMockFuzzerData(),
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
 * Assert crash data structure is valid
 */
function assertCrashDataStructure(crashData) {
  if (!Array.isArray(crashData)) {
    throw new Error("Crash data should be an array");
  }

  crashData.forEach((fuzzerData, index) => {
    if (!fuzzerData.fuzzerName || typeof fuzzerData.fuzzerName !== "string") {
      throw new Error(
        `Fuzzer data at index ${index} should have a valid fuzzerName`,
      );
    }
    if (!Array.isArray(fuzzerData.crashes)) {
      throw new Error(
        `Fuzzer data at index ${index} should have crashes array`,
      );
    }
    if (!fuzzerData.outputDir || typeof fuzzerData.outputDir !== "string") {
      throw new Error(
        `Fuzzer data at index ${index} should have a valid outputDir`,
      );
    }
    if (!fuzzerData.lastScan || typeof fuzzerData.lastScan !== "string") {
      throw new Error(
        `Fuzzer data at index ${index} should have a valid lastScan timestamp`,
      );
    }

    fuzzerData.crashes.forEach((crash, crashIndex) => {
      if (!crash.id || typeof crash.id !== "string") {
        throw new Error(`Crash at index ${crashIndex} should have a valid id`);
      }
      if (!crash.filePath || typeof crash.filePath !== "string") {
        throw new Error(
          `Crash at index ${crashIndex} should have a valid filePath`,
        );
      }
      if (!crash.hash || typeof crash.hash !== "string") {
        throw new Error(
          `Crash at index ${crashIndex} should have a valid hash`,
        );
      }
      if (typeof crash.size !== "number") {
        throw new Error(
          `Crash at index ${crashIndex} should have a valid size`,
        );
      }
      if (!crash.timestamp || typeof crash.timestamp !== "string") {
        throw new Error(
          `Crash at index ${crashIndex} should have a valid timestamp`,
        );
      }
    });
  });
}

/**
 * Assert webview state contains crash data
 */
function assertWebviewCrashState(state, expectedCrashCount = null) {
  if (!state.crashes) {
    throw new Error("State should contain crashes object");
  }

  const crashState = state.crashes;
  if (typeof crashState.isLoading !== "boolean") {
    throw new Error("Crash state should have isLoading boolean");
  }
  if (!Array.isArray(crashState.data)) {
    throw new Error("Crash state should have data array");
  }

  if (expectedCrashCount !== null) {
    const totalCrashes = crashState.data.reduce(
      (sum, fuzzer) => sum + fuzzer.crashes.length,
      0,
    );
    if (totalCrashes !== expectedCrashCount) {
      throw new Error(
        `Expected ${expectedCrashCount} crashes, got ${totalCrashes}`,
      );
    }
  }

  // Validate crash data structure
  assertCrashDataStructure(crashState.data);
}

/**
 * Assert webview received crash-related message
 */
function assertCrashMessage(webview, messageType, expectedData = {}) {
  const messages = webview.getAllPostedMessages();
  const crashMessage = messages.find(
    (msg) =>
      msg.type === messageType &&
      (messageType !== "stateUpdate" || msg.state?.crashes),
  );

  if (!crashMessage) {
    throw new Error(`Expected to find ${messageType} message with crash data`);
  }

  Object.keys(expectedData).forEach((key) => {
    if (messageType === "stateUpdate" && key === "crashes") {
      assertWebviewCrashState(crashMessage.state, expectedData[key]);
    } else if (crashMessage[key] !== expectedData[key]) {
      throw new Error(
        `Expected ${key} to be ${expectedData[key]}, got ${crashMessage[key]}`,
      );
    }
  });

  return crashMessage;
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

/**
 * Assert webview state contains fuzzer data
 */
function assertWebviewFuzzerState(state, expectedFuzzerCount = null) {
  if (!state || !state.fuzzers) {
    throw new Error("State should contain fuzzers object");
  }

  const fuzzers = state.fuzzers;

  if (typeof fuzzers.isLoading !== "boolean") {
    throw new Error("fuzzers.isLoading should have isLoading boolean");
  }

  if (fuzzers.error !== null && typeof fuzzers.error !== "string") {
    throw new Error("fuzzers.error should be null or string");
  }

  if (!Array.isArray(fuzzers.data)) {
    throw new Error("fuzzers.data should be an array");
  }

  if (expectedFuzzerCount !== null) {
    if (fuzzers.data.length !== expectedFuzzerCount) {
      throw new Error(
        `Expected ${expectedFuzzerCount} fuzzers, got ${fuzzers.data.length}`,
      );
    }
  }
}

module.exports = {
  MockWebview,
  MockWebviewView,
  MockTreeView,
  MockTerminal,
  createVSCodeMocks,
  createMockContainers,
  createMockCrashData,
  createMockFuzzerData,
  createMockWebviewMessages,
  createFileSystemMocks,
  createDockerOperationsMocks,
  createCrashDiscoveryServiceMocks,
  createFuzzerDiscoveryServiceMocks,
  setupTestEnvironment,
  cleanupTestEnvironment,
  assertWebviewHTML,
  assertCrashDataStructure,
  assertFuzzerDataStructure,
  assertWebviewCrashState,
  assertWebviewFuzzerState,
  assertCrashMessage,
  waitForAsync,
  createMockExtensionContext,
};
