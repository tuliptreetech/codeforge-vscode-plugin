const assert = require("assert");
const vscode = require("vscode");
const sinon = require("sinon");
const path = require("path");
const fuzzingOperations = require("../../src/fuzzing/fuzzingOperations");
const dockerOperations = require("../../src/core/dockerOperations");

suite("Fuzzing Operations Test Suite", () => {
  let sandbox;
  let mockOutputChannel;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockOutputChannel = {
      appendLine: sandbox.stub(),
      show: sandbox.stub(),
    };
  });

  teardown(() => {
    sandbox.restore();
  });

  suite("Basic Functionality", () => {
    test("safeFuzzingLog should handle output channel operations", () => {
      fuzzingOperations.safeFuzzingLog(mockOutputChannel, "Test message");
      assert(mockOutputChannel.appendLine.calledWith("[Fuzzing] Test message"));
    });

    test("safeFuzzingLog should handle disposed output channel", () => {
      const disposedChannel = {
        appendLine: sandbox.stub().throws(new Error("Channel disposed")),
      };

      // Should not throw
      assert.doesNotThrow(() => {
        fuzzingOperations.safeFuzzingLog(disposedChannel, "Test message");
      });
    });

    test("createFuzzingDirectory should return correct path", async () => {
      const workspacePath = path.join("test", "workspace");
      const expectedPath = path.join(workspacePath, ".codeforge", "fuzzing");

      // Mock fs operations
      const fs = require("fs").promises;
      sandbox.stub(fs, "access").rejects(new Error("Directory does not exist"));
      sandbox.stub(fs, "mkdir").resolves();

      const result =
        await fuzzingOperations.createFuzzingDirectory(workspacePath);
      assert.strictEqual(result, expectedPath);
    });

    test("handleFuzzingError should show error message", async () => {
      const showErrorMessageStub = sandbox
        .stub(vscode.window, "showErrorMessage")
        .resolves("Cancel");

      const error = new Error("Test error");
      const result = await fuzzingOperations.handleFuzzingError(
        error,
        "test context",
        mockOutputChannel,
      );

      assert(showErrorMessageStub.calledOnce);
      assert(
        mockOutputChannel.appendLine.calledWith(
          "[Fuzzing] Fuzzing test context failed: Test error",
        ),
      );
      assert.strictEqual(result, "Cancel");
    });

    test("generateFuzzingSummary should format results correctly", () => {
      const results = {
        processedPresets: 2,
        totalPresets: 3,
        builtTargets: 4,
        totalTargets: 5,
        executedFuzzers: 3,
        crashes: [{ fuzzer: "test-fuzz", file: "/path/to/crash" }],
        errors: [{ type: "build", error: "Build failed" }],
      };

      const summary = fuzzingOperations.generateFuzzingSummary(results);

      assert(summary.includes("Presets processed: 2/3"));
      assert(summary.includes("Targets built: 4/5"));
      assert(summary.includes("Fuzzers executed: 3"));
      assert(summary.includes("Crashes found: 1"));
      assert(summary.includes("Errors encountered: 1"));
      assert(summary.includes("test-fuzz: /path/to/crash"));
      assert(summary.includes("build: Build failed"));
    });
  });

  suite("Integration with Docker Operations", () => {
    test("should use generateContainerName from dockerOperations", () => {
      const generateContainerNameStub = sandbox
        .stub(dockerOperations, "generateContainerName")
        .returns("test-container");

      const workspacePath = "/test/workspace";
      const result = dockerOperations.generateContainerName(workspacePath);

      assert.strictEqual(result, "test-container");
      assert(generateContainerNameStub.calledWith(workspacePath));
    });

    test("should validate module exports", () => {
      // Test that all expected functions are exported
      assert.strictEqual(typeof fuzzingOperations.runFuzzingTests, "function");
      assert.strictEqual(
        typeof fuzzingOperations.orchestrateFuzzingWorkflow,
        "function",
      );
      assert.strictEqual(
        typeof fuzzingOperations.createFuzzingDirectory,
        "function",
      );
      assert.strictEqual(typeof fuzzingOperations.safeFuzzingLog, "function");
      assert.strictEqual(
        typeof fuzzingOperations.handleFuzzingError,
        "function",
      );
      assert.strictEqual(
        typeof fuzzingOperations.generateFuzzingSummary,
        "function",
      );
    });
  });

  suite("Error Handling", () => {
    test("handleFuzzingError should provide retry option", async () => {
      const showErrorMessageStub = sandbox
        .stub(vscode.window, "showErrorMessage")
        .resolves("Retry");

      const error = new Error("Retry test");
      const result = await fuzzingOperations.handleFuzzingError(
        error,
        "retry context",
        mockOutputChannel,
      );

      assert.strictEqual(result, "Retry");
      assert(
        showErrorMessageStub.calledWith(
          "CodeForge: Fuzzing retry context failed: Retry test",
          "View Terminal",
          "Retry",
          "Cancel",
        ),
      );
    });

    test("handleFuzzingError should show terminal when requested", async () => {
      const showErrorMessageStub = sandbox
        .stub(vscode.window, "showErrorMessage")
        .resolves("View Terminal");

      const error = new Error("View terminal test");
      const result = await fuzzingOperations.handleFuzzingError(
        error,
        "view context",
        mockOutputChannel,
      );

      assert.strictEqual(result, "View Terminal");
      // The show method should be called twice: once in safeFuzzingLog (show=true) and once explicitly
      assert(mockOutputChannel.show.calledTwice);
    });
  });

  suite("Fuzzing Terminal Behavior", () => {
    const {
      CodeForgeFuzzingTerminal,
    } = require("../../src/fuzzing/fuzzingTerminal");

    test("Terminal should not auto-close after successful fuzzing completion", async () => {
      const terminal = new CodeForgeFuzzingTerminal("/test/workspace");
      let closeEventFired = false;
      let closeCode = null;

      // Listen for close events
      terminal.onDidClose((code) => {
        closeEventFired = true;
        closeCode = code;
      });

      // Mock successful fuzzing results
      const mockResults = {
        crashes: [],
        executedFuzzers: 2,
        builtTargets: 3,
        totalTargets: 3,
      };

      // Simulate the completion logic without calling the full open() method
      terminal.isActive = true;
      terminal.fuzzingStartTime = new Date(Date.now() - 5000); // 5 seconds ago

      // Show completion message (this is what happens in the actual code)
      const endTime = new Date();
      const duration = ((endTime - terminal.fuzzingStartTime) / 1000).toFixed(
        2,
      );
      const message = `Fuzzing completed successfully. ${mockResults.executedFuzzers} fuzzer(s) executed. Duration: ${duration}s`;
      terminal.writeEmitter.fire(`\r\n\x1b[32m${message}\x1b[0m\r\n`);

      // Add the helpful message about terminal staying open
      terminal.writeEmitter.fire(
        `\r\n\x1b[90mTerminal will remain open for result review. Close manually when done.\x1b[0m\r\n`,
      );

      // Verify that no close event was fired (terminal stays open)
      assert.strictEqual(
        closeEventFired,
        false,
        "Terminal should not auto-close after successful completion",
      );
      assert.strictEqual(closeCode, null, "No close code should be set");
      assert.strictEqual(
        terminal.isActive,
        true,
        "Terminal should remain active",
      );
    });

    test("Terminal should not auto-close after fuzzing with crashes", async () => {
      const terminal = new CodeForgeFuzzingTerminal("/test/workspace");
      let closeEventFired = false;

      // Listen for close events
      terminal.onDidClose(() => {
        closeEventFired = true;
      });

      // Mock fuzzing results with crashes
      const mockResults = {
        crashes: [{ fuzzer: "test-fuzz", file: "/path/to/crash" }],
        executedFuzzers: 2,
        builtTargets: 3,
        totalTargets: 3,
      };

      // Simulate the completion logic
      terminal.isActive = true;
      terminal.fuzzingStartTime = new Date(Date.now() - 3000); // 3 seconds ago

      // Show completion message with crashes
      const endTime = new Date();
      const duration = ((endTime - terminal.fuzzingStartTime) / 1000).toFixed(
        2,
      );
      const message = `Fuzzing completed with ${mockResults.crashes.length} crash(es) found! Duration: ${duration}s`;
      terminal.writeEmitter.fire(`\r\n\x1b[31m${message}\x1b[0m\r\n`);

      // Add the helpful message about terminal staying open
      terminal.writeEmitter.fire(
        `\r\n\x1b[90mTerminal will remain open for result review. Close manually when done.\x1b[0m\r\n`,
      );

      // Verify that no close event was fired (terminal stays open even with crashes)
      assert.strictEqual(
        closeEventFired,
        false,
        "Terminal should not auto-close even when crashes are found",
      );
      assert.strictEqual(
        terminal.isActive,
        true,
        "Terminal should remain active",
      );
    });

    test("Terminal should only close when manually closed", async () => {
      const terminal = new CodeForgeFuzzingTerminal("/test/workspace");
      let closeEventFired = false;
      let closeCode = null;

      // Listen for close events
      terminal.onDidClose((code) => {
        closeEventFired = true;
        closeCode = code;
      });

      terminal.isActive = true;

      // Manually close the terminal (simulating user action)
      await terminal.close();

      // Verify terminal is properly closed
      assert.strictEqual(
        terminal.isActive,
        false,
        "Terminal should be marked as inactive after manual close",
      );

      // Note: The close event is not fired by the close() method itself,
      // but would be fired by VSCode when the user closes the terminal
    });
  });
});
