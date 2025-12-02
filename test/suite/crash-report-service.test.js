/**
 * CrashReportService Test Suite
 *
 * This file contains comprehensive tests for the CrashReportService functionality:
 * - generateCrashReport - Main crash report generation method
 * - executeCrashReportScript - Docker command execution (codeforge generate-crash-report)
 * - extractCrashHash - Crash ID parsing
 * - formatCrashReportForDisplay - Output formatting (now returns full crash report)
 * - isCrashReportAvailable - Availability checking
 */

const assert = require("assert");
const sinon = require("sinon");
const path = require("path");
const { CrashReportService } = require("../../src/fuzzing/crashReportService");
const dockerOperations = require("../../src/core/dockerOperations");
const EventEmitter = require("events");

suite("CrashReportService Test Suite", () => {
  let sandbox;
  let crashReportService;

  setup(() => {
    sandbox = sinon.createSandbox();
    crashReportService = new CrashReportService();
  });

  teardown(() => {
    sandbox.restore();
  });

  suite("extractCrashHash", () => {
    test("Should extract hash from crash-prefixed ID", () => {
      const crashId = "crash-abc123def456";
      const hash = crashReportService.extractCrashHash(crashId);
      assert.strictEqual(hash, "abc123def456");
    });

    test("Should return ID as-is if no crash- prefix", () => {
      const crashId = "abc123def456";
      const hash = crashReportService.extractCrashHash(crashId);
      assert.strictEqual(hash, "abc123def456");
    });

    test("Should throw error for empty crash ID", () => {
      assert.throws(() => {
        crashReportService.extractCrashHash("");
      }, /Crash ID is required/);
    });

    test("Should throw error for null crash ID", () => {
      assert.throws(() => {
        crashReportService.extractCrashHash(null);
      }, /Crash ID is required/);
    });
  });

  suite("formatCrashReportForDisplay", () => {
    test("Should return crash report as-is with spacing", () => {
      const crashReport =
        "CRASH REPORT\n#0  0x00007ffff7a9e000 in main ()\n#1  0x00007ffff7a9e100 in foo ()";
      const fuzzerName = "example-fuzz";
      const crashId = "crash-abc123";

      const formatted = crashReportService.formatCrashReportForDisplay(
        crashReport,
        fuzzerName,
        crashId,
      );

      // The codeforge generate-crash-report command returns a fully formatted report
      // formatCrashReportForDisplay just adds spacing
      assert(formatted.includes(crashReport));
      assert(formatted.startsWith("\n"));
      assert(formatted.endsWith("\n"));
    });

    test("Should handle empty crash report gracefully", () => {
      const formatted = crashReportService.formatCrashReportForDisplay(
        "",
        "test-fuzz",
        "crash-123",
      );

      assert(formatted.includes("CRASH REPORT NOT AVAILABLE"));
      assert(formatted.includes("Could not generate crash report"));
    });

    test("Should handle null crash report gracefully", () => {
      const formatted = crashReportService.formatCrashReportForDisplay(
        null,
        "test-fuzz",
        "crash-123",
      );

      assert(formatted.includes("CRASH REPORT NOT AVAILABLE"));
    });

    test("Should accept but ignore crash time parameter (kept for compatibility)", () => {
      const crashReport = "CRASH REPORT\n#0  0x00007ffff7a9e000 in main ()";
      const fuzzerName = "example-fuzz";
      const crashId = "crash-abc123";
      const crashTime = new Date("2024-12-19T15:45:23.000Z");

      const formatted = crashReportService.formatCrashReportForDisplay(
        crashReport,
        fuzzerName,
        crashId,
        crashTime,
      );

      // Should return the crash report with spacing
      assert(formatted.includes(crashReport));
    });
  });

  suite("executeCrashReportScript", () => {
    test("Should execute codeforge generate-crash-report command and return stdout on success", async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      const runDockerStub = sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      const workspacePath = "/workspace";
      const crashIdentifier = "example-fuzz/abc123";
      const imageName = "test-image";

      const promise = crashReportService.executeCrashReportScript(
        workspacePath,
        crashIdentifier,
        imageName,
      );

      // Simulate successful execution with full crash report
      mockProcess.stdout.emit(
        "data",
        "CRASH REPORT\n#0  0x00007ffff7a9e000 in main ()\n",
      );
      mockProcess.stdout.emit("data", "#1  0x00007ffff7a9e100 in foo ()\n");
      mockProcess.emit("close", 0);

      const result = await promise;

      assert(result.includes("#0  0x00007ffff7a9e000 in main ()"));
      assert(result.includes("#1  0x00007ffff7a9e100 in foo ()"));
      assert(runDockerStub.calledOnce);
    });

    test("Should handle command failure with error code", async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      const promise = crashReportService.executeCrashReportScript(
        "/workspace",
        "test-fuzz/abc123",
        "test-image",
      );

      // Simulate failure
      mockProcess.stderr.emit("data", "Error: Crash file not found\n");
      mockProcess.emit("close", 1);

      await assert.rejects(
        promise,
        /Crash report generation exited with code 1/,
      );
    });

    test("Should handle process error event", async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      const promise = crashReportService.executeCrashReportScript(
        "/workspace",
        "test-fuzz/abc123",
        "test-image",
      );

      // Simulate process error
      mockProcess.emit("error", new Error("Failed to start Docker"));

      await assert.rejects(
        promise,
        /Failed to execute crash report generation/,
      );
    });

    test("Should return stderr if no stdout available", async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      const promise = crashReportService.executeCrashReportScript(
        "/workspace",
        "test-fuzz/abc123",
        "test-image",
      );

      // Simulate execution with only stderr
      mockProcess.stderr.emit("data", "Crash report via stderr\n");
      mockProcess.emit("close", 0);

      const result = await promise;
      assert.strictEqual(result, "Crash report via stderr");
    });
  });

  suite("generateCrashReport", () => {
    test("Should generate crash report successfully", async () => {
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

      const promise = crashReportService.generateCrashReport(
        workspacePath,
        fuzzerName,
        crashHash,
        imageName,
      );

      // Simulate successful crash report generation
      mockProcess.stdout.emit(
        "data",
        "CRASH REPORT\n#0  0x00007ffff7a9e000 in main ()\n",
      );
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

      const promise = crashReportService.generateCrashReport(
        "/workspace",
        "test-fuzz",
        "abc123",
        "test-image",
      );

      // Simulate failure
      mockProcess.stderr.emit("data", "Script error\n");
      mockProcess.emit("close", 1);

      await assert.rejects(promise, /Crash report generation failed/);
    });
  });

  suite("isCrashReportAvailable", () => {
    test("Should return true when fuzzing directory exists", async () => {
      const fs = require("fs").promises;
      const accessStub = sandbox.stub(fs, "access").resolves();

      const result = await crashReportService.isCrashReportAvailable(
        "/workspace",
        "test-fuzz",
      );

      assert.strictEqual(result, true);
      assert.strictEqual(accessStub.callCount, 1); // Only fuzzing dir
    });

    test("Should return false when fuzzing directory does not exist", async () => {
      const fs = require("fs").promises;
      const accessStub = sandbox
        .stub(fs, "access")
        .rejects(new Error("ENOENT: no such file or directory"));

      const result = await crashReportService.isCrashReportAvailable(
        "/workspace",
        "test-fuzz",
      );

      assert.strictEqual(result, false);
    });
  });
});
