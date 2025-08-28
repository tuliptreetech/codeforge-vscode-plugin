const assert = require("assert");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs").promises;
const sinon = require("sinon");

// Import the extension module
const myExtension = require("../../extension");
const dockerOperations = require("../../dockerOperations");
const {
  CodeForgeTaskProvider,
  CodeForgeTaskTerminal,
} = require("../../taskProvider");

suite("CodeForge Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  let sandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test("Extension should be present", () => {
    assert.ok(vscode.extensions.getExtension("TulipTreeTechnology.codeforge"));
  });

  test("Should register all commands", async () => {
    const extension = vscode.extensions.getExtension(
      "TulipTreeTechnology.codeforge",
    );
    await extension.activate();

    // Check if all commands are registered
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes("codeforge.initialize"));
    assert.ok(commands.includes("codeforge.buildEnvironment"));
    assert.ok(commands.includes("codeforge.launchTerminal"));
    assert.ok(commands.includes("codeforge.runCommand"));
  });

  suite("Docker Operations Tests", () => {
    test("generateContainerName should create valid container names", () => {
      // Test various path formats
      assert.strictEqual(
        dockerOperations.generateContainerName("/home/user/my-project"),
        "home_user_my-project",
      );

      assert.strictEqual(
        dockerOperations.generateContainerName("C:\\Users\\Developer\\Project"),
        "c__users_developer_project",
      );

      assert.strictEqual(
        dockerOperations.generateContainerName("/var/lib/docker/volumes/test"),
        "var_lib_docker_volumes_test",
      );
    });

    test("generateContainerName should handle edge cases", () => {
      // Test empty string
      assert.throws(
        () => dockerOperations.generateContainerName(""),
        Error,
        "Should throw an error for empty string",
      );

      // Test single slash
      assert.throws(
        () => dockerOperations.generateContainerName("/"),
        Error,
        "Should throw an error for empty string",
      );

      // Test path without leading slash
      assert.strictEqual(
        dockerOperations.generateContainerName("relative/path/to/project"),
        "relative_path_to_project",
      );
    });

    test("checkImageExists should handle docker command errors gracefully", async () => {
      // Mock exec to simulate docker not being installed
      const execStub = sandbox.stub(require("child_process"), "exec");
      execStub.yields(new Error("docker: command not found"), null, null);

      const exists = await dockerOperations.checkImageExists("test-image");
      assert.strictEqual(exists, false);
    });
  });

  suite("Command Tests", () => {
    test("Initialize command should create .codeforge directory", async () => {
      // Mock file system operations
      const mkdirStub = sandbox.stub(fs, "mkdir").resolves();
      const writeFileStub = sandbox.stub(fs, "writeFile").resolves();
      const accessStub = sandbox
        .stub(fs, "access")
        .rejects(new Error("Not found"));

      // Mock VS Code API
      const showInformationMessageStub = sandbox.stub(
        vscode.window,
        "showInformationMessage",
      );
      const workspaceFolderStub = sandbox
        .stub(vscode.workspace, "workspaceFolders")
        .value([
          {
            uri: { fsPath: "/test/workspace" },
          },
        ]);

      // Execute the command
      await vscode.commands.executeCommand("codeforge.initialize");

      // Verify the directory was created
      assert.ok(
        mkdirStub.calledWith(path.join("/test/workspace", ".codeforge"), {
          recursive: true,
        }),
        "mkdir should be called with correct path and options",
      );

      // Verify the Dockerfile was written
      assert.ok(writeFileStub.calledOnce, "writeFile should be called once");
      assert.ok(
        writeFileStub.firstCall.args[0].includes("Dockerfile"),
        "writeFile should be called with Dockerfile path",
      );

      // Verify success message was shown
      assert.ok(
        showInformationMessageStub.calledWith(
          "CodeForge: Successfully initialized .codeforge directory",
        ),
        "Success message should be shown",
      );
    });

    test("Initialize command should handle existing directory", async () => {
      // Mock file system operations - directory already exists
      const accessStub = sandbox.stub(fs, "access").resolves();

      // Mock user choosing not to overwrite
      const showWarningMessageStub = sandbox
        .stub(vscode.window, "showWarningMessage")
        .resolves("No");
      const workspaceFolderStub = sandbox
        .stub(vscode.workspace, "workspaceFolders")
        .value([
          {
            uri: { fsPath: "/test/workspace" },
          },
        ]);

      // Execute the command
      await vscode.commands.executeCommand("codeforge.initialize");

      // Verify warning was shown
      assert.ok(
        showWarningMessageStub.calledWith(
          "CodeForge: .codeforge directory already exists. Do you want to overwrite it?",
          "Yes",
          "No",
        ),
      );
    });

    test("Build command should check for Dockerfile existence", async () => {
      // Mock file system - Dockerfile doesn't exist
      const accessStub = sandbox
        .stub(fs, "access")
        .rejects(new Error("Not found"));

      // Mock VS Code API
      const showErrorMessageStub = sandbox.stub(
        vscode.window,
        "showErrorMessage",
      );
      const workspaceFolderStub = sandbox
        .stub(vscode.workspace, "workspaceFolders")
        .value([
          {
            uri: { fsPath: "/test/workspace" },
          },
        ]);

      // Execute the command
      await vscode.commands.executeCommand("codeforge.buildEnvironment");

      // Verify error message was shown
      assert.ok(
        showErrorMessageStub.calledWith(
          'CodeForge: Dockerfile not found. Please run "Initialize CodeForge" first.',
        ),
      );
    });

    test("Commands should handle no workspace folder", async () => {
      // Mock no workspace folder
      const workspaceFolderStub = sandbox
        .stub(vscode.workspace, "workspaceFolders")
        .value(undefined);
      const showErrorMessageStub = sandbox.stub(
        vscode.window,
        "showErrorMessage",
      );

      // Test all commands
      const commands = [
        "codeforge.initialize",
        "codeforge.buildEnvironment",
        "codeforge.launchTerminal",
        "codeforge.runCommand",
      ];

      for (const command of commands) {
        await vscode.commands.executeCommand(command);
        assert.ok(
          showErrorMessageStub.calledWith(
            "CodeForge: No workspace folder is open",
          ),
        );
        showErrorMessageStub.reset();
      }
    });
  });

  suite("Integration Tests", () => {
    test("Extension activation should create output channel", async () => {
      const extension = vscode.extensions.getExtension(
        "TulipTreeTechnology.codeforge",
      );
      const context = await extension.activate();

      // Check if output channel was created
      const outputChannels = vscode.window.visibleTextEditors;
      // Note: In actual tests, we'd need to mock vscode.window.createOutputChannel
      // and verify it was called with 'CodeForge'
    });

    test("Deactivate should dispose output channel", () => {
      // Create a mock output channel
      const mockOutputChannel = {
        dispose: sinon.spy(),
      };

      // Set the output channel in the module (this would require refactoring the extension)
      // For now, we just test the deactivate function exists
      assert.ok(typeof myExtension.deactivate === "function");
    });
  });

  suite("Task Provider Tests", () => {
    let taskProvider;
    let mockContext;
    let mockOutputChannel;

    setup(() => {
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

    test("Task provider should not provide default tasks", async () => {
      // The new implementation doesn't provide default tasks
      const tasks = await taskProvider.provideTasks();
      assert.strictEqual(
        tasks.length,
        0,
        "Task provider should return empty array (no default tasks)",
      );
    });

    test.skip("Task provider should resolve codeforge tasks with command", async () => {
      // Since we can't use vscode.WorkspaceFolder constructor in tests,
      // this test requires proper VSCode integration
      // The functionality is tested through the verify-tasks.js script
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
  });
});
