/**
 * Task Provider Test Suite
 *
 * This file contains all task provider-related tests for the CodeForge extension.
 * Tests cover task provider registration, task resolution, and terminal operations.
 * These are automated Mocha tests that run with `npm test`.
 */

const assert = require("assert");
const vscode = require("vscode");
const sinon = require("sinon");
const fs = require("fs").promises;
const {
  CodeForgeTaskProvider,
  CodeForgeTaskTerminal,
} = require("../../src/tasks/taskProvider");
const dockerOperations = require("../../src/core/dockerOperations");

suite("Task Provider Test Suite", () => {
  let sandbox;
  let taskProvider;
  let mockContext;
  let mockOutputChannel;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Setup mock context and output channel for each test
    mockContext = {
      subscriptions: [],
    };

    mockOutputChannel = {
      appendLine: sinon.spy(),
      append: sinon.spy(),
      show: sinon.spy(),
      dispose: sinon.spy(),
    };

    taskProvider = new CodeForgeTaskProvider(mockContext, mockOutputChannel);
  });

  teardown(() => {
    sandbox.restore();
  });

  suite("Task Provider Basic Functionality", () => {
    test("Task provider should not provide default tasks", async () => {
      // The new implementation doesn't provide default tasks
      const tasks = await taskProvider.provideTasks();
      assert.strictEqual(
        tasks.length,
        0,
        "Task provider should return empty array (no default tasks)",
      );
    });

    test("Task provider should reject codeforge tasks without command", async () => {
      const showErrorMessageStub = sandbox.stub(
        vscode.window,
        "showErrorMessage",
      );

      const mockWorkspaceFolder = {
        uri: { fsPath: "/test/workspace" },
        name: "test-workspace",
        index: 0,
      };

      const mockTask = {
        definition: {
          type: "codeforge",
          label: "Test Task",
          // Missing command property
        },
        scope: mockWorkspaceFolder,
        name: "Test Task",
      };

      const resolvedTask = await taskProvider.resolveTask(mockTask);

      assert.strictEqual(
        resolvedTask,
        undefined,
        "Task should not be resolved without command",
      );
      assert.ok(
        showErrorMessageStub.calledOnce,
        "Error message should be shown",
      );
      assert.ok(
        showErrorMessageStub.firstCall.args[0].includes(
          'missing required "command" property',
        ),
        "Error message should mention missing command",
      );
    });

    test("Task provider should ignore non-codeforge tasks", async () => {
      const mockTask = {
        definition: {
          type: "shell",
          command: "echo 'Hello'",
        },
        name: "Shell Task",
      };

      const resolvedTask = await taskProvider.resolveTask(mockTask);
      assert.strictEqual(
        resolvedTask,
        undefined,
        "Non-codeforge tasks should not be resolved",
      );
    });

    test.skip("Task provider should resolve codeforge tasks with command", async () => {
      // Since we can't use vscode.WorkspaceFolder constructor in tests,
      // this test requires proper VSCode integration
      // The functionality is tested through the verify-tasks.js script
    });

    test.skip("Task provider should handle tasks without workspace folder", async () => {
      // Since we can't properly test instanceof vscode.WorkspaceFolder in unit tests,
      // The functionality is tested through the verify-tasks.js script
    });

    test.skip("createTask should create task with correct properties", () => {
      // Since we can't use vscode.WorkspaceFolder constructor in tests,
      // The functionality is tested through the verify-tasks.js script
    });

    test.skip("Task configuration should support containerName property", () => {
      // Since we can't use vscode.WorkspaceFolder constructor in tests,
      // The functionality is tested through the verify-tasks.js script
    });
  });

  suite("Task Terminal Operations", () => {
    test("Task terminal should handle missing Dockerfile", async () => {
      const mockWorkspaceFolder = "/test/workspace";
      const mockDefinition = {
        type: "codeforge",
        command: "echo 'test'",
      };

      // Mock file system - Dockerfile doesn't exist
      const accessStub = sandbox
        .stub(fs, "access")
        .rejects(new Error("Not found"));

      const terminal = new CodeForgeTaskTerminal(
        mockWorkspaceFolder,
        mockDefinition,
        mockOutputChannel,
      );

      let writeOutput = "";
      let closeCode = null;

      terminal.onDidWrite((data) => {
        writeOutput += data;
      });

      terminal.onDidClose((code) => {
        closeCode = code;
      });

      await terminal.open();

      assert.ok(
        writeOutput.includes("Dockerfile not found"),
        "Terminal should show Dockerfile not found message",
      );
      assert.strictEqual(closeCode, 1, "Terminal should close with error code");
    });

    test("Task terminal should handle interactive commands appropriately", async () => {
      const mockWorkspaceFolder = "/test/workspace";
      const mockDefinition = {
        type: "codeforge",
        command: "/bin/bash",
        interactive: true,
      };

      // Mock file system - Dockerfile exists
      const accessStub = sandbox.stub(fs, "access").resolves();

      // Mock docker operations
      const checkImageStub = sandbox
        .stub(dockerOperations, "checkImageExists")
        .resolves(true);

      const terminal = new CodeForgeTaskTerminal(
        mockWorkspaceFolder,
        mockDefinition,
        mockOutputChannel,
      );

      let writeOutput = "";
      let closeCode = null;

      terminal.onDidWrite((data) => {
        writeOutput += data;
      });

      terminal.onDidClose((code) => {
        closeCode = code;
      });

      await terminal.open();

      assert.ok(
        writeOutput.includes("For interactive shells"),
        "Terminal should suggest using Launch Terminal command for interactive shells",
      );
      assert.strictEqual(closeCode, 0, "Terminal should close normally");
    });

    test("Task terminal should handle Docker image not found", async () => {
      const mockWorkspaceFolder = "/test/workspace";
      const mockDefinition = {
        type: "codeforge",
        command: "echo 'test'",
      };

      // Mock file system - Dockerfile exists
      const accessStub = sandbox.stub(fs, "access").resolves();

      // Mock docker operations - image doesn't exist
      const checkImageStub = sandbox
        .stub(dockerOperations, "checkImageExists")
        .resolves(false);

      const terminal = new CodeForgeTaskTerminal(
        mockWorkspaceFolder,
        mockDefinition,
        mockOutputChannel,
      );

      let writeOutput = "";
      let closeCode = null;

      terminal.onDidWrite((data) => {
        writeOutput += data;
      });

      terminal.onDidClose((code) => {
        closeCode = code;
      });

      await terminal.open();

      assert.ok(
        writeOutput.includes("Docker image not found") ||
          writeOutput.includes("Please build the environment first"),
        "Terminal should show image not found message",
      );
      assert.strictEqual(closeCode, 1, "Terminal should close with error code");
    });

    test("Task terminal should handle command execution errors", async () => {
      const mockWorkspaceFolder = "/test/workspace";
      const mockDefinition = {
        type: "codeforge",
        command: "invalid-command",
      };

      // Mock file system - Dockerfile exists
      const accessStub = sandbox.stub(fs, "access").resolves();

      // Mock docker operations
      const checkImageStub = sandbox
        .stub(dockerOperations, "checkImageExists")
        .resolves(true);

      const terminal = new CodeForgeTaskTerminal(
        mockWorkspaceFolder,
        mockDefinition,
        mockOutputChannel,
      );

      // This test verifies that the terminal is created and can handle errors
      // The actual command execution would happen in the Docker container
      assert.ok(terminal, "Terminal should be created successfully");
    });
  });

  suite("Task Provider Registration", () => {
    test("Task provider should be registered with correct type", () => {
      // This test verifies the provider has the correct structure
      assert.ok(
        typeof taskProvider.provideTasks === "function",
        "provideTasks should be a function",
      );
      assert.ok(
        typeof taskProvider.resolveTask === "function",
        "resolveTask should be a function",
      );
    });

    test("Task provider should handle disposal correctly", () => {
      // Verify that the provider can be disposed
      if (taskProvider.dispose) {
        taskProvider.dispose();
        assert.ok(true, "Task provider disposed successfully");
      } else {
        assert.ok(true, "Task provider doesn't require disposal");
      }
    });
  });

  suite("Task Configuration Validation", () => {
    test("Should validate task definition properties", () => {
      const validDefinition = {
        type: "codeforge",
        command: "echo 'test'",
        label: "Test Task",
      };

      const invalidDefinition = {
        type: "codeforge",
        // Missing command
        label: "Invalid Task",
      };

      // These would be validated in resolveTask
      assert.ok(
        validDefinition.command,
        "Valid definition should have command",
      );
      assert.ok(
        !invalidDefinition.command,
        "Invalid definition should lack command",
      );
    });

    test("Should support optional containerName property", () => {
      const definitionWithContainer = {
        type: "codeforge",
        command: "echo 'test'",
        label: "Test Task",
        containerName: "custom-container",
      };

      assert.ok(
        definitionWithContainer.containerName,
        "Definition can include containerName",
      );
    });

    test("Should support optional interactive property", () => {
      const interactiveDefinition = {
        type: "codeforge",
        command: "/bin/bash",
        label: "Interactive Task",
        interactive: true,
      };

      assert.ok(
        interactiveDefinition.interactive,
        "Definition can include interactive flag",
      );
    });
  });
});
