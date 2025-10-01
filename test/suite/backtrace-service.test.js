/**
 * BacktraceService Test Suite
 *
 * This file contains comprehensive tests for the BacktraceService functionality:
 * - generateBacktrace - Main backtrace generation method
 * - executeBacktraceScript - Docker script execution
 * - extractCrashHash - Crash ID parsing
 * - formatBacktraceForDisplay - Output formatting
 * - isBacktraceAvailable - Availability checking
 */

const assert = require("assert");
const sinon = require("sinon");
const path = require("path");
const { BacktraceService } = require("../../src/fuzzing/backtraceService");
const dockerOperations = require("../../src/core/dockerOperations");
const EventEmitter = require("events");

suite("BacktraceService Test Suite", () => {
  let sandbox;
  let backtraceService;

  setup(() => {
    sandbox = sinon.createSandbox();
    backtraceService = new BacktraceService();
  });

  teardown(() => {
    sandbox.restore();
  });

  suite("extractCrashHash", () => {
    test("Should extract hash from crash-prefixed ID", () => {
      const crashId = "crash-abc123def456";
      const hash = backtraceService.extractCrashHash(crashId);
      assert.strictEqual(hash, "abc123def456");
    });

    test("Should return ID as-is if no crash- prefix", () => {
      const crashId = "abc123def456";
      const hash = backtraceService.extractCrashHash(crashId);
      assert.strictEqual(hash, "abc123def456");
    });

    test("Should throw error for empty crash ID", () => {
      assert.throws(() => {
        backtraceService.extractCrashHash("");
      }, /Crash ID is required/);
    });

    test("Should throw error for null crash ID", () => {
      assert.throws(() => {
        backtraceService.extractCrashHash(null);
      }, /Crash ID is required/);
    });
  });

  suite("formatBacktraceForDisplay", () => {
    test("Should format backtrace with headers", () => {
      const backtrace =
        "#0  0x00007ffff7a9e000 in main ()\n#1  0x00007ffff7a9e100 in foo ()";
      const fuzzerName = "example-fuzz";
      const crashId = "crash-abc123";

      const formatted = backtraceService.formatBacktraceForDisplay(
        backtrace,
        fuzzerName,
        crashId,
      );

      assert(formatted.includes("BACKTRACE ANALYSIS"));
      assert(formatted.includes(`Fuzzer:      ${fuzzerName}`));
      assert(formatted.includes(`Crash:       ${crashId}`));
      assert(formatted.includes(backtrace));
      assert(formatted.includes("STACK TRACE"));
    });

    test("Should handle empty backtrace gracefully", () => {
      const formatted = backtraceService.formatBacktraceForDisplay(
        "",
        "test-fuzz",
        "crash-123",
      );

      assert(formatted.includes("BACKTRACE NOT AVAILABLE"));
      assert(formatted.includes("Could not generate backtrace"));
    });

    test("Should handle null backtrace gracefully", () => {
      const formatted = backtraceService.formatBacktraceForDisplay(
        null,
        "test-fuzz",
        "crash-123",
      );

      assert(formatted.includes("BACKTRACE NOT AVAILABLE"));
    });

    test("Should use crash time when provided", () => {
      const backtrace = "#0  0x00007ffff7a9e000 in main ()";
      const fuzzerName = "example-fuzz";
      const crashId = "crash-abc123";
      const workspacePath = "/workspace";
      const crashTime = new Date("2024-12-19T15:45:23.000Z");

      const formatted = backtraceService.formatBacktraceForDisplay(
        backtrace,
        fuzzerName,
        crashId,
        workspacePath,
        crashTime,
      );

      assert(formatted.includes("Crash Time:"));
      // Should include the formatted crash time
      assert(formatted.match(/December|2024/));
    });
  });

  suite("formatDateTime", () => {
    test("Should format date in readable local format", () => {
      const testDate = new Date("2024-12-19T15:45:23.000Z");
      const formatted = backtraceService.formatDateTime(testDate);

      // Should include month name, day, year
      assert(formatted.match(/\w+\s+\d+,\s+\d{4}/));
      // Should include time
      assert(formatted.match(/\d+:\d{2}:\d{2}/));
      // Should include AM/PM
      assert(formatted.match(/[AP]M/));
    });

    test("Should use en-US locale", () => {
      const testDate = new Date("2024-01-15T12:00:00.000Z");
      const formatted = backtraceService.formatDateTime(testDate);

      // Check for English month name
      assert(
        formatted.match(
          /January|February|March|April|May|June|July|August|September|October|November|December/,
        ),
      );
    });
  });

  suite("resolveFilePath", () => {
    test("Should return absolute paths as-is", () => {
      const filePath = path.resolve("/absolute/path/to/file.c");
      const workspacePath = path.resolve("/workspace");

      const result = backtraceService.resolveFilePath(filePath, workspacePath);

      assert.strictEqual(result, filePath);
    });

    test("Should resolve relative paths", () => {
      const filePath = "src/main.c";
      const workspacePath = path.resolve("/workspace");

      const result = backtraceService.resolveFilePath(filePath, workspacePath);

      // Normalize paths for comparison (handles Windows vs Unix separators)
      const normalizedResult = result.replace(/\\/g, "/");
      assert(normalizedResult.includes("workspace"));
      assert(normalizedResult.includes("src/main.c"));
    });
  });

  suite("makeBacktracePathsClickable", () => {
    test("Should convert absolute paths to file:// URIs with # for line numbers", () => {
      const workspacePath = path.resolve("/workspace");
      const backtrace = `at ${path.join(workspacePath, "src/main.c")}:42`;

      const result = backtraceService.makeBacktracePathsClickable(
        backtrace,
        workspacePath,
      );

      // Check that result contains file:// and the file path with #42
      assert(result.includes("file://"));
      assert(result.includes("#42"));
      assert(result.includes("main.c"));
    });

    test("Should convert relative paths to absolute file:// URIs", () => {
      const workspacePath = path.resolve("/workspace");
      const backtrace = "at src/utils.cpp:123";

      const result = backtraceService.makeBacktracePathsClickable(
        backtrace,
        workspacePath,
      );

      // Check that result contains file:// and the resolved path with #123
      assert(result.includes("file://"));
      assert(result.includes("#123"));
      assert(result.includes("utils.cpp"));
      // Verify it's an absolute path (contains workspace)
      const normalizedResult = result.replace(/\\/g, "/");
      assert(normalizedResult.includes("workspace"));
    });

    test("Should handle multiple file references", () => {
      const workspacePath = path.resolve("/workspace");
      const backtrace =
        `#0 at ${path.join(workspacePath, "src/main.c")}:42\n` +
        "#1 at src/helper.c:15\n" +
        "#2 at lib/process.c:99";

      const result = backtraceService.makeBacktracePathsClickable(
        backtrace,
        workspacePath,
      );

      // Normalize for cross-platform comparison
      const normalizedResult = result.replace(/\\/g, "/");

      assert(result.includes("file://"));
      assert(normalizedResult.includes("main.c#42"));
      assert(normalizedResult.includes("helper.c#15"));
      assert(normalizedResult.includes("process.c#99"));
    });

    test("Should handle nested directory paths", () => {
      const workspacePath = path.resolve("/workspace");
      const backtrace = `at ${path.join(workspacePath, "src/subdir/nested/file.c")}:100`;

      const result = backtraceService.makeBacktracePathsClickable(
        backtrace,
        workspacePath,
      );

      assert(result.includes("file://"));
      assert(result.includes("#100"));
      assert(result.includes("file.c"));
    });

    test("Should handle C++ files", () => {
      const workspacePath = path.resolve("/workspace");
      const backtrace = `at ${path.join(workspacePath, "src/module.cpp")}:200`;

      const result = backtraceService.makeBacktracePathsClickable(
        backtrace,
        workspacePath,
      );

      assert(result.includes("file://"));
      assert(result.includes("module.cpp#200"));
    });

    test("Should handle header files", () => {
      const workspacePath = path.resolve("/project");
      const backtrace = "at include/utils.h:50";

      const result = backtraceService.makeBacktracePathsClickable(
        backtrace,
        workspacePath,
      );

      assert(result.includes("file://"));
      assert(result.includes("utils.h#50"));
    });

    test("Should preserve backtrace lines without file paths", () => {
      const backtrace = "#0  0x00007ffff7a9e000 in main ()";
      const workspacePath = path.resolve("/workspace");

      const result = backtraceService.makeBacktracePathsClickable(
        backtrace,
        workspacePath,
      );

      assert.strictEqual(result, backtrace);
    });

    test("Should handle complete GDB backtrace format", () => {
      const workspacePath = path.resolve("/workspace");
      const backtrace =
        `#0  0x00007fff in main () at ${path.join(workspacePath, "src/main.c")}:42\n` +
        "#1  0x00007ffe in helper (arg=0x123) at src/helper.c:15";

      const result = backtraceService.makeBacktracePathsClickable(
        backtrace,
        workspacePath,
      );

      // Normalize for cross-platform comparison
      const normalizedResult = result.replace(/\\/g, "/");

      // Check that file paths are converted to file:// URIs
      assert(result.includes("file://"));
      assert(normalizedResult.includes("main.c#42"));
      assert(normalizedResult.includes("helper.c#15"));
      // Check that other parts of the backtrace are preserved
      assert(result.includes("#0  0x00007fff in main ()"));
      assert(result.includes("#1  0x00007ffe in helper (arg=0x123)"));
    });
  });

  suite("executeBacktraceScript", () => {
    test("Should execute script and return stdout on success", async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      const runDockerStub = sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      const workspacePath = "/workspace";
      const crashIdentifier = "example-fuzz/abc123";
      const imageName = "test-image";

      const promise = backtraceService.executeBacktraceScript(
        workspacePath,
        crashIdentifier,
        imageName,
      );

      // Simulate successful execution
      mockProcess.stdout.emit("data", "#0  0x00007ffff7a9e000 in main ()\n");
      mockProcess.stdout.emit("data", "#1  0x00007ffff7a9e100 in foo ()\n");
      mockProcess.emit("close", 0);

      const result = await promise;

      assert(result.includes("#0  0x00007ffff7a9e000 in main ()"));
      assert(result.includes("#1  0x00007ffff7a9e100 in foo ()"));
      assert(runDockerStub.calledOnce);
    });

    test("Should handle script failure with error code", async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      const promise = backtraceService.executeBacktraceScript(
        "/workspace",
        "test-fuzz/abc123",
        "test-image",
      );

      // Simulate failure
      mockProcess.stderr.emit("data", "Error: Crash file not found\n");
      mockProcess.emit("close", 1);

      await assert.rejects(promise, /Backtrace script exited with code 1/);
    });

    test("Should handle process error event", async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      const promise = backtraceService.executeBacktraceScript(
        "/workspace",
        "test-fuzz/abc123",
        "test-image",
      );

      // Simulate process error
      mockProcess.emit("error", new Error("Failed to start Docker"));

      await assert.rejects(promise, /Failed to execute backtrace script/);
    });

    test("Should return stderr if no stdout available", async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      const promise = backtraceService.executeBacktraceScript(
        "/workspace",
        "test-fuzz/abc123",
        "test-image",
      );

      // Simulate execution with only stderr
      mockProcess.stderr.emit("data", "GDB output via stderr\n");
      mockProcess.emit("close", 0);

      const result = await promise;
      assert.strictEqual(result, "GDB output via stderr");
    });
  });

  suite("generateBacktrace", () => {
    test("Should generate backtrace successfully", async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      const workspacePath = "/workspace";
      const fuzzerName = "example-fuzz";
      const crashHash = "abc123";
      const imageName = "test-image";

      const promise = backtraceService.generateBacktrace(
        workspacePath,
        fuzzerName,
        crashHash,
        imageName,
      );

      // Simulate successful backtrace generation
      mockProcess.stdout.emit("data", "#0  0x00007ffff7a9e000 in main ()\n");
      mockProcess.emit("close", 0);

      const result = await promise;
      assert(result.includes("#0  0x00007ffff7a9e000 in main ()"));
    });

    test("Should throw error on failure", async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      const promise = backtraceService.generateBacktrace(
        "/workspace",
        "test-fuzz",
        "abc123",
        "test-image",
      );

      // Simulate failure
      mockProcess.stderr.emit("data", "Script error\n");
      mockProcess.emit("close", 1);

      await assert.rejects(promise, /Backtrace generation failed/);
    });
  });

  suite("isBacktraceAvailable", () => {
    test("Should return true when script and directories exist", async () => {
      const fs = require("fs").promises;
      const accessStub = sandbox.stub(fs, "access").resolves();

      const result = await backtraceService.isBacktraceAvailable(
        "/workspace",
        "test-fuzz",
      );

      assert.strictEqual(result, true);
      assert.strictEqual(accessStub.callCount, 2); // Script + fuzzing dir
    });

    test("Should return false when script does not exist", async () => {
      const fs = require("fs").promises;
      const accessStub = sandbox
        .stub(fs, "access")
        .rejects(new Error("ENOENT: no such file or directory"));

      const result = await backtraceService.isBacktraceAvailable(
        "/workspace",
        "test-fuzz",
      );

      assert.strictEqual(result, false);
    });

    test("Should return false when fuzzing directory does not exist", async () => {
      const fs = require("fs").promises;
      const accessStub = sandbox.stub(fs, "access");
      accessStub.onFirstCall().resolves(); // Script exists
      accessStub.onSecondCall().rejects(new Error("ENOENT")); // Dir doesn't exist

      const result = await backtraceService.isBacktraceAvailable(
        "/workspace",
        "test-fuzz",
      );

      assert.strictEqual(result, false);
    });
  });
});
