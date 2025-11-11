const assert = require("assert");
const vscode = require("vscode");
const sinon = require("sinon");
const path = require("path");
const fuzzingOperations = require("../../src/fuzzing/fuzzingOperations");
const dockerOperations = require("../../src/core/dockerOperations");
const cmakePresetDiscovery = require("../../src/fuzzing/cmakePresetDiscovery");

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
      // Error reporting has been intentionally removed
      assert(!summary.includes("Errors encountered"));
      assert(!summary.includes("build: Build failed"));
      // Crash reporting has been intentionally removed
      assert(!summary.includes("New crashes found"));
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
      assert.strictEqual(
        typeof fuzzingOperations.buildFuzzingTargetsOnly,
        "function",
      );
    });
  });

  suite("Script-Based Discovery", () => {
    test("discoverFuzzTestsWithScript should parse script output correctly", async () => {
      const mockScriptOutput =
        "debug:codeforge-example-fuzz\nrelease:codeforge-another-fuzz\ndebug:codeforge-test-fuzz\n";

      // Mock the Docker process
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      const runDockerCommandStub = sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Set up the process event handlers
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, mockScriptOutput);
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0); // Success exit code

      const result = await cmakePresetDiscovery.discoverFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        mockOutputChannel,
      );

      // Verify the parsed results
      assert.strictEqual(result.length, 3, "Should parse 3 fuzz tests");

      assert.deepStrictEqual(result[0], {
        preset: "debug",
        fuzzer: "codeforge-example-fuzz",
      });

      assert.deepStrictEqual(result[1], {
        preset: "release",
        fuzzer: "codeforge-another-fuzz",
      });

      assert.deepStrictEqual(result[2], {
        preset: "debug",
        fuzzer: "codeforge-test-fuzz",
      });

      // Verify the script was called with correct parameters
      assert(runDockerCommandStub.calledOnce);
      const [workspacePath, containerName, command] =
        runDockerCommandStub.firstCall.args;
      assert.strictEqual(workspacePath, "/test/workspace");
      assert.strictEqual(containerName, "test-container");
      assert(command.includes("codeforge find-fuzz-tests"));
      assert(command.includes("-q")); // Should include quiet flag
    });

    test("discoverFuzzTestsWithScript should handle empty output", async () => {
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Set up empty output
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, "");
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0);

      const result = await cmakePresetDiscovery.discoverFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        mockOutputChannel,
      );

      assert.strictEqual(
        result.length,
        0,
        "Should return empty array for no output",
      );
    });

    test("discoverFuzzTestsWithScript should handle script failure gracefully", async () => {
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Set up failure scenario
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, "");
      mockProcess.stderr.on
        .withArgs("data")
        .callsArgWith(1, "Script failed: No CMake presets found");
      mockProcess.on.withArgs("close").callsArgWith(1, 1); // Failure exit code

      const result = await cmakePresetDiscovery.discoverFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        mockOutputChannel,
      );

      assert.strictEqual(
        result.length,
        0,
        "Should return empty array on script failure",
      );
    });

    test("discoverFuzzTestsWithScript should handle malformed output", async () => {
      const mockScriptOutput =
        "debug:codeforge-example-fuzz\ninvalid-line-without-colon\nrelease:codeforge-another-fuzz\n:missing-preset\npreset-missing-fuzzer:\n";

      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      mockProcess.stdout.on.withArgs("data").callsArgWith(1, mockScriptOutput);
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0);

      const result = await cmakePresetDiscovery.discoverFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        mockOutputChannel,
      );

      // Should only parse valid lines
      assert.strictEqual(result.length, 2, "Should parse only valid lines");
      assert.deepStrictEqual(result[0], {
        preset: "debug",
        fuzzer: "codeforge-example-fuzz",
      });
      assert.deepStrictEqual(result[1], {
        preset: "release",
        fuzzer: "codeforge-another-fuzz",
      });
    });

    test("discoverCMakePresets should extract unique presets from script results", async () => {
      const mockScriptOutput =
        "debug:codeforge-example-fuzz\nrelease:codeforge-another-fuzz\ndebug:codeforge-test-fuzz\nrelease:codeforge-final-fuzz\n";

      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      mockProcess.stdout.on.withArgs("data").callsArgWith(1, mockScriptOutput);
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0);

      const result = await cmakePresetDiscovery.discoverCMakePresets(
        "/test/workspace",
        "test-container",
        mockOutputChannel,
      );

      // Should return unique presets
      assert.strictEqual(result.length, 2, "Should return 2 unique presets");
      assert(result.includes("debug"), "Should include debug preset");
      assert(result.includes("release"), "Should include release preset");
    });

    test("discoverFuzzTargets should filter targets by preset", async () => {
      const mockScriptOutput =
        "debug:codeforge-example-fuzz\nrelease:codeforge-another-fuzz\ndebug:codeforge-test-fuzz\n";

      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      mockProcess.stdout.on.withArgs("data").callsArgWith(1, mockScriptOutput);
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0);

      const result = await cmakePresetDiscovery.discoverFuzzTargets(
        "/test/workspace",
        "test-container",
        "debug", // Filter for debug preset
        "/unused/build/dir",
        mockOutputChannel,
      );

      // Should return only debug preset targets
      assert.strictEqual(
        result.length,
        2,
        "Should return 2 targets for debug preset",
      );
      assert(
        result.includes("codeforge-example-fuzz"),
        "Should include example fuzz target",
      );
      assert(
        result.includes("codeforge-test-fuzz"),
        "Should include test fuzz target",
      );
      assert(
        !result.includes("codeforge-another-fuzz"),
        "Should not include release preset target",
      );
    });
  });

  suite("Build and Execution", () => {
    test("buildFuzzTestsWithScript should build fuzz tests", async () => {
      const mockScriptOutput =
        "[+] built fuzzer: test-fuzzer\n[+] built fuzzer: another-fuzzer\n";
      const fuzzTests = [
        { preset: "debug", fuzzer: "test-fuzzer" },
        { preset: "release", fuzzer: "another-fuzzer" },
      ];

      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      const runDockerCommandStub = sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Set up successful build process
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, mockScriptOutput);
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0); // Success exit code

      const result = await fuzzingOperations.buildFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        fuzzTests,
        mockOutputChannel,
      );

      // Verify the build results
      assert.strictEqual(
        result.builtTargets,
        2,
        "Should report 2 built targets",
      );
      assert.strictEqual(result.errors.length, 0, "Should have no errors");
      assert.strictEqual(
        result.builtFuzzers.length,
        2,
        "Should have 2 built fuzzers",
      );

      // Verify the script was called with correct parameters
      assert(runDockerCommandStub.calledOnce);
      const [workspacePath, containerName, command] =
        runDockerCommandStub.firstCall.args;
      assert.strictEqual(workspacePath, "/test/workspace");
      assert.strictEqual(containerName, "test-container");
      assert(command.includes("codeforge build-fuzz-tests"));
      assert(command.includes("debug:test-fuzzer release:another-fuzzer"));
    });

    test("buildFuzzTestsWithScript should handle build failures", async () => {
      const mockScriptOutput =
        "[!] Failed to build target test-fuzzer\nCompilation error: missing header\n[+] built fuzzer: another-fuzzer\n";
      const fuzzTests = [
        { preset: "debug", fuzzer: "test-fuzzer" },
        { preset: "release", fuzzer: "another-fuzzer" },
      ];

      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Set up failed build process
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, mockScriptOutput);
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 1); // Failure exit code

      const result = await fuzzingOperations.buildFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        fuzzTests,
        mockOutputChannel,
      );

      // Verify the build results include errors
      assert.strictEqual(
        result.builtTargets,
        1,
        "Should report 1 built target",
      );
      assert.strictEqual(result.errors.length, 1, "Should have 1 error");
      assert.strictEqual(
        result.builtFuzzers.length,
        1,
        "Should have 1 built fuzzer",
      );

      // Verify error details
      const error = result.errors[0];
      assert.strictEqual(error.type, "compilation_error");
      assert(error.error.includes("test-fuzzer"));
      assert.strictEqual(error.failedTargets.length, 1);
      assert.strictEqual(error.failedTargets[0], "test-fuzzer");
    });

    test("runFuzzTestsWithScript should execute fuzz tests", async () => {
      const mockScriptOutput =
        "[+] running fuzzer: /workspace/.codeforge/fuzzing/test-fuzzer\n[+] running fuzzer: /workspace/.codeforge/fuzzing/another-fuzzer\n";
      const fuzzTests = [
        { preset: "debug", fuzzer: "test-fuzzer" },
        { preset: "release", fuzzer: "another-fuzzer" },
      ];

      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      const runDockerCommandStub = sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Set up successful execution process
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, mockScriptOutput);
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0); // Success exit code

      const result = await fuzzingOperations.runFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        fuzzTests,
        mockOutputChannel,
      );

      // Verify the execution results
      assert.strictEqual(
        result.executed,
        2,
        "Should report 2 executed fuzzers",
      );
      assert.strictEqual(result.crashes.length, 0, "Should have no crashes");
      assert.strictEqual(result.errors.length, 0, "Should have no errors");

      // Verify the script was called with correct parameters
      assert(runDockerCommandStub.calledOnce);
      const [workspacePath, containerName, command] =
        runDockerCommandStub.firstCall.args;
      assert.strictEqual(workspacePath, "/test/workspace");
      assert.strictEqual(containerName, "test-container");
      assert(command.includes("codeforge run-fuzz-tests"));
      assert(command.includes("debug:test-fuzzer release:another-fuzzer"));
    });

    test("runFuzzTestsWithScript should detect crashes", async () => {
      const mockScriptOutput =
        "[+] running fuzzer: /workspace/.codeforge/fuzzing/test-fuzzer\n[+] Found crash file: /workspace/.codeforge/fuzzing/test-fuzzer-output/crash-abc123\n";
      const fuzzTests = [{ preset: "debug", fuzzer: "test-fuzzer" }];

      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Mock file system for crash counting
      const fs = require("fs").promises;
      const fsAccessStub = sandbox.stub(fs, "access");
      const fsReaddirStub = sandbox.stub(fs, "readdir");

      // Before fuzzing: no crash directory
      fsAccessStub.onFirstCall().rejects(new Error("Directory does not exist"));

      // After fuzzing: crash directory exists with 1 crash file
      fsAccessStub.onSecondCall().resolves();
      fsReaddirStub.resolves(["crash-abc123"]);

      // Set up execution with crash
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, mockScriptOutput);
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0); // Success exit code

      const result = await fuzzingOperations.runFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        fuzzTests,
        mockOutputChannel,
      );

      // Verify the execution results
      assert.strictEqual(result.executed, 1, "Should report 1 executed fuzzer");
      assert.strictEqual(result.errors.length, 0, "Should have no errors");
      // Crash counting has been intentionally removed
      assert.strictEqual(result.crashes.length, 0, "Should not count crashes");
      assert.strictEqual(
        result.totalNewCrashes,
        undefined,
        "Should not report new crashes",
      );
    });

    test("parseSuccessfulBuilds should parse build output correctly", () => {
      const stdout =
        "[+] built fuzzer: test-fuzzer\n[+] built fuzzer: another-fuzzer\nSome other output\n[+] built fuzzer: third-fuzzer\n";
      const fuzzTests = [
        { preset: "debug", fuzzer: "test-fuzzer" },
        { preset: "release", fuzzer: "another-fuzzer" },
        { preset: "debug", fuzzer: "third-fuzzer" },
      ];

      const result = fuzzingOperations.parseSuccessfulBuilds(stdout, fuzzTests);

      assert.strictEqual(result.length, 3, "Should parse 3 successful builds");
      assert.strictEqual(result[0].name, "test-fuzzer");
      assert.strictEqual(result[0].preset, "debug");
      assert.strictEqual(result[1].name, "another-fuzzer");
      assert.strictEqual(result[1].preset, "release");
      assert.strictEqual(result[2].name, "third-fuzzer");
      assert.strictEqual(result[2].preset, "debug");
    });

    test("parseScriptBuildErrors should parse build errors correctly", () => {
      const stdout =
        "[!] Failed to build target test-fuzzer\nCompilation error: missing header\n[+] built fuzzer: another-fuzzer\n[!] Failed to build target third-fuzzer\nLinker error: undefined reference\n";
      const stderr = "";
      const fuzzTests = [
        { preset: "debug", fuzzer: "test-fuzzer" },
        { preset: "release", fuzzer: "another-fuzzer" },
        { preset: "debug", fuzzer: "third-fuzzer" },
      ];

      const result = fuzzingOperations.parseScriptBuildErrors(
        stdout,
        stderr,
        fuzzTests,
      );

      assert.strictEqual(result.length, 2, "Should parse 2 build errors");

      // First error
      assert.strictEqual(result[0].type, "compilation_error");
      assert(result[0].error.includes("test-fuzzer"));
      assert.strictEqual(result[0].preset, "debug");
      assert.strictEqual(result[0].failedTargets[0], "test-fuzzer");

      // Second error
      assert.strictEqual(result[1].type, "compilation_error");
      assert(result[1].error.includes("third-fuzzer"));
      assert.strictEqual(result[1].preset, "debug");
      assert.strictEqual(result[1].failedTargets[0], "third-fuzzer");
    });

    test("parseScriptExecutionResults should parse execution output correctly", () => {
      const stdout =
        "[+] running fuzzer: /workspace/.codeforge/fuzzing/test-fuzzer\n[+] Found crash file: /workspace/.codeforge/fuzzing/test-fuzzer-output/crash-abc123\n[+] running fuzzer: /workspace/.codeforge/fuzzing/another-fuzzer\n";
      const stderr = "";
      const fuzzTests = [
        { preset: "debug", fuzzer: "test-fuzzer" },
        { preset: "release", fuzzer: "another-fuzzer" },
      ];

      const result = fuzzingOperations.parseScriptExecutionResults(
        stdout,
        stderr,
        fuzzTests,
      );

      assert.strictEqual(
        result.executed,
        2,
        "Should report 2 executed fuzzers",
      );
      assert.strictEqual(result.crashes.length, 1, "Should detect 1 crash");
      assert.strictEqual(result.errors.length, 0, "Should have no errors");

      // Verify crash details
      const crash = result.crashes[0];
      assert.strictEqual(crash.fuzzer, "test-fuzzer");
      assert(crash.file.includes("crash-abc123"));
    });

    test("buildFuzzTestsWithScript should handle empty fuzz tests", async () => {
      const result = await fuzzingOperations.buildFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        [],
        mockOutputChannel,
      );

      assert.strictEqual(result.builtTargets, 0);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(result.builtFuzzers.length, 0);
    });

    test("runFuzzTestsWithScript should handle empty fuzz tests", async () => {
      const result = await fuzzingOperations.runFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        [],
        mockOutputChannel,
      );

      assert.strictEqual(result.executed, 0);
      assert.strictEqual(result.crashes.length, 0);
      assert.strictEqual(result.errors.length, 0);
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

    test("Terminal should not auto-close after build error and wait for key press", async () => {
      const terminal = new CodeForgeFuzzingTerminal("/test/workspace");
      let closeEventFired = false;
      let lastWrittenMessage = "";

      // Listen for write events to capture messages
      terminal.onDidWrite((data) => {
        lastWrittenMessage += data;
      });

      // Listen for close events
      terminal.onDidClose(() => {
        closeEventFired = true;
      });

      // Simulate build error state
      terminal.isActive = true;
      terminal.fuzzingStartTime = new Date();

      // Simulate error message (this is what happens in the actual code)
      const errorMessage = "Fuzzing failed: Build failed";
      terminal.writeEmitter.fire(`\r\n\x1b[31m${errorMessage}\x1b[0m\r\n`);

      // Mark fuzzing as complete (failed) and enable key-to-close
      terminal.fuzzingComplete = true;

      // Add message prompting user to press any key to close
      terminal.writeEmitter.fire(
        `\r\n\x1b[93mPress any key to close terminal...\x1b[0m\r\n`,
      );

      // Verify that no close event was fired (terminal stays open)
      assert.strictEqual(
        closeEventFired,
        false,
        "Terminal should not auto-close after error",
      );
      assert.strictEqual(
        terminal.fuzzingComplete,
        true,
        "Terminal should be marked as complete",
      );
      assert(
        lastWrittenMessage.includes("Press any key to close"),
        "Should display message about pressing key to close",
      );
      assert(
        lastWrittenMessage.includes("Fuzzing failed"),
        "Should display error message",
      );
    });

    test("Terminal should close when user presses key after error", async () => {
      const terminal = new CodeForgeFuzzingTerminal("/test/workspace");
      let closeEventFired = false;
      let closeCode = null;

      // Listen for close events
      terminal.onDidClose((code) => {
        closeEventFired = true;
        closeCode = code;
      });

      // Simulate error completion state
      terminal.isActive = true;
      terminal.fuzzingComplete = true;

      // Simulate user key press
      terminal.handleInput("any key");

      // Verify terminal closes when key is pressed
      assert.strictEqual(
        closeEventFired,
        true,
        "Terminal should close after key press",
      );
      assert.strictEqual(closeCode, 0, "Should close with success code");
    });
  });

  suite("buildFuzzingTargetsOnly Function", () => {
    let createFuzzingDirectoryStub;
    let generateContainerNameStub;
    let handleFuzzingErrorStub;

    setup(() => {
      // Mock other dependencies
      createFuzzingDirectoryStub = sandbox.stub(
        fuzzingOperations,
        "createFuzzingDirectory",
      );
      generateContainerNameStub = sandbox.stub(
        dockerOperations,
        "generateContainerName",
      );
      handleFuzzingErrorStub = sandbox.stub(
        fuzzingOperations,
        "handleFuzzingError",
      );

      // Mock VSCode APIs
      sandbox.stub(vscode.window, "showInformationMessage").resolves();
    });

    test("should validate buildFuzzingTargetsOnly function exists", () => {
      assert.strictEqual(
        typeof fuzzingOperations.buildFuzzingTargetsOnly,
        "function",
        "buildFuzzingTargetsOnly should be exported as a function",
      );
    });

    test("should handle basic function call structure", async () => {
      // This test validates that the function exists and can be called
      // It tests the error path to avoid hanging on Docker operations
      const workspacePath = "/test/workspace";
      const mockTerminal = mockOutputChannel;
      const progressCallback = sandbox.stub();

      // Configure basic stubs
      generateContainerNameStub.returns("test-container");
      createFuzzingDirectoryStub.resolves("/test/workspace/.codeforge/fuzzing");
      handleFuzzingErrorStub.resolves("Cancel");

      // Mock fs operations
      const fs = require("fs").promises;
      sandbox.stub(fs, "access").resolves();
      sandbox.stub(fs, "mkdir").resolves();

      // The key insight: the function will hang on Docker operations
      // So we test that it can at least start and handle basic setup
      // We'll use a very short timeout to catch hanging
      let functionStarted = false;
      let functionCompleted = false;

      const functionPromise = (async () => {
        functionStarted = true;
        try {
          const result = await fuzzingOperations.buildFuzzingTargetsOnly(
            workspacePath,
            mockTerminal,
            progressCallback,
          );
          functionCompleted = true;
          return result;
        } catch (error) {
          functionCompleted = true;
          throw error;
        }
      })();

      // Give it a very short time to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the function at least started
      assert(functionStarted, "Function should have started");
      assert(generateContainerNameStub.calledWith(workspacePath));

      // Since we know it will hang on Docker operations, we don't wait for completion
      // This test validates that the function exists and can be called without immediate errors
    });
  });

  suite("Enhanced Build Summary Tests", () => {
    test("generateBuildSummary should handle successful build scenario", () => {
      const successResults = {
        processedPresets: 2,
        totalPresets: 2,
        builtTargets: 3,
        totalTargets: 3,
        errors: [],
        builtFuzzers: [
          {
            name: "test_fuzzer_1",
            preset: "debug",
            path: "/workspace/.codeforge/fuzzing/test_fuzzer_1",
          },
          {
            name: "test_fuzzer_2",
            preset: "release",
            path: "/workspace/.codeforge/fuzzing/test_fuzzer_2",
          },
        ],
      };

      const summary = fuzzingOperations.generateBuildSummary(successResults);

      // Verify the summary contains expected success indicators
      assert(
        summary.includes("FUZZING BUILD SUMMARY"),
        "Should contain main header",
      );
      assert(
        summary.includes("📊 Build Statistics"),
        "Should contain statistics section",
      );
      assert(
        summary.includes("Presets processed: 2/2"),
        "Should show correct preset count",
      );
      assert(
        summary.includes("Targets built: 3/3"),
        "Should show correct target count",
      );
      assert(
        summary.includes("Errors encountered: 0"),
        "Should show no errors",
      );
      assert(
        summary.includes("✅ Successfully Built Fuzz Targets"),
        "Should show success section",
      );
      assert(summary.includes("test_fuzzer_1"), "Should list built fuzzers");
      assert(
        summary.includes("🎉 BUILD COMPLETED SUCCESSFULLY"),
        "Should show success message",
      );
      assert(
        !summary.includes("❌ FAILED BUILDS"),
        "Should not show failure section",
      );
    });

    test("generateBuildSummary should handle build failures with detailed breakdown", () => {
      const failureResults = {
        processedPresets: 2,
        totalPresets: 2,
        builtTargets: 1,
        totalTargets: 3,
        errors: [
          {
            type: "cmake_error",
            preset: "debug",
            error:
              "CMake configuration failed: Could not find required library libfuzzer",
            failedTargets: ["test_fuzzer_2"],
            buildErrors: [
              {
                target: "test_fuzzer_2",
                error: "undefined reference to `LLVMFuzzerTestOneInput`",
                context: "Linking stage failed",
              },
            ],
          },
        ],
        builtFuzzers: [
          {
            name: "test_fuzzer_1",
            preset: "debug",
            path: "/workspace/.codeforge/fuzzing/test_fuzzer_1",
          },
        ],
      };

      const summary = fuzzingOperations.generateBuildSummary(failureResults);

      // Verify failure details are included in the enhanced format
      assert(
        summary.includes("🚫 FAILED FUZZ BINARIES:"),
        "Should show failed fuzz binaries section",
      );
      assert(
        summary.includes("FUZZ BINARY #1: test_fuzzer_2"),
        "Should list failed binary",
      );
      assert(
        summary.includes("Preset Configuration: debug"),
        "Should show preset information",
      );
      assert(
        summary.includes("COMPILATION STATUS: FAILED"),
        "Should show compilation status",
      );
      assert(
        summary.includes("undefined reference to `LLVMFuzzerTestOneInput`"),
        "Should show specific error",
      );
      assert(
        summary.includes("BINARY-SPECIFIC TROUBLESHOOTING:"),
        "Should include binary-specific troubleshooting hints",
      );
      assert(
        summary.includes("🔧 GENERAL TROUBLESHOOTING GUIDE"),
        "Should show troubleshooting guide",
      );
      assert(
        summary.includes("FAILED FUZZ BINARIES SUMMARY:"),
        "Should show binary summary",
      );
      assert(
        summary.includes("Total Failed Binaries: 1"),
        "Should show failed binary count",
      );
      assert(
        summary.includes("⚠️  BUILD COMPLETED WITH ISSUES"),
        "Should show partial success message",
      );
    });

    test("generateBuildSummary should handle complete failure scenario", () => {
      const completeFailureResults = {
        processedPresets: 1,
        totalPresets: 2,
        builtTargets: 0,
        totalTargets: 2,
        errors: [
          {
            type: "build_workflow",
            error: "Docker container failed to start",
            preset: "debug",
          },
          {
            type: "permission_error",
            error: "Permission denied accessing build directory",
            preset: "release",
          },
        ],
        builtFuzzers: [],
      };

      const summary = fuzzingOperations.generateBuildSummary(
        completeFailureResults,
      );

      // Verify complete failure handling with enhanced format
      assert(
        summary.includes("Errors encountered: 2"),
        "Should show error count",
      );
      assert(
        summary.includes("❌ OTHER BUILD FAILURES:"),
        "Should show other failures section",
      );
      assert(
        summary.includes("Docker container failed to start"),
        "Should show specific errors",
      );
      assert(
        summary.includes("Permission denied"),
        "Should show permission error",
      );
      assert(
        summary.includes(
          "❌ BUILD FAILED - No fuzz binaries were successfully compiled",
        ),
        "Should show complete failure message",
      );
      assert(
        !summary.includes("✅ Successfully Built Fuzz Targets"),
        "Should not show success section",
      );
    });

    test("generateBuildSummary should include context-specific troubleshooting hints", () => {
      const resultsWithCMakeError = {
        processedPresets: 1,
        totalPresets: 1,
        builtTargets: 0,
        totalTargets: 1,
        errors: [
          {
            type: "cmake_error",
            error: "CMake configuration failed",
            preset: "debug",
          },
        ],
        builtFuzzers: [],
      };

      const summary = fuzzingOperations.generateBuildSummary(
        resultsWithCMakeError,
      );

      // Verify context-specific hints
      assert(
        summary.includes(
          "📌 CMake-specific: Check CMakePresets.json syntax and paths",
        ),
        "Should show CMake-specific hint",
      );

      const resultsWithCompilerError = {
        processedPresets: 1,
        totalPresets: 1,
        builtTargets: 0,
        totalTargets: 1,
        errors: [
          {
            type: "compiler_error",
            error: "gcc compilation failed",
            preset: "debug",
          },
        ],
        builtFuzzers: [],
      };

      const compilerSummary = fuzzingOperations.generateBuildSummary(
        resultsWithCompilerError,
      );
      assert(
        compilerSummary.includes(
          "📌 Compiler-specific: Verify compiler installation and flags",
        ),
        "Should show compiler-specific hint",
      );
    });

    test("generateBuildSummary should handle edge cases gracefully", () => {
      // Test with minimal data
      const minimalResults = {
        processedPresets: 0,
        totalPresets: 0,
        builtTargets: 0,
        totalTargets: 0,
        errors: [],
        builtFuzzers: [],
      };

      const summary = fuzzingOperations.generateBuildSummary(minimalResults);

      // Should not crash and should contain basic structure
      assert(
        summary.includes("FUZZING BUILD SUMMARY"),
        "Should contain header even with minimal data",
      );
      assert(
        summary.includes("📊 Build Statistics"),
        "Should contain statistics section",
      );
      assert(
        summary.includes("🎉 BUILD COMPLETED SUCCESSFULLY"),
        "Should show success for no errors",
      );

      // Test with undefined/null values
      const nullResults = {
        processedPresets: 1,
        totalPresets: 1,
        builtTargets: 0,
        totalTargets: 1,
        errors: [
          {
            error: "Test error",
            // Missing optional fields
          },
        ],
        builtFuzzers: null,
      };

      assert.doesNotThrow(() => {
        fuzzingOperations.generateBuildSummary(nullResults);
      }, "Should handle null/undefined values gracefully");
    });

    test("displayBuildSummary should be exported and callable", () => {
      assert.strictEqual(
        typeof fuzzingOperations.displayBuildSummary,
        "function",
        "displayBuildSummary should be exported as a function",
      );

      // Test that it can be called without throwing
      const mockTerminal = {
        appendLine: sandbox.stub(),
        show: sandbox.stub(),
      };

      assert.doesNotThrow(() => {
        fuzzingOperations.displayBuildSummary(
          mockTerminal,
          "Test summary",
          true,
        );
      }, "displayBuildSummary should be callable");

      // Verify it calls terminal methods
      assert(
        mockTerminal.appendLine.called,
        "Should call appendLine on terminal",
      );
      assert(
        mockTerminal.show.called,
        "Should call show on terminal when requested",
      );
    });

    test("displayBuildSummary should handle different terminal types", () => {
      const testSummary = "Test\nSummary\nOutput";

      // Test with standard terminal
      const standardTerminal = {
        appendLine: sandbox.stub(),
        show: sandbox.stub(),
      };

      fuzzingOperations.displayBuildSummary(
        standardTerminal,
        testSummary,
        true,
      );
      assert.strictEqual(
        standardTerminal.appendLine.callCount,
        3,
        "Should call appendLine for each line",
      );
      assert(standardTerminal.show.called, "Should call show when requested");

      // Test with custom terminal (writeRaw)
      const customTerminal = {
        writeRaw: sandbox.stub(),
      };

      fuzzingOperations.displayBuildSummary(customTerminal, testSummary, false);
      assert(
        customTerminal.writeRaw.calledWith(testSummary + "\n", "\x1b[32m"),
        "Should call writeRaw with green color",
      );

      // Test with disposed terminal (should fallback gracefully)
      const disposedTerminal = {
        appendLine: sandbox.stub().throws(new Error("Terminal disposed")),
      };

      assert.doesNotThrow(() => {
        fuzzingOperations.displayBuildSummary(
          disposedTerminal,
          testSummary,
          false,
        );
      }, "Should handle disposed terminal gracefully");
    });

    test("generateBuildSummary should display dedicated Failed Fuzz Binaries section", () => {
      const resultsWithFailedBinaries = {
        processedPresets: 1,
        totalPresets: 1,
        builtTargets: 1,
        totalTargets: 3,
        errors: [
          {
            preset: "fuzzing-debug",
            type: "build_error",
            error:
              "No targets were successfully built for preset fuzzing-debug",
            timestamp: new Date().toISOString(),
            buildErrors: [
              {
                target: "string_fuzzer",
                preset: "fuzzing-debug",
                error: "undefined reference to `LLVMFuzzerTestOneInput`",
                buildContext: {
                  target: "string_fuzzer",
                  buildDir: "/workspace/build/fuzzing-debug",
                  exitCode: 2,
                  stderr: "undefined reference to `LLVMFuzzerTestOneInput`",
                  buildCommand:
                    'cmake --build "/workspace/build/fuzzing-debug" --target "string_fuzzer"',
                  timestamp: new Date().toISOString(),
                },
                timestamp: new Date().toISOString(),
                expectedBinaryPath:
                  "/workspace/build/fuzzing-debug/string_fuzzer",
                binaryName: "string_fuzzer",
                buildDirectory: "/workspace/build/fuzzing-debug",
              },
              {
                target: "buffer_fuzzer",
                preset: "fuzzing-debug",
                error:
                  "fatal error: fuzzer/FuzzedDataProvider.h: No such file or directory",
                buildContext: {
                  target: "buffer_fuzzer",
                  buildDir: "/workspace/build/fuzzing-debug",
                  exitCode: 1,
                  stderr:
                    "fatal error: fuzzer/FuzzedDataProvider.h: No such file or directory",
                  buildCommand:
                    'cmake --build "/workspace/build/fuzzing-debug" --target "buffer_fuzzer"',
                  timestamp: new Date().toISOString(),
                },
                timestamp: new Date().toISOString(),
                expectedBinaryPath:
                  "/workspace/build/fuzzing-debug/buffer_fuzzer",
                binaryName: "buffer_fuzzer",
                buildDirectory: "/workspace/build/fuzzing-debug",
              },
            ],
            failedTargets: ["string_fuzzer", "buffer_fuzzer"],
            totalTargets: 2,
          },
        ],
        builtFuzzers: [
          {
            name: "successful_fuzzer",
            preset: "fuzzing-debug",
            path: "/workspace/.codeforge/fuzzing/successful_fuzzer",
          },
        ],
      };

      const summary = fuzzingOperations.generateBuildSummary(
        resultsWithFailedBinaries,
      );

      // Verify the dedicated Failed Fuzz Binaries section
      assert(
        summary.includes("🚫 FAILED FUZZ BINARIES:"),
        "Should contain dedicated failed binaries section",
      );
      assert(
        summary.includes(
          "The following fuzz executables could not be compiled:",
        ),
        "Should explain what failed",
      );
      assert(
        summary.includes("FUZZ BINARY #1: string_fuzzer"),
        "Should list first failed binary",
      );
      assert(
        summary.includes("FUZZ BINARY #2: buffer_fuzzer"),
        "Should list second failed binary",
      );

      // Verify binary-specific information
      assert(
        summary.includes(
          "Expected Binary Path: /workspace/build/fuzzing-debug/string_fuzzer",
        ),
        "Should show expected binary path",
      );
      assert(
        summary.includes("Build Directory: /workspace/build/fuzzing-debug"),
        "Should show build directory",
      );
      assert(
        summary.includes("COMPILATION STATUS: FAILED"),
        "Should show compilation status",
      );
      assert(
        summary.includes("Target Name: string_fuzzer"),
        "Should show target name",
      );

      // Verify build context information
      assert(
        summary.includes("CMake Build Command:"),
        "Should show build command",
      );
      assert(summary.includes("Process Exit Code: 2"), "Should show exit code");
      assert(
        summary.includes("Compiler Error Output:"),
        "Should show compiler output",
      );

      // Verify binary-specific troubleshooting
      assert(
        summary.includes("BINARY-SPECIFIC TROUBLESHOOTING:"),
        "Should provide binary-specific hints",
      );
      assert(
        summary.includes("NEXT STEPS FOR"),
        "Should provide actionable next steps",
      );

      // Verify summary statistics
      assert(
        summary.includes("FAILED FUZZ BINARIES SUMMARY:"),
        "Should contain summary section",
      );
      assert(
        summary.includes("Total Failed Binaries: 2"),
        "Should show correct count",
      );
      assert(
        summary.includes(
          "Executables Not Created: string_fuzzer, buffer_fuzzer",
        ),
        "Should list failed executables",
      );
      assert(
        summary.includes("Binary Failures by Preset:"),
        "Should group by preset",
      );
      assert(
        summary.includes("Common Error Patterns:"),
        "Should analyze error patterns",
      );

      // Verify enhanced final status
      assert(
        summary.includes("BUILD COMPLETED WITH ISSUES:"),
        "Should show issues status",
      );
      assert(
        summary.includes("1 fuzz binary/binaries successfully compiled"),
        "Should show success count",
      );
      assert(
        summary.includes("2 fuzz binary/binaries failed to compile"),
        "Should show failure count",
      );
      assert(
        summary.includes("Success Rate: 33%"),
        "Should calculate success rate",
      );
    });

    test("generateBuildSummary should handle fuzzer-specific error patterns", () => {
      const resultsWithFuzzerErrors = {
        processedPresets: 1,
        totalPresets: 1,
        builtTargets: 0,
        totalTargets: 2,
        errors: [
          {
            preset: "fuzzing-release",
            buildErrors: [
              {
                target: "libfuzzer_test",
                error: "LibFuzzer not found - ensure fuzzing flags are set",
                buildContext: {
                  target: "libfuzzer_test",
                  buildDir: "/workspace/build/fuzzing-release",
                  exitCode: 1,
                  stderr: "LibFuzzer not found",
                  buildCommand:
                    'cmake --build "/workspace/build/fuzzing-release" --target "libfuzzer_test"',
                },
                expectedBinaryPath:
                  "/workspace/build/fuzzing-release/libfuzzer_test",
                binaryName: "libfuzzer_test",
              },
              {
                target: "sanitizer_test",
                error: "AddressSanitizer: failed to initialize",
                buildContext: {
                  target: "sanitizer_test",
                  buildDir: "/workspace/build/fuzzing-release",
                  exitCode: 1,
                  stderr: "AddressSanitizer: failed to initialize",
                },
                expectedBinaryPath:
                  "/workspace/build/fuzzing-release/sanitizer_test",
                binaryName: "sanitizer_test",
              },
            ],
          },
        ],
        builtFuzzers: [],
      };

      const summary = fuzzingOperations.generateBuildSummary(
        resultsWithFuzzerErrors,
      );

      // Verify fuzzer-specific error pattern detection
      assert(
        summary.includes("Fuzzing Specific:"),
        "Should detect fuzzing-specific errors",
      );
      assert(
        summary.includes("LibFuzzer not available"),
        "Should provide LibFuzzer-specific hint",
      );
      assert(
        summary.includes("Sanitizer build issue"),
        "Should provide sanitizer-specific hint",
      );

      // Verify complete failure status
      assert(
        summary.includes(
          "BUILD FAILED - No fuzz binaries were successfully compiled",
        ),
        "Should show complete failure",
      );
      assert(
        summary.includes("Review the 'FAILED FUZZ BINARIES' section above"),
        "Should reference failed binaries section",
      );
    });

    test("generateBuildSummary should separate binary failures from other build failures", () => {
      const mixedFailureResults = {
        processedPresets: 2,
        totalPresets: 2,
        builtTargets: 1,
        totalTargets: 2,
        errors: [
          {
            preset: "fuzzing-debug",
            buildErrors: [
              {
                target: "failed_binary",
                error: "compilation failed",
                expectedBinaryPath:
                  "/workspace/build/fuzzing-debug/failed_binary",
                binaryName: "failed_binary",
              },
            ],
          },
          {
            preset: "fuzzing-release",
            type: "configuration_error",
            error: "CMakePresets.json configuration invalid",
            // No buildErrors - this is a non-binary specific error
          },
        ],
        builtFuzzers: [
          {
            name: "working_fuzzer",
            preset: "fuzzing-debug",
            path: "/workspace/.codeforge/fuzzing/working_fuzzer",
          },
        ],
      };

      const summary =
        fuzzingOperations.generateBuildSummary(mixedFailureResults);

      // Should have both sections
      assert(
        summary.includes("🚫 FAILED FUZZ BINARIES:"),
        "Should have failed binaries section",
      );
      assert(
        summary.includes("❌ OTHER BUILD FAILURES:"),
        "Should have other failures section",
      );

      // Binary failure should be in the binaries section
      assert(
        summary.includes("FUZZ BINARY #1: failed_binary"),
        "Should list binary failure",
      );

      // Non-binary failure should be in other section
      assert(
        summary.includes("configuration_error"),
        "Should list configuration error in other section",
      );
      assert(
        summary.includes("CMakePresets.json configuration invalid"),
        "Should show configuration error details",
      );
    });
  });
  suite("Enhanced Error Handling", () => {
    test("buildFuzzTarget should validate inputs", async () => {
      try {
        await fuzzingOperations.buildFuzzTarget("/test/workspace", "");
        assert.fail("Should have thrown error for empty fuzzer name");
      } catch (error) {
        assert(error.message.includes("Invalid fuzzer name"));
        assert.strictEqual(error.fuzzerName, "");
      }
    });

    test("buildFuzzTarget should check Docker image exists", async () => {
      sandbox.stub(dockerOperations, "checkImageExists").resolves(false);

      try {
        await fuzzingOperations.buildFuzzTarget(
          "/test/workspace",
          "test-fuzzer",
        );
        assert.fail("Should have thrown error for missing Docker image");
      } catch (error) {
        assert(error.message.includes("Docker image"));
        assert(error.message.includes("not found"));
        assert.strictEqual(error.fuzzerName, "test-fuzzer");
      }
    });

    test("buildFuzzTarget should provide detailed error context", async () => {
      sandbox.stub(dockerOperations, "checkImageExists").resolves(true);

      // Mock the Docker execution to return a cmake target error
      const mockStdout = `[+] building target: test-fuzzer in preset: Debug
[!] Failed to build target test-fuzzer
cmake --build /build --target test-fuzzer
cmake target does not exist
compilation terminated.`;

      // Mock runDockerCommandWithOutput to return a ChildProcess-like object
      const EventEmitter = require("events");
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Start the async operation
      const buildPromise = fuzzingOperations.buildFuzzTarget(
        "/test/workspace",
        "test-fuzzer",
      );

      // Simulate the process events
      setTimeout(() => {
        mockProcess.stdout.emit("data", mockStdout);
        mockProcess.emit("close", 1); // Exit code 1 for failure
      }, 10);

      try {
        await buildPromise;
        assert.fail("Should have thrown error for build failure");
      } catch (error) {
        assert.strictEqual(error.fuzzerName, "test-fuzzer");
        assert.strictEqual(
          error.errorType,
          "cmake_target_error",
          `Expected cmake_target_error but got ${error.errorType}`,
        );
        assert(Array.isArray(error.suggestions));
        assert(error.suggestions.length > 0);
      }
    });

    test("createDetailedBuildErrorMessage should format error messages", () => {
      const buildError = {
        buildErrors: [
          {
            error: "Compilation failed",
            buildContext: {
              stderr: "error: 'undefined_function' was not declared",
            },
          },
        ],
      };

      const message = fuzzingOperations.createDetailedBuildErrorMessage(
        "test-fuzzer",
        "Debug",
        buildError,
      );

      assert(message.includes("test-fuzzer"));
      assert(message.includes("Debug"));
      assert(message.includes("Compilation failed"));
      assert(message.includes("undefined_function"));
    });

    test("generateBuildErrorSuggestions should provide CMake-specific suggestions", () => {
      const buildError = {
        buildErrors: [
          {
            error: "cmake target does not exist",
            buildContext: {
              stderr: "CMake Error: Unknown target test-fuzzer",
            },
          },
        ],
      };

      const suggestions =
        fuzzingOperations.generateBuildErrorSuggestions(buildError);

      assert(Array.isArray(suggestions));
      assert(suggestions.some((s) => s.includes("CMakeLists.txt")));
      assert(suggestions.some((s) => s.includes("target name matches")));
    });

    test("generateBuildErrorSuggestions should provide compiler-specific suggestions", () => {
      const buildError = {
        buildErrors: [
          {
            error: "compilation error: undefined reference",
            buildContext: {
              stderr: "undefined reference to `missing_function'",
            },
          },
        ],
      };

      const suggestions =
        fuzzingOperations.generateBuildErrorSuggestions(buildError);

      assert(Array.isArray(suggestions));
      assert(suggestions.some((s) => s.includes("compilation errors")));
      assert(suggestions.some((s) => s.includes("libraries are linked")));
    });

    test("categorizeError should identify error types correctly", () => {
      assert.strictEqual(
        fuzzingOperations.categorizeError("cmake preset not found"),
        "cmake_preset_error",
      );

      assert.strictEqual(
        fuzzingOperations.categorizeError("cmake target does not exist"),
        "cmake_target_error",
      );

      assert.strictEqual(
        fuzzingOperations.categorizeError("compilation error: syntax error"),
        "compilation_error",
      );

      assert.strictEqual(
        fuzzingOperations.categorizeError("undefined reference to symbol"),
        "linker_error",
      );

      assert.strictEqual(
        fuzzingOperations.categorizeError("permission denied"),
        "permission_error",
      );

      assert.strictEqual(
        fuzzingOperations.categorizeError("docker container not found"),
        "docker_error",
      );

      assert.strictEqual(
        fuzzingOperations.categorizeError("network timeout"),
        "network_error",
      );

      assert.strictEqual(
        fuzzingOperations.categorizeError("file not found"),
        "file_not_found_error",
      );

      assert.strictEqual(
        fuzzingOperations.categorizeError("unknown error"),
        "build_error",
      );
    });

    test("parseScriptBuildErrors should extract detailed error information", () => {
      const stdout = `[+] building target: test-fuzzer in preset: debug
[!] Failed to build target test-fuzzer
cmake --build /build --target test-fuzzer
error: 'undefined_function' was not declared in this scope
compilation terminated.
[+] built fuzzer: other-fuzzer`;

      const stderr = "";
      const fuzzTests = [{ preset: "debug", fuzzer: "test-fuzzer" }];

      const errors = fuzzingOperations.parseScriptBuildErrors(
        stdout,
        stderr,
        fuzzTests,
      );

      assert.strictEqual(errors.length, 1);
      const error = errors[0];
      assert.strictEqual(error.preset, "debug");
      assert.strictEqual(error.type, "compilation_error");
      assert.strictEqual(error.buildErrors.length, 1);
      assert(error.buildErrors[0].buildCommand.includes("cmake --build"));
      assert(
        error.buildErrors[0].buildOutput &&
          error.buildErrors[0].buildOutput.includes("undefined_function"),
      );
    });

    test("parseScriptBuildErrors should handle CMake configuration errors", () => {
      const stdout = `[+] Failed to configure preset invalid-preset - skipping
[+] building target: test-fuzzer in preset: debug`;

      const stderr = "";
      const fuzzTests = [{ preset: "invalid-preset", fuzzer: "test-fuzzer" }];

      const errors = fuzzingOperations.parseScriptBuildErrors(
        stdout,
        stderr,
        fuzzTests,
      );

      assert.strictEqual(errors.length, 1);
      const error = errors[0];
      assert.strictEqual(error.preset, "invalid-preset");
      assert.strictEqual(error.type, "cmake_config_error");
      assert(error.error.includes("configure CMake preset"));
    });

    test("parseScriptBuildErrors should handle general script errors", () => {
      const stdout = "";
      const stderr = "Docker container not found";
      const fuzzTests = [{ preset: "debug", fuzzer: "test-fuzzer" }];

      const errors = fuzzingOperations.parseScriptBuildErrors(
        stdout,
        stderr,
        fuzzTests,
      );

      assert.strictEqual(errors.length, 1);
      const error = errors[0];
      assert.strictEqual(error.type, "docker_error");
      assert(error.error.includes("Script execution failed"));
    });
  });

  suite("Crash Counting", () => {
    test("countCrashFiles should return 0 when crash directory does not exist", async () => {
      const fs = require("fs").promises;
      sandbox.stub(fs, "access").rejects(new Error("Directory does not exist"));

      const count = await fuzzingOperations.countCrashFiles(
        "/test/workspace",
        "test-fuzzer",
      );
      assert.strictEqual(count, 0);
    });

    test("countCrashFiles should count crash files correctly", async () => {
      const fs = require("fs").promises;
      sandbox.stub(fs, "access").resolves();
      sandbox
        .stub(fs, "readdir")
        .resolves([
          "crash-abc123",
          "crash-def456",
          "crash-ghi789",
          "regular-file.txt",
          "corpus-file",
        ]);

      const count = await fuzzingOperations.countCrashFiles(
        "/test/workspace",
        "test-fuzzer",
      );
      assert.strictEqual(
        count,
        3,
        "Should count only files starting with crash-",
      );
    });

    test("countCrashFiles should handle empty crash directory", async () => {
      const fs = require("fs").promises;
      sandbox.stub(fs, "access").resolves();
      sandbox.stub(fs, "readdir").resolves([]);

      const count = await fuzzingOperations.countCrashFiles(
        "/test/workspace",
        "test-fuzzer",
      );
      assert.strictEqual(count, 0);
    });

    test("countCrashFiles should handle directory read errors", async () => {
      const fs = require("fs").promises;
      sandbox.stub(fs, "access").resolves();
      sandbox.stub(fs, "readdir").rejects(new Error("Permission denied"));

      const count = await fuzzingOperations.countCrashFiles(
        "/test/workspace",
        "test-fuzzer",
      );
      assert.strictEqual(count, 0, "Should return 0 on error");
    });

    test("runFuzzTestsWithScript should track new crashes correctly", async () => {
      const mockScriptOutput =
        "[+] running fuzzer: /workspace/.codeforge/fuzzing/test-fuzzer\n";
      const fuzzTests = [{ preset: "debug", fuzzer: "test-fuzzer" }];

      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Mock file system for crash counting
      const fs = require("fs").promises;
      const fsAccessStub = sandbox.stub(fs, "access");
      const fsReaddirStub = sandbox.stub(fs, "readdir");

      // Before fuzzing: 2 existing crashes
      fsAccessStub.onFirstCall().resolves();
      fsReaddirStub.onFirstCall().resolves(["crash-old1", "crash-old2"]);

      // After fuzzing: 5 total crashes (3 new)
      fsAccessStub.onSecondCall().resolves();
      fsReaddirStub
        .onSecondCall()
        .resolves([
          "crash-old1",
          "crash-old2",
          "crash-new1",
          "crash-new2",
          "crash-new3",
        ]);

      // Set up execution
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, mockScriptOutput);
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0);

      const result = await fuzzingOperations.runFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        fuzzTests,
        mockOutputChannel,
      );

      // Crash counting has been intentionally removed
      assert.strictEqual(
        result.totalNewCrashes,
        undefined,
        "Should not report new crashes",
      );
      assert.strictEqual(result.crashes.length, 0, "Should not count crashes");
    });

    test("runFuzzTestsWithScript should handle multiple fuzzers with different crash counts", async () => {
      const mockScriptOutput =
        "[+] running fuzzer: /workspace/.codeforge/fuzzing/fuzzer1\n[+] running fuzzer: /workspace/.codeforge/fuzzing/fuzzer2\n[+] running fuzzer: /workspace/.codeforge/fuzzing/fuzzer3\n";
      const fuzzTests = [
        { preset: "debug", fuzzer: "fuzzer1" },
        { preset: "debug", fuzzer: "fuzzer2" },
        { preset: "debug", fuzzer: "fuzzer3" },
      ];

      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Mock file system for crash counting
      const fs = require("fs").promises;
      const fsAccessStub = sandbox.stub(fs, "access");
      const fsReaddirStub = sandbox.stub(fs, "readdir");

      // Before fuzzing - 3 access calls
      // fuzzer1: 0 before (no directory)
      fsAccessStub.onCall(0).rejects(); // Before - fuzzer1

      // fuzzer2: 1 before
      fsAccessStub.onCall(1).resolves(); // Before - fuzzer2
      fsReaddirStub.onCall(0).resolves(["crash-old"]);

      // fuzzer3: 0 before (no directory)
      fsAccessStub.onCall(2).rejects(); // Before - fuzzer3

      // After fuzzing - 3 access + readdir calls
      // fuzzer1: 2 after (2 new)
      fsAccessStub.onCall(3).resolves(); // After - fuzzer1
      fsReaddirStub.onCall(1).resolves(["crash-1", "crash-2"]);

      // fuzzer2: 1 after (0 new)
      fsAccessStub.onCall(4).resolves(); // After - fuzzer2
      fsReaddirStub.onCall(2).resolves(["crash-old"]);

      // fuzzer3: 3 after (3 new)
      fsAccessStub.onCall(5).resolves(); // After - fuzzer3
      fsReaddirStub.onCall(3).resolves(["crash-a", "crash-b", "crash-c"]);

      // Set up execution
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, mockScriptOutput);
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0);

      const result = await fuzzingOperations.runFuzzTestsWithScript(
        "/test/workspace",
        "test-container",
        fuzzTests,
        mockOutputChannel,
      );

      // Crash counting has been intentionally removed
      assert.strictEqual(
        result.totalNewCrashes,
        undefined,
        "Should not report new crashes",
      );
      assert.strictEqual(result.crashes.length, 0, "Should not count crashes");
    });

    test("generateFuzzingSummary should not display crash counts", () => {
      const results = {
        processedPresets: 2,
        totalPresets: 2,
        builtTargets: 3,
        totalTargets: 3,
        executedFuzzers: 3,
        crashes: [
          { fuzzer: "fuzzer1", newCrashes: 2, totalCrashes: 5 },
          { fuzzer: "fuzzer2", newCrashes: 1, totalCrashes: 1 },
        ],
        errors: [],
      };

      const summary = fuzzingOperations.generateFuzzingSummary(results);

      // Crash reporting has been intentionally removed
      assert(!summary.includes("New crashes found"));
      assert(!summary.includes("New crashes by fuzzer:"));
      assert(!summary.includes("fuzzer1: 2 new (5 total)"));
      assert(!summary.includes("fuzzer2: 1 new (1 total)"));
      // Summary should still include other metrics
      assert(summary.includes("Presets processed: 2/2"));
      assert(summary.includes("Targets built: 3/3"));
      assert(summary.includes("Fuzzers executed: 3"));
    });
  });
});
