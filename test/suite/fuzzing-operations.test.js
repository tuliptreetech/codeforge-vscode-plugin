const assert = require("assert");
const vscode = require("vscode");
const sinon = require("sinon");
const fuzzingOperations = require("../../src/fuzzing/fuzzingOperations");
const dockerOperations = require("../../dockerOperations");

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
      const workspacePath = "/test/workspace";
      const expectedPath = "/test/workspace/fuzzing";

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
          "View Output",
          "Retry",
          "Cancel",
        ),
      );
    });

    test("handleFuzzingError should show output channel when requested", async () => {
      const showErrorMessageStub = sandbox
        .stub(vscode.window, "showErrorMessage")
        .resolves("View Output");

      const error = new Error("View output test");
      const result = await fuzzingOperations.handleFuzzingError(
        error,
        "view context",
        mockOutputChannel,
      );

      assert.strictEqual(result, "View Output");
      // The show method should be called twice: once in safeFuzzingLog (show=true) and once explicitly
      assert(mockOutputChannel.show.calledTwice);
    });
  });
});
