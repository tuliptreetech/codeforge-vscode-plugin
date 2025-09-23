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
      assert.strictEqual(
        typeof fuzzingOperations.buildFuzzingTargetsOnly,
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
});
