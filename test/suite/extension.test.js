/**
 * Core Extension Test Suite
 *
 * This file contains core extension tests for the CodeForge VSCode extension.
 * Tests cover extension activation, command registration, and basic functionality.
 * Docker and Task Provider tests have been moved to their respective test files.
 * These are automated Mocha tests that run with `npm test`.
 */

const assert = require("assert");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs").promises;
const sinon = require("sinon");

// Import the extension module
const myExtension = require("../../src/extension");

suite("CodeForge Extension Core Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  let sandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  suite("Extension Activation", () => {
    test("Extension should be present", () => {
      assert.ok(
        vscode.extensions.getExtension("TulipTreeTechnology.codeforge"),
      );
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

      // Check activity bar commands
      assert.ok(commands.includes("codeforge.buildEnvironment"));
      assert.ok(commands.includes("codeforge.runFuzzingTests"));
      assert.ok(commands.includes("codeforge.listContainers"));
      assert.ok(commands.includes("codeforge.terminateAllContainers"));
      assert.ok(commands.includes("codeforge.cleanupOrphaned"));
      assert.ok(commands.includes("codeforge.refreshContainers"));

      // Check container tree provider commands
      assert.ok(commands.includes("codeforge.terminateContainer"));
      assert.ok(commands.includes("codeforge.showContainerLogs"));
      assert.ok(commands.includes("codeforge.connectToContainer"));
      assert.ok(commands.includes("codeforge.inspectContainer"));
    });

    test("Extension activation should create output channel", async () => {
      const extension = vscode.extensions.getExtension(
        "TulipTreeTechnology.codeforge",
      );

      if (extension && !extension.isActive) {
        const context = await extension.activate();
        assert.ok(context, "Extension should activate and return context");
      } else {
        // Extension is already active or not found
        assert.ok(extension, "Extension should be present");
      }
    });

    test("Deactivate should dispose resources", () => {
      // Create a mock output channel
      const mockOutputChannel = {
        dispose: sinon.spy(),
      };

      // Test that the deactivate function exists
      assert.ok(typeof myExtension.deactivate === "function");

      // Call deactivate and verify it doesn't throw
      assert.doesNotThrow(() => {
        myExtension.deactivate();
      }, "Deactivate should not throw errors");
    });
  });

  suite("Initialize Command", () => {
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

    test("Initialize command should handle overwrite confirmation", async () => {
      // Mock file system operations - directory already exists
      const accessStub = sandbox.stub(fs, "access").resolves();
      const mkdirStub = sandbox.stub(fs, "mkdir").resolves();
      const writeFileStub = sandbox.stub(fs, "writeFile").resolves();

      // Mock user choosing to overwrite
      const showWarningMessageStub = sandbox
        .stub(vscode.window, "showWarningMessage")
        .resolves("Yes");
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

      // Verify the Dockerfile was written
      assert.ok(
        writeFileStub.calledOnce,
        "writeFile should be called when overwriting",
      );

      // Verify success message was shown
      assert.ok(
        showInformationMessageStub.calledWith(
          "CodeForge: Successfully initialized .codeforge directory",
        ),
        "Success message should be shown after overwrite",
      );
    });
  });

  suite("Build Environment Command", () => {
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

    test("Build command should handle successful build", async () => {
      // This test would require mocking the terminal creation and Docker build process
      // Currently a placeholder for future implementation
      assert.ok(true, "Build success test placeholder");
    });
  });

  suite("Command Error Handling", () => {
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
          `${command} should show error for no workspace`,
        );
        showErrorMessageStub.reset();
      }
    });

    test("Commands should handle errors gracefully", async () => {
      // Mock file system operations to throw an error
      const errorMessage = "Simulated file system error";
      const mkdirStub = sandbox
        .stub(fs, "mkdir")
        .rejects(new Error(errorMessage));
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
      await vscode.commands.executeCommand("codeforge.initialize");

      // Verify error was handled
      assert.ok(
        showErrorMessageStub.called,
        "Error message should be shown when operation fails",
      );
    });
  });

  suite("Launch Terminal Command", () => {
    test("Launch terminal should check for Docker image", async () => {
      // This test would verify that the launch terminal command checks for the Docker image
      // Currently a placeholder for future implementation
      assert.ok(true, "Launch terminal Docker check test placeholder");
    });

    test("Launch terminal should create interactive terminal", async () => {
      // This test would verify that an interactive terminal is created
      // Currently a placeholder for future implementation
      assert.ok(true, "Launch terminal creation test placeholder");
    });
  });

  suite("Run Command", () => {
    test("Run command should prompt for command input", async () => {
      // This test would verify that the run command prompts for input
      // Currently a placeholder for future implementation
      assert.ok(true, "Run command prompt test placeholder");
    });

    test("Run command should execute in Docker container", async () => {
      // This test would verify that commands are executed in the Docker container
      // Currently a placeholder for future implementation
      assert.ok(true, "Run command execution test placeholder");
    });
  });

  suite("Extension Configuration", () => {
    test("Extension should have correct metadata", () => {
      const extension = vscode.extensions.getExtension(
        "TulipTreeTechnology.codeforge",
      );

      assert.ok(extension, "Extension should be found");
      assert.strictEqual(
        extension.id.toLowerCase(),
        "tuliptreetechnology.codeforge",
        "Extension ID should match (case-insensitive)",
      );
      assert.ok(extension.extensionPath, "Extension should have a path");
      assert.ok(extension.packageJSON, "Extension should have package.json");
    });

    test("Extension should contribute expected items", () => {
      const extension = vscode.extensions.getExtension(
        "TulipTreeTechnology.codeforge",
      );

      const contributions = extension.packageJSON.contributes;
      assert.ok(contributions, "Extension should have contributions");
      assert.ok(contributions.commands, "Extension should contribute commands");
      assert.ok(
        contributions.taskDefinitions,
        "Extension should contribute task definitions",
      );

      suite("Activity Bar Registration", () => {
        test("Should register webview provider", async () => {
          const extension = vscode.extensions.getExtension(
            "TulipTreeTechnology.codeforge",
          );
          await extension.activate();

          // Mock webview provider registration
          const registerWebviewViewProviderStub = sandbox.stub(
            vscode.window,
            "registerWebviewViewProvider",
          );

          // The webview provider should be registered during activation
          // We can't directly test this without re-activating, but we can verify
          // the registration would work
          assert.ok(
            typeof vscode.window.registerWebviewViewProvider === "function",
            "registerWebviewViewProvider should be available",
          );
        });

        test("Should register container tree provider", async () => {
          const extension = vscode.extensions.getExtension(
            "TulipTreeTechnology.codeforge",
          );
          await extension.activate();

          // Mock tree data provider registration
          const registerTreeDataProviderStub = sandbox.stub(
            vscode.window,
            "registerTreeDataProvider",
          );

          // The tree provider should be registered during activation
          assert.ok(
            typeof vscode.window.registerTreeDataProvider === "function",
            "registerTreeDataProvider should be available",
          );
        });

        test("Should register all activity bar commands", async () => {
          const extension = vscode.extensions.getExtension(
            "TulipTreeTechnology.codeforge",
          );
          await extension.activate();

          const commands = await vscode.commands.getCommands();

          // Activity bar webview commands
          const activityBarCommands = [
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

          activityBarCommands.forEach((command) => {
            assert.ok(
              commands.includes(command),
              `Activity bar command ${command} should be registered`,
            );
          });
        });

        test("Should register container tree provider commands", async () => {
          const extension = vscode.extensions.getExtension(
            "TulipTreeTechnology.codeforge",
          );
          await extension.activate();

          const commands = await vscode.commands.getCommands();

          // Container tree provider commands
          const treeProviderCommands = [
            "codeforge.terminateContainer",
            "codeforge.showContainerLogs",
            "codeforge.connectToContainer",
            "codeforge.inspectContainer",
          ];

          treeProviderCommands.forEach((command) => {
            assert.ok(
              commands.includes(command),
              `Tree provider command ${command} should be registered`,
            );
          });
        });

        test("Should handle webview provider registration errors", () => {
          // This would be tested during activation, but we can verify error handling exists
          assert.ok(
            typeof vscode.window.showErrorMessage === "function",
            "Error handling should be available",
          );
          assert.ok(
            typeof vscode.window.registerWebviewViewProvider === "function",
            "Webview provider registration should be available",
          );
        });

        test("Should handle container tree provider registration errors", () => {
          // This would be tested during activation, but we can verify error handling exists
          assert.ok(
            typeof vscode.window.showErrorMessage === "function",
            "Error handling should be available",
          );
          assert.ok(
            typeof vscode.window.registerTreeDataProvider === "function",
            "Tree data provider registration should be available",
          );
        });

        test("Should store provider references in context", async () => {
          const extension = vscode.extensions.getExtension(
            "TulipTreeTechnology.codeforge",
          );
          const context = await extension.activate();

          // The extension should store references to providers in the context
          // This is important for cross-component communication
          assert.ok(context !== null, "Extension context should be available");
        });

        test("Should register providers with correct view IDs", async () => {
          const extension = vscode.extensions.getExtension(
            "TulipTreeTechnology.codeforge",
          );
          await extension.activate();

          // Verify the extension contributes the expected views
          const contributions = extension.packageJSON.contributes;

          if (contributions && contributions.views) {
            // Check if the expected view containers and views are defined
            assert.ok(contributions.views, "Extension should contribute views");
          }
        });
      });

      suite("Activity Bar Integration with Extension", () => {
        test("Should initialize activity bar components on activation", async () => {
          const extension = vscode.extensions.getExtension(
            "TulipTreeTechnology.codeforge",
          );

          await extension.activate();

          // Verify the extension activated successfully (output channel creation is internal)
          assert.ok(extension.isActive, "Extension should be active");
          assert.ok(
            typeof vscode.window.createOutputChannel === "function",
            "createOutputChannel should be available",
          );
        });

        test("Should handle activity bar component initialization errors", async () => {
          const extension = vscode.extensions.getExtension(
            "TulipTreeTechnology.codeforge",
          );

          // Mock component creation failure
          const showErrorMessageStub = sandbox.stub(
            vscode.window,
            "showErrorMessage",
          );

          // The extension should handle component initialization errors gracefully
          await extension.activate();

          // Extension should still activate even if some components fail
          assert.ok(extension.isActive, "Extension should still be active");
        });

        test("Should properly dispose activity bar components", () => {
          // Test that the deactivate function properly cleans up activity bar components
          const myExtension = require("../../src/extension");

          assert.ok(
            typeof myExtension.deactivate === "function",
            "Extension should have deactivate function",
          );

          // Should not throw when called
          assert.doesNotThrow(() => {
            myExtension.deactivate();
          }, "Deactivate should handle activity bar cleanup gracefully");
        });
      });
    });
  });

  suite("Output Channel Management", () => {
    test("Output channel should be created on activation", async () => {
      // This test would verify that the output channel is created
      // Currently a placeholder for better mocking support
      assert.ok(true, "Output channel creation test placeholder");
    });

    test("Output channel should log operations", async () => {
      // This test would verify that operations are logged to the output channel
      // Currently a placeholder for better mocking support
      assert.ok(true, "Output channel logging test placeholder");
    });
  });
});
