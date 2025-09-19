/**
 * Activity Bar UI Test Suite
 *
 * This file contains tests for the CodeForge activity bar UI components:
 * - WebviewProvider functionality
 * - ContainerTreeProvider functionality
 * - Webview HTML content generation
 * - Message handling between webview and extension
 * - UI state updates and button enabling/disabling
 */

const assert = require("assert");
const sinon = require("sinon");
const vscode = require("vscode");
const path = require("path");

// Import the modules to test
const { CodeForgeWebviewProvider } = require("../../src/ui/webviewProvider");
const {
  CodeForgeContainerTreeProvider,
  ContainerTreeItem,
} = require("../../src/ui/containerTreeProvider");

// Import test helpers
const {
  MockWebview,
  MockWebviewView,
  MockTreeView,
  createMockExtensionContext,
  createMockContainers,
  createMockWebviewMessages,
  setupTestEnvironment,
  cleanupTestEnvironment,
  assertWebviewHTML,
  waitForAsync,
} = require("../utils/activity-bar-test-helpers");

suite("Activity Bar UI Test Suite", () => {
  let sandbox;
  let testEnvironment;

  setup(() => {
    sandbox = sinon.createSandbox();
    testEnvironment = setupTestEnvironment(sandbox);
  });

  teardown(() => {
    cleanupTestEnvironment(sandbox);
  });

  suite("WebviewProvider Tests", () => {
    let webviewProvider;
    let mockContext;
    let mockWebviewView;

    setup(() => {
      mockContext = createMockExtensionContext();
      webviewProvider = new CodeForgeWebviewProvider(mockContext);
      mockWebviewView = new MockWebviewView();
    });

    test("Should create webview provider with correct initial state", () => {
      assert.ok(webviewProvider, "WebviewProvider should be created");
      assert.strictEqual(
        webviewProvider._view,
        undefined,
        "Initial view should be undefined",
      );
      assert.deepStrictEqual(
        webviewProvider._currentState,
        {
          isInitialized: false,
          isBuilt: false,
          containerCount: 0,
          isLoading: false,
        },
        "Initial state should be correct",
      );
    });

    test("Should resolve webview view correctly", async () => {
      // Mock file system for state detection
      testEnvironment.fsMocks.access.rejects(new Error("Not found"));

      await webviewProvider.resolveWebviewView(mockWebviewView);

      assert.strictEqual(
        webviewProvider._view,
        mockWebviewView,
        "View should be set",
      );
      assert.ok(
        mockWebviewView.webview.html.length > 0,
        "HTML content should be set",
      );
      assert.ok(
        mockWebviewView.webview.onDidReceiveMessage.called,
        "Message handler should be registered",
      );
    });

    test("Should generate correct HTML content", () => {
      const html = webviewProvider._getHtmlForWebview(mockWebviewView.webview);

      assertWebviewHTML(html, [
        "CodeForge Control Panel",
        "Project Status",
        "Quick Actions",
        "Advanced Operations",
        "initialize-btn",
        "build-btn",
        "terminal-btn",
        "fuzzing-btn",
        "list-containers-btn",
        "run-command-btn",
        "terminate-all-btn",
        "cleanup-btn",
      ]);

      // Check for security measures
      assert.ok(
        html.includes("Content-Security-Policy"),
        "Should include CSP header",
      );
      assert.ok(html.includes("nonce-"), "Should include nonce for scripts");
    });

    test("Should handle command messages correctly", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      const commandMessage = testEnvironment.mockMessages.command;
      await webviewProvider._handleMessage(commandMessage);

      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.initialize",
        ),
        "Should execute correct VSCode command",
      );
    });

    test("Should handle requestState messages correctly", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Mock successful state detection
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.dockerMocks.checkImageExists.resolves(true);
      testEnvironment.dockerMocks.getActiveContainers.resolves(
        testEnvironment.mockContainers,
      );

      const requestStateMessage = testEnvironment.mockMessages.requestState;
      await webviewProvider._handleMessage(requestStateMessage);

      await waitForAsync(50); // Wait for async state detection

      assert.ok(
        mockWebviewView.webview.postMessage.called,
        "Should send state update message",
      );
    });

    test("Should handle unknown message types gracefully", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      const invalidMessage = testEnvironment.mockMessages.invalidMessage;
      await webviewProvider._handleMessage(invalidMessage);

      // Should not throw error and should log warning
      assert.ok(true, "Should handle unknown message types without throwing");
    });

    test("Should update state correctly", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      const newState = {
        isInitialized: true,
        isBuilt: true,
        containerCount: 2,
      };

      webviewProvider._updateState(newState);

      assert.deepStrictEqual(
        webviewProvider._currentState,
        {
          isInitialized: true,
          isBuilt: true,
          containerCount: 2,
          isLoading: false,
        },
        "State should be updated correctly",
      );

      assert.ok(
        mockWebviewView.webview.postMessage.calledWith({
          type: "stateUpdate",
          state: webviewProvider._currentState,
        }),
        "Should send state update to webview",
      );
    });

    test("Should detect project state correctly", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Mock initialized project
      testEnvironment.fsMocks.access.resolves();
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

    test("Should handle command execution errors", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Mock command execution failure
      testEnvironment.vscodeMocks.commands.executeCommand.rejects(
        new Error("Command failed"),
      );

      const commandMessage = testEnvironment.mockMessages.command;
      await webviewProvider._handleMessage(commandMessage);

      assert.ok(
        mockWebviewView.webview.postMessage.calledWith(
          sinon.match({
            type: "commandComplete",
            success: false,
            error: "Command failed",
          }),
        ),
        "Should send error message to webview",
      );
    });

    test("Should dispose correctly", () => {
      webviewProvider.dispose();
      assert.strictEqual(
        webviewProvider._view,
        undefined,
        "View should be cleared on dispose",
      );
    });

    test("Should refresh state when requested", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      const detectStateSpy = sandbox.spy(
        webviewProvider,
        "_detectAndUpdateState",
      );

      webviewProvider.refresh();

      assert.ok(
        detectStateSpy.called,
        "Should call _detectAndUpdateState when refreshed",
      );
    });
  });

  suite("ContainerTreeProvider Tests", () => {
    let treeProvider;

    setup(() => {
      treeProvider = new CodeForgeContainerTreeProvider();
    });

    test("Should create tree provider with correct initial state", () => {
      assert.ok(treeProvider, "TreeProvider should be created");
      assert.strictEqual(
        treeProvider._containers.length,
        0,
        "Initial containers should be empty",
      );
      assert.strictEqual(
        treeProvider._isLoading,
        false,
        "Initial loading state should be false",
      );
    });

    test("Should return correct tree items for containers", async () => {
      treeProvider._containers = testEnvironment.mockContainers.map(
        (container) => ({
          name: container.name,
          status: container.running ? "running" : "stopped",
          image: container.image,
          created: new Date(container.createdAt).toLocaleString(),
          type: container.type,
          id: container.id,
        }),
      );

      const children = await treeProvider.getChildren();

      assert.strictEqual(
        children.length,
        2,
        "Should return correct number of containers",
      );
      assert.ok(
        children[0] instanceof ContainerTreeItem,
        "Should return ContainerTreeItem instances",
      );
      assert.strictEqual(
        children[0].label,
        "test-container-1",
        "Should have correct container name",
      );
    });

    test("Should return 'No active containers' when empty", async () => {
      treeProvider._containers = [];

      const children = await treeProvider.getChildren();

      assert.strictEqual(children.length, 1, "Should return one item");
      assert.strictEqual(
        children[0].label,
        "No active containers",
        "Should show no containers message",
      );
    });

    test("Should return 'Loading containers...' when loading", async () => {
      treeProvider._isLoading = true;

      const children = await treeProvider.getChildren();

      assert.strictEqual(children.length, 1, "Should return one item");
      assert.strictEqual(
        children[0].label,
        "Loading containers...",
        "Should show loading message",
      );
    });

    test("Should refresh containers correctly", async () => {
      testEnvironment.dockerMocks.getActiveContainers.resolves(
        testEnvironment.mockContainers,
      );

      await treeProvider.refresh();

      assert.strictEqual(
        treeProvider._containers.length,
        2,
        "Should load containers",
      );
      assert.strictEqual(
        treeProvider._isLoading,
        false,
        "Should not be loading after refresh",
      );
    });

    test("Should handle refresh errors gracefully", async () => {
      testEnvironment.dockerMocks.getActiveContainers.rejects(
        new Error("Docker error"),
      );

      await treeProvider.refresh();

      assert.strictEqual(
        treeProvider._containers.length,
        0,
        "Should have empty containers on error",
      );
      assert.strictEqual(
        treeProvider._isLoading,
        false,
        "Should not be loading after error",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });

    test("Should terminate container correctly", async () => {
      const mockContainer = {
        id: "container1",
        name: "test-container-1",
        status: "running",
      };
      const containerTreeItem = new ContainerTreeItem(mockContainer);

      // Mock user confirmation
      testEnvironment.vscodeMocks.window.showWarningMessage.resolves("Yes");
      testEnvironment.dockerMocks.stopContainer.resolves();
      testEnvironment.dockerMocks.getActiveContainers.resolves([]);

      await treeProvider.terminateContainer(containerTreeItem);

      assert.ok(
        testEnvironment.dockerMocks.stopContainer.calledWith(
          "container1",
          true,
        ),
        "Should call stopContainer with correct parameters",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.called,
        "Should show success message",
      );
    });

    test("Should handle terminate container cancellation", async () => {
      const mockContainer = {
        id: "container1",
        name: "test-container-1",
        status: "running",
      };
      const containerTreeItem = new ContainerTreeItem(mockContainer);

      // Mock user cancellation
      testEnvironment.vscodeMocks.window.showWarningMessage.resolves("No");

      await treeProvider.terminateContainer(containerTreeItem);

      assert.ok(
        testEnvironment.dockerMocks.stopContainer.notCalled,
        "Should not call stopContainer when cancelled",
      );
    });

    test("Should show container logs correctly", async () => {
      const mockContainer = {
        id: "container1",
        name: "test-container-1",
        status: "running",
      };
      const containerTreeItem = new ContainerTreeItem(mockContainer);

      await treeProvider.showContainerLogs(containerTreeItem);

      assert.ok(
        testEnvironment.vscodeMocks.window.createTerminal.called,
        "Should create terminal for logs",
      );

      const terminalCall =
        testEnvironment.vscodeMocks.window.createTerminal.firstCall;
      assert.ok(
        terminalCall.args[0].name.includes("Logs: test-container-1"),
        "Terminal should have correct name",
      );
    });

    test("Should connect to container correctly", async () => {
      const mockContainer = {
        id: "container1",
        name: "test-container-1",
        status: "running",
      };
      const containerTreeItem = new ContainerTreeItem(mockContainer);

      await treeProvider.connectToContainer(containerTreeItem);

      assert.ok(
        testEnvironment.vscodeMocks.window.createTerminal.called,
        "Should create terminal for connection",
      );

      const terminalCall =
        testEnvironment.vscodeMocks.window.createTerminal.firstCall;
      assert.ok(
        terminalCall.args[0].name.includes("Shell: test-container-1"),
        "Terminal should have correct name",
      );
    });

    test("Should inspect container correctly", async () => {
      const mockContainer = {
        id: "container1",
        name: "test-container-1",
        status: "running",
      };
      const containerTreeItem = new ContainerTreeItem(mockContainer);

      // Mock child_process.exec with promisify support
      const childProcess = require("child_process");
      const util = require("util");
      const execStub = sandbox.stub(childProcess, "exec");

      // Mock the promisified version
      const promisifyStub = sandbox.stub(util, "promisify");
      const mockExecAsync = sandbox.stub().resolves({
        stdout: JSON.stringify([{ Id: "container1", Name: "test" }]),
        stderr: "",
      });
      promisifyStub.withArgs(childProcess.exec).returns(mockExecAsync);

      // Reset and configure the VSCode mocks
      testEnvironment.vscodeMocks.workspace.openTextDocument.reset();
      testEnvironment.vscodeMocks.window.showTextDocument.reset();

      // Mock document creation
      const mockDoc = { uri: { fsPath: "/tmp/inspect.json" } };
      testEnvironment.vscodeMocks.workspace.openTextDocument.resolves(mockDoc);
      testEnvironment.vscodeMocks.window.showTextDocument.resolves();

      await treeProvider.inspectContainer(containerTreeItem);

      assert.ok(
        testEnvironment.vscodeMocks.workspace.openTextDocument.called,
        "Should open text document",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showTextDocument.called,
        "Should show text document",
      );
    });

    test("Should return correct container count", () => {
      treeProvider._containers = testEnvironment.mockContainers.map((c) => ({
        ...c,
      }));

      assert.strictEqual(
        treeProvider.getContainerCount(),
        2,
        "Should return correct container count",
      );
    });

    test("Should return correct loading state", () => {
      treeProvider._isLoading = true;
      assert.strictEqual(
        treeProvider.isLoading(),
        true,
        "Should return correct loading state",
      );

      treeProvider._isLoading = false;
      assert.strictEqual(
        treeProvider.isLoading(),
        false,
        "Should return correct loading state",
      );
    });

    test("Should dispose correctly", () => {
      // Check if dispose method exists and can be called
      assert.ok(
        typeof treeProvider.dispose === "function",
        "Should have dispose method",
      );

      // Call dispose - it should not throw
      assert.doesNotThrow(() => {
        treeProvider.dispose();
      }, "Should dispose without throwing");
    });
  });

  suite("ContainerTreeItem Tests", () => {
    test("Should create tree item with correct properties", () => {
      const mockContainer = testEnvironment.mockContainers[0];
      const treeItem = new ContainerTreeItem(mockContainer);

      assert.strictEqual(
        treeItem.label,
        mockContainer.name,
        "Should have correct label",
      );
      assert.strictEqual(
        treeItem.contextValue,
        "container",
        "Should have correct context value",
      );
      assert.ok(
        treeItem.tooltip.includes(mockContainer.name),
        "Should have correct tooltip",
      );
      assert.ok(
        treeItem.description.includes("●"),
        "Should show running status",
      );
    });

    test("Should show correct icon for running container", () => {
      const runningContainer = {
        ...testEnvironment.mockContainers[0],
        status: "running",
      };
      const treeItem = new ContainerTreeItem(runningContainer);

      assert.strictEqual(
        treeItem.iconPath.id,
        "play-circle",
        "Should use play-circle icon for running container",
      );
    });

    test("Should show correct icon for stopped container", () => {
      const stoppedContainer = {
        ...testEnvironment.mockContainers[1],
        status: "stopped",
      };
      const treeItem = new ContainerTreeItem(stoppedContainer);

      assert.strictEqual(
        treeItem.iconPath.id,
        "stop-circle",
        "Should use stop-circle icon for stopped container",
      );
    });

    test("Should generate correct description", () => {
      const containerWithType = {
        ...testEnvironment.mockContainers[0],
        type: "development",
      };
      const treeItem = new ContainerTreeItem(containerWithType);

      assert.ok(
        treeItem.description.includes("[development]"),
        "Should include container type in description",
      );
    });

    test("Should handle container without type", () => {
      const containerWithoutType = { ...testEnvironment.mockContainers[0] };
      delete containerWithoutType.type;
      const treeItem = new ContainerTreeItem(containerWithoutType);

      assert.ok(
        treeItem.description,
        "Should have description even without type",
      );
    });
  });

  suite("Error Handling Tests", () => {
    test("WebviewProvider should handle message errors gracefully", async () => {
      const webviewProvider = new CodeForgeWebviewProvider(
        createMockExtensionContext(),
      );
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate error in message handling
      const errorMessage = { type: "command", command: "nonexistent" };
      await webviewProvider._handleMessage(errorMessage);

      // Check that some error handling occurred (either error message or command complete with error)
      const postMessageCalls = mockWebviewView.webview.postMessage.getCalls();
      const hasErrorResponse = postMessageCalls.some((call) => {
        const message = call.args[0];
        return (
          message &&
          (message.type === "error" ||
            (message.type === "commandComplete" && message.success === false))
        );
      });

      assert.ok(hasErrorResponse, "Should send error response to webview");
    });

    test("TreeProvider should handle getChildren errors gracefully", async () => {
      const treeProvider = new CodeForgeContainerTreeProvider();

      // Force an error in getChildren
      sandbox.stub(treeProvider, "_containers").get(() => {
        throw new Error("Test error");
      });

      const children = await treeProvider.getChildren();

      assert.strictEqual(children.length, 1, "Should return error item");
      assert.strictEqual(
        children[0].label,
        "Error loading containers",
        "Should show error message",
      );
    });
  });
});
