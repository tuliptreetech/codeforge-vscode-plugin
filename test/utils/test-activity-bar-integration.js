/**
 * Activity Bar Integration Tests
 *
 * This file contains integration tests for the CodeForge activity bar functionality.
 * Tests cover end-to-end workflows from UI button clicks to command execution,
 * webview and tree view integration, state synchronization between UI components,
 * and container management through the UI.
 */

const assert = require("assert");
const sinon = require("sinon");
const vscode = require("vscode");
const path = require("path");

// Import the modules to test
const { CodeForgeWebviewProvider } = require("../../src/ui/webviewProvider");
const {
  CodeForgeContainerTreeProvider,
} = require("../../src/ui/containerTreeProvider");
const { CodeForgeCommandHandlers } = require("../../src/ui/commandHandlers");

// Import test helpers
const {
  MockWebviewView,
  createMockExtensionContext,
  createMockContainers,
  createMockWebviewMessages,
  setupTestEnvironment,
  cleanupTestEnvironment,
  waitForAsync,
} = require("./activity-bar-test-helpers");

/**
 * Integration Test Suite for Activity Bar Components
 * Tests the interaction between webview, tree provider, and command handlers
 */
suite("Activity Bar Integration Test Suite", () => {
  let sandbox;
  let testEnvironment;
  let webviewProvider;
  let treeProvider;
  let commandHandlers;
  let mockContext;
  let mockOutputChannel;

  setup(() => {
    sandbox = sinon.createSandbox();
    testEnvironment = setupTestEnvironment(sandbox);

    // Create mock output channel
    mockOutputChannel = {
      appendLine: sandbox.stub(),
      append: sandbox.stub(),
      show: sandbox.stub(),
      dispose: sandbox.stub(),
    };

    // Create mock context that connects all components
    mockContext = {
      ...createMockExtensionContext(),
      webviewProvider: null,
      containerTreeProvider: null,
    };

    // Create instances
    webviewProvider = new CodeForgeWebviewProvider(mockContext);
    treeProvider = new CodeForgeContainerTreeProvider();
    commandHandlers = new CodeForgeCommandHandlers(
      mockContext,
      mockOutputChannel,
    );

    // Connect components
    mockContext.webviewProvider = webviewProvider;
    mockContext.containerTreeProvider = treeProvider;
  });

  teardown(() => {
    cleanupTestEnvironment(sandbox);
  });

  suite("End-to-End Workflow Tests", () => {
    test("Should complete full initialization workflow from webview", async () => {
      const mockWebviewView = new MockWebviewView();

      // Setup file system mocks for initialization
      testEnvironment.fsMocks.access.rejects(new Error("Not found"));
      testEnvironment.fsMocks.mkdir.resolves();
      testEnvironment.fsMocks.writeFile.resolves();

      // Resolve webview
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate initialize button click from webview
      const initializeMessage = {
        type: "command",
        command: "initialize",
      };

      await webviewProvider._handleMessage(initializeMessage);

      // Verify the command was executed
      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.initializeProject",
        ),
        "Should execute initializeProject command",
      );

      // Verify success message was sent to webview
      assert.ok(
        mockWebviewView.webview.postMessage.calledWith(
          sinon.match({
            type: "commandComplete",
            success: true,
            command: "initialize",
          }),
        ),
        "Should send success message to webview",
      );

      // Wait for state update
      await waitForAsync(1100);

      // Verify state was updated
      assert.ok(
        mockWebviewView.webview.postMessage.calledWith(
          sinon.match({
            type: "stateUpdate",
          }),
        ),
        "Should send state update to webview",
      );
    });

    test("Should complete full build workflow from webview", async () => {
      const mockWebviewView = new MockWebviewView();

      // Setup mocks for build process
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.dockerMocks.pullAndTagDockerImage = sandbox
        .stub()
        .resolves();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate run button click (build button removed)
      const runMessage = {
        type: "command",
        command: "buildEnvironment",
      };

      await webviewProvider._handleMessage(buildMessage);

      // Verify command execution
      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.buildFuzzingTests",
        ),
        "Should execute build command",
      );

      // Verify success response
      assert.ok(
        mockWebviewView.webview.postMessage.calledWith(
          sinon.match({
            type: "commandComplete",
            success: true,
            command: "buildEnvironment",
          }),
        ),
        "Should send success message",
      );
    });

    test("Should complete terminal launch workflow", async () => {
      const mockWebviewView = new MockWebviewView();

      // Setup mocks for terminal launch
      sandbox.stub(commandHandlers, "ensureInitializedAndBuilt").resolves(true);
      testEnvironment.dockerMocks.generateDockerRunArgs = sandbox
        .stub()
        .returns(["run", "-it", "test"]);
      testEnvironment.dockerMocks.trackLaunchedContainer = sandbox
        .stub()
        .resolves(true);

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate terminal button click
      const terminalMessage = {
        type: "command",
        command: "launchTerminal",
      };

      await webviewProvider._handleMessage(terminalMessage);

      // Verify terminal creation
      assert.ok(
        testEnvironment.vscodeMocks.window.createTerminal.called,
        "Should create terminal",
      );

      // Verify success message
      assert.ok(
        mockWebviewView.webview.postMessage.calledWith(
          sinon.match({
            type: "commandComplete",
            success: true,
            command: "launchTerminal",
          }),
        ),
        "Should send success message",
      );
    });

    test("Should handle container management workflow", async () => {
      const mockWebviewView = new MockWebviewView();

      // Setup container data
      testEnvironment.dockerMocks.getContainerStatus = sandbox.stub().resolves([
        {
          id: "container1",
          name: "test-container",
          running: true,
          type: "terminal",
          image: "test-image",
          createdAt: new Date().toISOString(),
        },
      ]);

      testEnvironment.vscodeMocks.window.showQuickPick
        .onFirstCall()
        .resolves(
          "🟢 Running | test-container | Type: terminal | Age: 0m | Image: test-image",
        );
      testEnvironment.vscodeMocks.window.showQuickPick
        .onSecondCall()
        .resolves("Stop Container");
      testEnvironment.dockerMocks.stopContainer = sandbox.stub().resolves();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate list containers button click
      const listMessage = {
        type: "command",
        command: "listContainers",
      };

      await webviewProvider._handleMessage(listMessage);

      // Verify container listing and management
      assert.ok(
        testEnvironment.dockerMocks.getContainerStatus.called,
        "Should get container status",
      );
      assert.ok(
        testEnvironment.dockerMocks.stopContainer.called,
        "Should stop selected container",
      );
    });
  });

  suite("State Synchronization Tests", () => {
    test("Should synchronize state between webview and tree provider", async () => {
      const mockWebviewView = new MockWebviewView();

      // Setup container data
      const mockContainers = testEnvironment.mockContainers;
      testEnvironment.dockerMocks.getActiveContainers.resolves(mockContainers);

      // Initialize both components
      await webviewProvider.resolveWebviewView(mockWebviewView);
      await treeProvider.refresh();

      // Verify both components have the same container data
      assert.strictEqual(
        treeProvider.getContainerCount(),
        mockContainers.length,
        "Tree provider should have correct container count",
      );

      // Verify webview state reflects container count
      await webviewProvider._detectAndUpdateState();
      assert.strictEqual(
        webviewProvider._currentState.containerCount,
        mockContainers.length,
        "Webview should have correct container count",
      );
    });

    test("Should update both components when containers change", async () => {
      const mockWebviewView = new MockWebviewView();

      // Start with containers
      testEnvironment.dockerMocks.getActiveContainers.resolves(
        testEnvironment.mockContainers,
      );

      await webviewProvider.resolveWebviewView(mockWebviewView);
      await treeProvider.refresh();

      // Simulate container termination
      testEnvironment.dockerMocks.getActiveContainers.resolves([]);
      testEnvironment.dockerMocks.terminateAllContainers = sandbox
        .stub()
        .resolves({
          succeeded: 2,
          failed: 0,
        });

      // Trigger termination through webview
      const terminateMessage = {
        type: "command",
        command: "terminateAllContainers",
      };

      await webviewProvider._handleMessage(terminateMessage);

      // Wait for state updates
      await waitForAsync(600);

      // Verify both components reflect the change
      await treeProvider.refresh();
      assert.strictEqual(
        treeProvider.getContainerCount(),
        0,
        "Tree provider should show no containers",
      );
    });

    test("Should handle state updates from external changes", async () => {
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate external state change (e.g., containers started outside VSCode)
      testEnvironment.dockerMocks.getActiveContainers.resolves(
        testEnvironment.mockContainers,
      );

      // Trigger refresh
      const refreshMessage = {
        type: "command",
        command: "refreshContainers",
      };

      await webviewProvider._handleMessage(refreshMessage);

      // Wait for updates
      await waitForAsync(600);

      // Verify state was updated
      assert.ok(
        mockWebviewView.webview.postMessage.calledWith(
          sinon.match({
            type: "stateUpdate",
            state: sinon.match({
              containerCount: testEnvironment.mockContainers.length,
            }),
          }),
        ),
        "Should update webview state with new container count",
      );
    });
  });

  suite("Component Integration Tests", () => {
    test("Should integrate webview provider with command handlers", async () => {
      const mockWebviewView = new MockWebviewView();

      // Setup command handler spy
      const initializeSpy = sandbox.spy(commandHandlers, "handleInitialize");

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Mock the command execution to call our handler
      testEnvironment.vscodeMocks.commands.executeCommand.callsFake(
        async (command) => {
          if (command === "codeforge.initializeProject") {
            return await commandHandlers.handleInitializeProject();
          }
        },
      );

      // Simulate webview command
      const message = {
        type: "command",
        command: "initialize",
      };

      await webviewProvider._handleMessage(message);

      // Verify integration
      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.initializeProject",
        ),
        "Should execute VSCode command",
      );
    });

    test("Should integrate tree provider with command handlers", async () => {
      // Setup container data
      const mockContainer = {
        id: "container1",
        name: "test-container",
        status: "running",
        image: "test-image",
        created: new Date().toLocaleString(),
        type: "terminal",
      };

      treeProvider._containers = [mockContainer];

      // Create tree item
      const {
        ContainerTreeItem,
      } = require("../../src/ui/containerTreeProvider");
      const treeItem = new ContainerTreeItem(mockContainer);

      // Mock user confirmation
      testEnvironment.vscodeMocks.window.showWarningMessage.resolves("Yes");
      testEnvironment.dockerMocks.stopContainer = sandbox.stub().resolves();
      testEnvironment.dockerMocks.getActiveContainers.resolves([]);

      // Test termination through tree provider
      await treeProvider.terminateContainer(treeItem);

      // Verify integration
      assert.ok(
        testEnvironment.dockerMocks.stopContainer.calledWith(
          "container1",
          true,
        ),
        "Should stop container through Docker operations",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.called,
        "Should show success message",
      );
    });

    test("Should handle cross-component error propagation", async () => {
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Mock command failure
      testEnvironment.vscodeMocks.commands.executeCommand.rejects(
        new Error("Command failed"),
      );

      // Simulate command from webview
      const message = {
        type: "command",
        command: "initialize",
      };

      await webviewProvider._handleMessage(message);

      // Verify error handling
      assert.ok(
        mockWebviewView.webview.postMessage.calledWith(
          sinon.match({
            type: "commandComplete",
            success: false,
            error: "Command failed",
          }),
        ),
        "Should propagate error to webview",
      );
    });
  });

  suite("UI State Management Tests", () => {
    test("Should enable/disable buttons based on project state", async () => {
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Test uninitialized state
      testEnvironment.fsMocks.access.rejects(new Error("Not found"));
      testEnvironment.dockerMocks.checkImageExists.resolves(false);

      await webviewProvider._detectAndUpdateState();

      // Verify state reflects uninitialized project
      assert.strictEqual(
        webviewProvider._currentState.isInitialized,
        false,
        "Should detect uninitialized state",
      );
      assert.strictEqual(
        webviewProvider._currentState.isBuilt,
        false,
        "Should detect unbuilt state",
      );

      // Test initialized but not built state
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.dockerMocks.checkImageExists.resolves(false);

      await webviewProvider._detectAndUpdateState();

      assert.strictEqual(
        webviewProvider._currentState.isInitialized,
        true,
        "Should detect initialized state",
      );
      assert.strictEqual(
        webviewProvider._currentState.isBuilt,
        false,
        "Should detect unbuilt state",
      );

      // Test fully ready state
      testEnvironment.dockerMocks.checkImageExists.resolves(true);
      testEnvironment.dockerMocks.getActiveContainers.resolves(
        testEnvironment.mockContainers,
      );

      await webviewProvider._detectAndUpdateState();

      assert.strictEqual(
        webviewProvider._currentState.isInitialized,
        true,
        "Should detect initialized state",
      );
      assert.strictEqual(
        webviewProvider._currentState.isBuilt,
        true,
        "Should detect built state",
      );
      assert.strictEqual(
        webviewProvider._currentState.containerCount,
        2,
        "Should detect correct container count",
      );
    });

    test("Should handle loading states correctly", async () => {
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate loading state during command execution
      const buildMessage = {
        type: "command",
        command: "buildEnvironment",
      };

      // Mock slow build process
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.dockerMocks.pullAndTagDockerImage = sandbox
        .stub()
        .callsFake(() => {
          return new Promise((resolve) => setTimeout(resolve, 100));
        });

      // Start build process
      const buildPromise = webviewProvider._handleMessage(buildMessage);

      // Verify loading state is handled
      await buildPromise;

      assert.ok(
        mockWebviewView.webview.postMessage.calledWith(
          sinon.match({
            type: "commandComplete",
          }),
        ),
        "Should complete command execution",
      );
    });
  });

  suite("Error Recovery Tests", () => {
    test("Should recover from webview communication errors", async () => {
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate webview disposal during operation
      webviewProvider._view = null;

      const message = {
        type: "command",
        command: "initialize",
      };

      // Should not throw error
      await webviewProvider._handleMessage(message);

      assert.ok(true, "Should handle disposed webview gracefully");
    });

    test("Should recover from tree provider errors", async () => {
      // Force error in tree provider
      testEnvironment.dockerMocks.getActiveContainers.rejects(
        new Error("Docker error"),
      );

      await treeProvider.refresh();

      // Should show error but not crash
      assert.strictEqual(
        treeProvider.getContainerCount(),
        0,
        "Should reset container count on error",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });

    test("Should handle command handler failures gracefully", async () => {
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Mock workspace error
      testEnvironment.vscodeMocks.workspace.workspaceFolders = undefined;

      const message = {
        type: "command",
        command: "initialize",
      };

      await webviewProvider._handleMessage(message);

      // Should handle error and notify webview
      assert.ok(
        mockWebviewView.webview.postMessage.calledWith(
          sinon.match({
            type: "commandComplete",
            success: false,
          }),
        ),
        "Should notify webview of failure",
      );
    });
  });

  suite("Performance and Resource Management", () => {
    test("Should properly dispose of resources", () => {
      const mockWebviewView = new MockWebviewView();

      webviewProvider.resolveWebviewView(mockWebviewView);

      // Dispose components
      webviewProvider.dispose();
      treeProvider.dispose();

      assert.strictEqual(
        webviewProvider._view,
        undefined,
        "Should clear webview reference",
      );
    });

    test("Should handle multiple rapid state updates", async () => {
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Trigger multiple rapid updates
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(webviewProvider._detectAndUpdateState());
      }

      await Promise.all(promises);

      // Should handle all updates without errors
      assert.ok(
        mockWebviewView.webview.postMessage.called,
        "Should handle multiple updates",
      );
    });

    test("Should handle concurrent command executions", async () => {
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Setup slow operations
      testEnvironment.vscodeMocks.commands.executeCommand.callsFake(() => {
        return new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Execute multiple commands concurrently
      const messages = [
        { type: "command", command: "initialize" },
        { type: "command", command: "refreshContainers" },
        { type: "requestState" },
      ];

      const promises = messages.map((msg) =>
        webviewProvider._handleMessage(msg),
      );
      await Promise.all(promises);

      // Should handle all commands
      assert.strictEqual(
        testEnvironment.vscodeMocks.commands.executeCommand.callCount,
        2,
        "Should execute all commands",
      );
    });
  });
});

module.exports = {
  // Export test utilities for use in other integration tests
  createIntegratedTestEnvironment: (sandbox) => {
    const testEnv = setupTestEnvironment(sandbox);

    const mockContext = {
      ...createMockExtensionContext(),
      webviewProvider: null,
      containerTreeProvider: null,
    };

    const mockOutputChannel = {
      appendLine: sandbox.stub(),
      append: sandbox.stub(),
      show: sandbox.stub(),
      dispose: sandbox.stub(),
    };

    const webviewProvider = new CodeForgeWebviewProvider(mockContext);
    const treeProvider = new CodeForgeContainerTreeProvider();
    const commandHandlers = new CodeForgeCommandHandlers(
      mockContext,
      mockOutputChannel,
    );

    mockContext.webviewProvider = webviewProvider;
    mockContext.containerTreeProvider = treeProvider;

    return {
      ...testEnv,
      webviewProvider,
      treeProvider,
      commandHandlers,
      mockContext,
      mockOutputChannel,
    };
  },
};
