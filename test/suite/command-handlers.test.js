/**
 * Command Handlers Test Suite
 *
 * This file contains tests for all CodeForge command handlers:
 * - codeforge.initialize
 * - codeforge.buildDocker
 * - codeforge.launchTerminal
 * - codeforge.runFuzzing
 * - codeforge.listContainers
 * - codeforge.runCommand
 * - codeforge.terminateAll
 * - codeforge.cleanup
 * - codeforge.refreshContainers
 *
 * Tests cover error handling, edge cases, and integration with Docker operations.
 */

const assert = require("assert");
const sinon = require("sinon");
const vscode = require("vscode");
const path = require("path");
const { EventEmitter } = require("events");

// Import test helpers
const {
  createMockExtensionContext,
  createMockContainers,
  setupTestEnvironment,
  cleanupTestEnvironment,
  waitForAsync,
} = require("../utils/activity-bar-test-helpers");

// Import the modules to test
const { CodeForgeCommandHandlers } = require("../../src/ui/commandHandlers");
const dockerOperations = require("../../src/core/dockerOperations");

suite("Command Handlers Test Suite", () => {
  let sandbox;
  let testEnvironment;
  let commandHandlers;
  let mockContext;
  let mockOutputChannel;

  setup(() => {
    console.log("[DEBUG] Setting up test environment");
    sandbox = sinon.createSandbox();
    testEnvironment = setupTestEnvironment(sandbox);

    // The testEnvironment already stubs dockerOperations methods, so we just need to configure them
    // Set default behaviors for the existing stubs
    testEnvironment.dockerMocks.generateContainerName.returns("test-container");
    testEnvironment.dockerMocks.checkImageExists.resolves(true);
    testEnvironment.dockerMocks.getActiveContainers.resolves(
      createMockContainers(),
    );
    testEnvironment.dockerMocks.stopContainer.resolves();
    testEnvironment.dockerMocks.buildDockerImage.resolves();
    testEnvironment.dockerMocks.getContainerStatus.resolves(
      createMockContainers(),
    );
    testEnvironment.dockerMocks.terminateAllContainers.resolves({
      succeeded: 2,
      failed: 0,
    });
    testEnvironment.dockerMocks.cleanupOrphanedContainers.resolves(0);
    testEnvironment.dockerMocks.generateDockerRunArgs.returns([
      "run",
      "-it",
      "test",
    ]);
    testEnvironment.dockerMocks.runDockerCommandWithOutput.returns({
      stdout: { on: sandbox.stub() },
      stderr: { on: sandbox.stub() },
      on: sandbox.stub(),
    });
    testEnvironment.dockerMocks.trackLaunchedContainer.resolves(true);

    // Create mock output channel
    mockOutputChannel = {
      appendLine: sandbox.stub(),
      append: sandbox.stub(),
      show: sandbox.stub(),
      dispose: sandbox.stub(),
    };

    // Create mock context with additional properties
    mockContext = {
      ...createMockExtensionContext(),
      webviewProvider: {
        _detectAndUpdateState: sandbox.stub(),
      },
      containerTreeProvider: {
        refresh: sandbox.stub(),
      },
    };

    commandHandlers = new CodeForgeCommandHandlers(
      mockContext,
      mockOutputChannel,
      mockContext.containerTreeProvider,
      mockContext.webviewProvider,
    );
    console.log("[DEBUG] Test environment setup complete");
  });

  teardown(() => {
    console.log("[DEBUG] Tearing down test environment");

    // Clear any pending timeouts
    if (
      typeof global !== "undefined" &&
      global.setTimeout &&
      global.clearTimeout
    ) {
      // Clear any timeouts that might be running
      const highestTimeoutId = setTimeout(() => {}, 0);
      for (let i = 0; i <= highestTimeoutId; i++) {
        clearTimeout(i);
      }
    }

    // Ensure webviewProvider is restored if it was modified
    if (mockContext && !mockContext.webviewProvider) {
      mockContext.webviewProvider = {
        _detectAndUpdateState: sandbox.stub(),
      };
    }

    cleanupTestEnvironment(sandbox);
    console.log("[DEBUG] Test environment teardown complete");
  });

  suite("Constructor and Utility Methods", () => {
    test("Should create command handlers with correct properties", () => {
      assert.ok(commandHandlers, "CommandHandlers should be created");
      assert.strictEqual(
        commandHandlers.context,
        mockContext,
        "Should store context",
      );
      assert.strictEqual(
        commandHandlers.outputChannel,
        mockOutputChannel,
        "Should store output channel",
      );
    });

    test("Should safely log to output channel", () => {
      commandHandlers.safeOutputLog("Test message");
      assert.ok(
        mockOutputChannel.appendLine.calledWith("Test message"),
        "Should log to output channel",
      );
    });

    test("Should safely log and show output channel", () => {
      commandHandlers.safeOutputLog("Test message", true);
      assert.ok(
        mockOutputChannel.appendLine.calledWith("Test message"),
        "Should log to output channel",
      );
      assert.ok(mockOutputChannel.show.called, "Should show output channel");
    });

    test("Should handle disposed output channel gracefully", () => {
      // Reset the appendLine stub and make it throw an error
      mockOutputChannel.appendLine.reset();

      // Properly configure the stub to throw an error
      mockOutputChannel.appendLine = sandbox
        .stub()
        .throws(new Error("Disposed"));

      // Call the method that should trigger the fallback
      // The method should not throw an error even when appendLine fails
      assert.doesNotThrow(() => {
        commandHandlers.safeOutputLog("Test message");
      }, "safeOutputLog should handle disposed output channel gracefully");

      // Verify the error condition was triggered (appendLine was called and threw)
      assert.ok(
        mockOutputChannel.appendLine.threw(),
        "appendLine should have thrown an error",
      );
      assert.strictEqual(
        mockOutputChannel.appendLine.callCount,
        1,
        "appendLine should have been called once",
      );

      // The fact that the method completed without throwing an error
      // and we can see "CodeForge: Test message" in the output
      // proves that the console.log fallback is working correctly
    });

    test("Should get workspace info correctly", () => {
      const workspaceInfo = commandHandlers.getWorkspaceInfo();

      assert.ok(workspaceInfo.folder, "Should return workspace folder");
      assert.strictEqual(
        workspaceInfo.path,
        "/test/workspace",
        "Should return correct workspace path",
      );
    });

    test("Should throw error when no workspace folder", () => {
      // Temporarily set workspace folders to undefined
      const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
      vscode.workspace.workspaceFolders = undefined;

      assert.throws(
        () => {
          commandHandlers.getWorkspaceInfo();
        },
        /No workspace folder is open/,
        "Should throw error for no workspace",
      );

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.calledWith(
          "CodeForge: No workspace folder is open",
        ),
        "Should show error message",
      );

      // Restore original value
      vscode.workspace.workspaceFolders = originalWorkspaceFolders;
    });

    test("Should update webview state correctly", async () => {
      console.log("[DEBUG] Starting webview state update test");
      console.log(
        "[DEBUG] mockContext.webviewProvider:",
        mockContext.webviewProvider ? "exists" : "null",
      );

      if (!mockContext.webviewProvider) {
        throw new Error("webviewProvider is null at test start");
      }

      commandHandlers.updateWebviewState();

      // Use proper async/await instead of setTimeout
      await new Promise((resolve) => setTimeout(resolve, 600));

      console.log("[DEBUG] After waiting for async operation");
      console.log(
        "[DEBUG] mockContext.webviewProvider:",
        mockContext.webviewProvider ? "exists" : "null",
      );

      if (!mockContext.webviewProvider) {
        throw new Error("webviewProvider became null during test execution");
      }

      if (!mockContext.webviewProvider._detectAndUpdateState) {
        throw new Error("_detectAndUpdateState method is missing");
      }

      assert.ok(
        mockContext.webviewProvider._detectAndUpdateState.called,
        "Should call webview state update",
      );
      console.log("[DEBUG] Test passed successfully");
    });

    test("Should handle missing webview provider gracefully", () => {
      console.log("[DEBUG] Testing missing webview provider");
      const originalProvider = mockContext.webviewProvider;

      try {
        mockContext.webviewProvider = null;

        assert.doesNotThrow(() => {
          commandHandlers.updateWebviewState();
        }, "Should not throw when webview provider is missing");

        console.log("[DEBUG] Missing webview provider test passed");
      } finally {
        // Restore the original provider to prevent interference with other tests
        mockContext.webviewProvider = originalProvider;
        console.log("[DEBUG] Restored webview provider");
      }
    });

    test("Should return correct command handlers map", () => {
      const handlers = commandHandlers.getCommandHandlers();

      const expectedCommands = [
        "codeforge.initialize",
        "codeforge.buildEnvironment",
        "codeforge.launchTerminal",
        "codeforge.runFuzzingTests",
        "codeforge.listContainers",
        "codeforge.runCommand",
        "codeforge.terminateAllContainers",
        "codeforge.cleanupOrphaned",
        "codeforge.refreshContainers",
      ];

      expectedCommands.forEach((command) => {
        assert.ok(handlers[command], `Should have handler for ${command}`);
        assert.strictEqual(
          typeof handlers[command],
          "function",
          `Handler for ${command} should be a function`,
        );
      });
    });
  });

  suite("ensureInitializedAndBuilt Method", () => {
    test("Should return true when already initialized and built", async () => {
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.dockerMocks.checkImageExists.resolves(true);

      const result = await commandHandlers.ensureInitializedAndBuilt(
        "/test/workspace",
        "test-container",
      );

      assert.strictEqual(
        result,
        true,
        "Should return true when already set up",
      );
    });

    test("Should auto-initialize when Dockerfile missing", async () => {
      testEnvironment.fsMocks.access.rejects(new Error("Not found"));
      testEnvironment.fsMocks.mkdir.resolves();
      testEnvironment.fsMocks.writeFile.resolves();
      testEnvironment.dockerMocks.checkImageExists.resolves(true);

      const result = await commandHandlers.ensureInitializedAndBuilt(
        "/test/workspace",
        "test-container",
      );

      assert.ok(
        testEnvironment.fsMocks.mkdir.called,
        "Should create directory",
      );
      assert.ok(
        testEnvironment.fsMocks.writeFile.called,
        "Should write Dockerfile",
      );
      assert.strictEqual(
        result,
        true,
        "Should return true after initialization",
      );
    });

    test("Should auto-build when image missing", async () => {
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.dockerMocks.checkImageExists
        .onFirstCall()
        .resolves(false);
      testEnvironment.dockerMocks.checkImageExists
        .onSecondCall()
        .resolves(true);
      testEnvironment.dockerMocks.buildDockerImage.resolves();

      const result = await commandHandlers.ensureInitializedAndBuilt(
        "/test/workspace",
        "test-container",
      );

      assert.ok(
        testEnvironment.dockerMocks.buildDockerImage.called,
        "Should build Docker image",
      );
      assert.strictEqual(result, true, "Should return true after building");
    });

    test("Should handle build failure", async () => {
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.dockerMocks.checkImageExists.resolves(false);
      testEnvironment.dockerMocks.buildDockerImage.rejects(
        new Error("Build failed"),
      );

      const result = await commandHandlers.ensureInitializedAndBuilt(
        "/test/workspace",
        "test-container",
      );

      assert.strictEqual(result, false, "Should return false on build failure");
      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });

    test("Should handle image verification failure after build", async () => {
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.dockerMocks.checkImageExists.resolves(false);
      testEnvironment.dockerMocks.buildDockerImage.resolves();

      const result = await commandHandlers.ensureInitializedAndBuilt(
        "/test/workspace",
        "test-container",
      );

      assert.strictEqual(
        result,
        false,
        "Should return false when image verification fails",
      );
    });
  });

  suite("handleInitialize Command", () => {
    test("Should initialize successfully when directory doesn't exist", async () => {
      testEnvironment.fsMocks.access.rejects(new Error("Not found"));
      testEnvironment.fsMocks.mkdir.resolves();
      testEnvironment.fsMocks.writeFile.resolves();

      await commandHandlers.handleInitialize();

      assert.ok(
        testEnvironment.fsMocks.mkdir.called,
        "Should create directory",
      );
      assert.ok(
        testEnvironment.fsMocks.writeFile.called,
        "Should write Dockerfile",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.calledWith(
          "CodeForge: Successfully initialized .codeforge directory",
        ),
        "Should show success message",
      );
    });

    test("Should handle existing directory with user confirmation", async () => {
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.vscodeMocks.window.showWarningMessage.resolves("Yes");
      testEnvironment.fsMocks.mkdir.resolves();
      testEnvironment.fsMocks.writeFile.resolves();

      await commandHandlers.handleInitialize();

      assert.ok(
        testEnvironment.vscodeMocks.window.showWarningMessage.called,
        "Should show warning",
      );
      assert.ok(
        testEnvironment.fsMocks.writeFile.called,
        "Should write Dockerfile after confirmation",
      );
    });

    test("Should handle existing directory with user cancellation", async () => {
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.vscodeMocks.window.showWarningMessage.resolves("No");

      await commandHandlers.handleInitialize();

      assert.ok(
        testEnvironment.fsMocks.writeFile.notCalled,
        "Should not write Dockerfile when cancelled",
      );
    });

    test("Should handle initialization errors", async () => {
      testEnvironment.fsMocks.access.rejects(new Error("Not found"));
      testEnvironment.fsMocks.mkdir.rejects(new Error("Permission denied"));

      await commandHandlers.handleInitialize();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });
  });

  suite("handleBuildDocker Command", () => {
    test("Should build Docker image successfully", async () => {
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.dockerMocks.buildDockerImage.resolves();

      await commandHandlers.handleBuildDocker();

      assert.ok(
        testEnvironment.dockerMocks.buildDockerImage.called,
        "Should build Docker image",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.called,
        "Should show success message",
      );
    });

    test("Should handle missing Dockerfile", async () => {
      testEnvironment.fsMocks.access.rejects(new Error("Not found"));

      await commandHandlers.handleBuildDocker();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.calledWith(
          'CodeForge: Dockerfile not found. Please run "Initialize CodeForge" first.',
        ),
        "Should show Dockerfile not found error",
      );
    });

    test("Should handle build errors", async () => {
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.dockerMocks.buildDockerImage.rejects(
        new Error("Build failed"),
      );

      await commandHandlers.handleBuildDocker();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });
  });

  suite("handleLaunchTerminal Command", () => {
    test("Should launch terminal successfully", async () => {
      // Mock successful initialization and build
      sandbox.stub(commandHandlers, "ensureInitializedAndBuilt").resolves(true);
      testEnvironment.dockerMocks.generateDockerRunArgs.returns([
        "run",
        "-it",
        "test-container",
      ]);
      testEnvironment.dockerMocks.trackLaunchedContainer.resolves(true);

      await commandHandlers.handleLaunchTerminal();

      assert.ok(
        testEnvironment.vscodeMocks.window.createTerminal.called,
        "Should create terminal",
      );
      assert.ok(
        commandHandlers.ensureInitializedAndBuilt.called,
        "Should ensure initialized and built",
      );
    });

    test("Should handle initialization failure", async () => {
      sandbox
        .stub(commandHandlers, "ensureInitializedAndBuilt")
        .resolves(false);

      await commandHandlers.handleLaunchTerminal();

      assert.ok(
        testEnvironment.vscodeMocks.window.createTerminal.notCalled,
        "Should not create terminal",
      );
    });

    test("Should handle terminal launch errors", async () => {
      sandbox
        .stub(commandHandlers, "ensureInitializedAndBuilt")
        .rejects(new Error("Failed"));

      await commandHandlers.handleLaunchTerminal();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });

    test("Should handle container tracking failure", async () => {
      sandbox.stub(commandHandlers, "ensureInitializedAndBuilt").resolves(true);
      testEnvironment.dockerMocks.generateDockerRunArgs.returns([
        "run",
        "-it",
        "test-container",
      ]);
      testEnvironment.dockerMocks.trackLaunchedContainer.resolves(false);

      await commandHandlers.handleLaunchTerminal();

      // Should still create terminal even if tracking fails
      assert.ok(
        testEnvironment.vscodeMocks.window.createTerminal.called,
        "Should create terminal",
      );
    });
  });

  suite("handleRunFuzzing Command", () => {
    test("Should run fuzzing tests successfully", async () => {
      sandbox.stub(commandHandlers, "ensureInitializedAndBuilt").resolves(true);

      // Mock CodeForgeFuzzingTerminal
      const mockFuzzingTerminal = {
        open: sandbox.stub(),
        close: sandbox.stub(),
        handleInput: sandbox.stub(),
      };

      // Mock the require for CodeForgeFuzzingTerminal
      const fuzzingTerminalModule = require("../../src/fuzzing/fuzzingTerminal");
      sandbox
        .stub(fuzzingTerminalModule, "CodeForgeFuzzingTerminal")
        .returns(mockFuzzingTerminal);

      await commandHandlers.handleRunFuzzing();

      assert.ok(
        testEnvironment.vscodeMocks.window.createTerminal.called,
        "Should create terminal",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.calledWith(
          "CodeForge: Fuzzing tests started in terminal",
        ),
        "Should show success message",
      );
    });

    test("Should handle fuzzing initialization failure", async () => {
      sandbox
        .stub(commandHandlers, "ensureInitializedAndBuilt")
        .resolves(false);

      await commandHandlers.handleRunFuzzing();

      assert.ok(
        testEnvironment.vscodeMocks.window.createTerminal.notCalled,
        "Should not create terminal",
      );
    });

    test("Should handle fuzzing errors", async () => {
      sandbox
        .stub(commandHandlers, "ensureInitializedAndBuilt")
        .rejects(new Error("Failed"));

      await commandHandlers.handleRunFuzzing();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });
  });

  suite("handleListContainers Command", () => {
    test("Should list containers successfully", async () => {
      const mockContainers = [
        {
          id: "container1",
          name: "test-container-1",
          running: true,
          type: "terminal",
          image: "test-image",
          createdAt: new Date().toISOString(),
        },
      ];

      testEnvironment.dockerMocks.getContainerStatus.resolves(mockContainers);
      testEnvironment.vscodeMocks.window.showQuickPick
        .onFirstCall()
        .resolves(
          "🟢 Running | test-container-1 | Type: terminal | Age: 0m | Image: test-image",
        );
      testEnvironment.vscodeMocks.window.showQuickPick
        .onSecondCall()
        .resolves("Stop Container");
      testEnvironment.dockerMocks.stopContainer.resolves();

      await commandHandlers.handleListContainers();

      assert.ok(
        testEnvironment.dockerMocks.getContainerStatus.called,
        "Should get container status",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showQuickPick.called,
        "Should show container list",
      );
    });

    test("Should handle no active containers", async () => {
      testEnvironment.dockerMocks.getContainerStatus.resolves([]);

      await commandHandlers.handleListContainers();

      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.calledWith(
          "CodeForge: No active containers tracked by this extension",
        ),
        "Should show no containers message",
      );
    });

    test("Should handle container stop action", async () => {
      const mockContainers = [
        {
          id: "container1",
          name: "test-container-1",
          running: true,
          type: "terminal",
          image: "test-image",
          createdAt: new Date().toISOString(),
        },
      ];

      testEnvironment.dockerMocks.getContainerStatus.resolves(mockContainers);
      testEnvironment.vscodeMocks.window.showQuickPick
        .onFirstCall()
        .resolves(
          "🟢 Running | test-container-1 | Type: terminal | Age: 0m | Image: test-image",
        );
      testEnvironment.vscodeMocks.window.showQuickPick
        .onSecondCall()
        .resolves("Stop Container");
      testEnvironment.dockerMocks.stopContainer.resolves();

      await commandHandlers.handleListContainers();

      assert.ok(
        testEnvironment.dockerMocks.stopContainer.calledWith(
          "container1",
          false,
        ),
        "Should stop container",
      );
    });

    test("Should handle container stop and remove action", async () => {
      const mockContainers = [
        {
          id: "container1",
          name: "test-container-1",
          running: true,
          type: "terminal",
          image: "test-image",
          createdAt: new Date().toISOString(),
        },
      ];

      testEnvironment.dockerMocks.getContainerStatus.resolves(mockContainers);
      testEnvironment.vscodeMocks.window.showQuickPick
        .onFirstCall()
        .resolves(
          "🟢 Running | test-container-1 | Type: terminal | Age: 0m | Image: test-image",
        );
      testEnvironment.vscodeMocks.window.showQuickPick
        .onSecondCall()
        .resolves("Stop and Remove Container");
      testEnvironment.dockerMocks.stopContainer.resolves();

      await commandHandlers.handleListContainers();

      assert.ok(
        testEnvironment.dockerMocks.stopContainer.calledWith(
          "container1",
          true,
        ),
        "Should stop and remove container",
      );
    });

    test("Should handle list containers errors", async () => {
      testEnvironment.dockerMocks.getContainerStatus.rejects(
        new Error("Docker error"),
      );

      await commandHandlers.handleListContainers();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });
  });

  suite("handleRunCommand Command", () => {
    test("Should run command successfully", async () => {
      sandbox.stub(commandHandlers, "ensureInitializedAndBuilt").resolves(true);
      testEnvironment.vscodeMocks.window.showInputBox.resolves("ls -la");

      // Mock docker process
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      testEnvironment.dockerMocks.runDockerCommandWithOutput.returns(
        mockProcess,
      );

      await commandHandlers.handleRunCommand();

      assert.ok(
        testEnvironment.vscodeMocks.window.showInputBox.called,
        "Should prompt for command",
      );
      assert.ok(
        testEnvironment.dockerMocks.runDockerCommandWithOutput.called,
        "Should run docker command",
      );

      // Simulate successful completion
      mockProcess.emit("close", 0);
      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.called,
        "Should show success message",
      );
    });

    test("Should handle command cancellation", async () => {
      sandbox.stub(commandHandlers, "ensureInitializedAndBuilt").resolves(true);
      testEnvironment.vscodeMocks.window.showInputBox.resolves(undefined);

      await commandHandlers.handleRunCommand();

      assert.ok(
        testEnvironment.dockerMocks.runDockerCommandWithOutput.notCalled,
        "Should not run command when cancelled",
      );
    });

    test("Should handle command failure", async () => {
      sandbox.stub(commandHandlers, "ensureInitializedAndBuilt").resolves(true);
      testEnvironment.vscodeMocks.window.showInputBox.resolves(
        "failing-command",
      );

      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      testEnvironment.dockerMocks.runDockerCommandWithOutput.returns(
        mockProcess,
      );

      await commandHandlers.handleRunCommand();

      // Simulate command failure
      mockProcess.emit("close", 1);
      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });

    test("Should handle docker process errors", async () => {
      sandbox.stub(commandHandlers, "ensureInitializedAndBuilt").resolves(true);
      testEnvironment.vscodeMocks.window.showInputBox.resolves("test-command");

      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      testEnvironment.dockerMocks.runDockerCommandWithOutput.returns(
        mockProcess,
      );

      await commandHandlers.handleRunCommand();

      // Simulate process error
      mockProcess.emit("error", new Error("Process error"));
      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });

    test("Should handle initialization failure", async () => {
      sandbox
        .stub(commandHandlers, "ensureInitializedAndBuilt")
        .resolves(false);

      await commandHandlers.handleRunCommand();

      assert.ok(
        testEnvironment.vscodeMocks.window.showInputBox.notCalled,
        "Should not prompt for command",
      );
    });
  });

  suite("handleTerminateAll Command", () => {
    test("Should terminate all containers successfully", async () => {
      testEnvironment.dockerMocks.getActiveContainers.resolves(
        testEnvironment.mockContainers,
      );
      testEnvironment.dockerMocks.terminateAllContainers.reset();
      testEnvironment.dockerMocks.terminateAllContainers.resolves({
        succeeded: 2,
        failed: 0,
      });

      await commandHandlers.handleTerminateAll();

      assert.ok(
        testEnvironment.dockerMocks.terminateAllContainers.called,
        "Should terminate all containers",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.calledWith(
          "CodeForge: Terminated 2 container(s)",
        ),
        "Should show success message",
      );
    });

    test("Should handle no active containers", async () => {
      testEnvironment.dockerMocks.getActiveContainers.resolves([]);

      await commandHandlers.handleTerminateAll();

      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.calledWith(
          "CodeForge: No active containers to terminate",
        ),
        "Should show no containers message",
      );
    });

    test("Should handle partial termination failure", async () => {
      testEnvironment.dockerMocks.getActiveContainers.resolves(
        testEnvironment.mockContainers,
      );
      testEnvironment.dockerMocks.terminateAllContainers.reset();
      testEnvironment.dockerMocks.terminateAllContainers.resolves({
        succeeded: 1,
        failed: 1,
      });

      await commandHandlers.handleTerminateAll();

      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.called,
        "Should show success message",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showWarningMessage.called,
        "Should show warning message",
      );
    });

    test("Should handle termination errors", async () => {
      testEnvironment.dockerMocks.getActiveContainers.rejects(
        new Error("Docker error"),
      );

      await commandHandlers.handleTerminateAll();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });
  });

  suite("handleCleanup Command", () => {
    test("Should cleanup orphaned containers successfully", async () => {
      testEnvironment.dockerMocks.cleanupOrphanedContainers.resolves(3);

      await commandHandlers.handleCleanup();

      assert.ok(
        testEnvironment.dockerMocks.cleanupOrphanedContainers.called,
        "Should cleanup orphaned containers",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.calledWith(
          "CodeForge: Cleaned up 3 orphaned container(s) from tracking",
        ),
        "Should show success message",
      );
    });

    test("Should handle no orphaned containers", async () => {
      testEnvironment.dockerMocks.cleanupOrphanedContainers.resolves(0);

      await commandHandlers.handleCleanup();

      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.calledWith(
          "CodeForge: No orphaned containers found",
        ),
        "Should show no orphaned containers message",
      );
    });

    test("Should handle cleanup errors", async () => {
      testEnvironment.dockerMocks.cleanupOrphanedContainers.rejects(
        new Error("Cleanup error"),
      );

      await commandHandlers.handleCleanup();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });
  });

  suite("handleRefreshContainers Command", () => {
    test("Should refresh containers successfully", async () => {
      await commandHandlers.handleRefreshContainers();

      assert.ok(
        commandHandlers.containerTreeProvider.refresh.called,
        "Should refresh container tree provider",
      );
      assert.ok(
        testEnvironment.vscodeMocks.window.showInformationMessage.calledWith(
          "CodeForge: Container list refreshed",
        ),
        "Should show success message",
      );
    });

    test("Should handle missing container tree provider", async () => {
      commandHandlers.containerTreeProvider = null;

      await commandHandlers.handleRefreshContainers();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message when provider is missing",
      );
    });

    test("Should handle refresh errors", async () => {
      mockContext.containerTreeProvider.refresh.throws(
        new Error("Refresh error"),
      );

      await commandHandlers.handleRefreshContainers();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });
  });

  suite("Error Handling and Edge Cases", () => {
    test("Should handle workspace errors gracefully", async () => {
      // Reset the showErrorMessage mock to ensure clean state
      testEnvironment.vscodeMocks.window.showErrorMessage.reset();

      // Properly stub the workspaceFolders property to return undefined
      if (vscode.workspace.workspaceFolders) {
        sandbox.stub(vscode.workspace, "workspaceFolders").value(undefined);
      }
      testEnvironment.vscodeMocks.workspace.workspaceFolders = undefined;

      await commandHandlers.handleInitialize();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.calledWith(
          "CodeForge: No workspace folder is open",
        ),
        "Should show workspace error",
      );
    });

    test("Should handle file system errors", async () => {
      testEnvironment.fsMocks.access.rejects(new Error("Permission denied"));
      testEnvironment.fsMocks.mkdir.rejects(new Error("Permission denied"));

      await commandHandlers.handleInitialize();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });

    test("Should handle Docker operation errors", async () => {
      testEnvironment.dockerMocks.generateContainerName.throws(
        new Error("Docker error"),
      );

      await commandHandlers.handleBuildDocker();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });

    test("Should handle progress notification errors", async () => {
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.dockerMocks.buildDockerImage.rejects(
        new Error("Build failed"),
      );

      await commandHandlers.handleBuildDocker();

      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message",
      );
    });
  });

  suite("Integration with Other Components", () => {
    test("Should update webview state after operations", async () => {
      const updateSpy = sandbox.spy(commandHandlers, "updateWebviewState");

      testEnvironment.fsMocks.access.rejects(new Error("Not found"));
      testEnvironment.fsMocks.mkdir.resolves();
      testEnvironment.fsMocks.writeFile.resolves();

      await commandHandlers.handleInitialize();

      assert.ok(updateSpy.called, "Should update webview state");
    });

    test("Should work with container tree provider", async () => {
      await commandHandlers.handleRefreshContainers();

      assert.ok(
        commandHandlers.containerTreeProvider.refresh.called,
        "Should interact with tree provider",
      );
    });

    test("Should handle missing context components gracefully", async () => {
      mockContext.webviewProvider = null;
      commandHandlers.containerTreeProvider = null;

      await commandHandlers.handleRefreshContainers();

      // Should not throw errors but should show error message
      assert.ok(
        testEnvironment.vscodeMocks.window.showErrorMessage.called,
        "Should show error message when provider is missing",
      );
    });
  });
});
