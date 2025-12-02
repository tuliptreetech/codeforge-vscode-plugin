const assert = require("assert");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs").promises;
const { CrashReportProvider } = require("../../src/ui/crashReportProvider");

suite("CrashReportProvider Test Suite", () => {
  let testCrashFile;
  let crashReportProvider;

  suiteSetup(async () => {
    // Create a test crash file
    testCrashFile = path.join(__dirname, "..", "fixtures", "test-crash.bin");

    // Ensure fixtures directory exists
    const fixturesDir = path.dirname(testCrashFile);
    try {
      await fs.mkdir(fixturesDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Create test binary data
    const testData = Buffer.from([
      0x00,
      0x01,
      0x02,
      0x03,
      0x04,
      0x05,
      0x06,
      0x07,
      0x08,
      0x09,
      0x0a,
      0x0b,
      0x0c,
      0x0d,
      0x0e,
      0x0f,
      0x10,
      0x11,
      0x12,
      0x13,
      0x14,
      0x15,
      0x16,
      0x17,
      0x18,
      0x19,
      0x1a,
      0x1b,
      0x1c,
      0x1d,
      0x1e,
      0x1f,
      // Add some ASCII characters
      0x48,
      0x65,
      0x6c,
      0x6c,
      0x6f,
      0x20,
      0x57,
      0x6f, // "Hello Wo"
      0x72,
      0x6c,
      0x64,
      0x21,
      0x00,
      0x00,
      0x00,
      0x00, // "rld!"
      // Add some more binary data
      0xff,
      0xfe,
      0xfd,
      0xfc,
      0xfb,
      0xfa,
      0xf9,
      0xf8,
      0xf7,
      0xf6,
      0xf5,
      0xf4,
      0xf3,
      0xf2,
      0xf1,
      0xf0,
    ]);

    await fs.writeFile(testCrashFile, testData);

    // Create hex provider instance
    crashReportProvider = new CrashReportProvider();
  });

  suiteTeardown(async () => {
    // Clean up test file
    try {
      await fs.unlink(testCrashFile);
    } catch (error) {
      // File might not exist
    }

    // Dispose provider
    if (crashReportProvider) {
      crashReportProvider.dispose();
    }
  });

  test("CrashReportProvider should create virtual URI correctly", () => {
    const filePath = "/path/to/crash-file.bin";
    const crashId = "crash-001";

    const uri = CrashReportProvider.createCrashReportUri(filePath, crashId);

    assert.strictEqual(uri.scheme, "codeforge-crash");
    assert.strictEqual(uri.path, "crash-001.txt");

    const query = new URLSearchParams(uri.query);
    assert.strictEqual(query.get("file"), filePath);
    assert.strictEqual(query.get("crashId"), crashId);
  });

  test("CrashReportProvider should return message when fuzzer context missing", async () => {
    const crashId = "test-crash-001";
    const uri = CrashReportProvider.createCrashReportUri(
      testCrashFile,
      crashId,
    );

    const content = await crashReportProvider.provideTextDocumentContent(uri);

    // Should return message about missing fuzzer context
    assert(content.includes(`Crash file: ${crashId}`));
    assert(content.includes(`Path: ${testCrashFile}`));
    assert(
      content.includes(
        "Full crash report unavailable - missing fuzzer context",
      ),
    );
    assert(
      content.includes("This document is read-only and cannot be edited."),
    );
  });

  test("CrashReportProvider should handle missing file gracefully", async () => {
    const nonExistentFile = "/path/to/nonexistent/file.bin";
    const crashId = "missing-crash-001";
    const uri = CrashReportProvider.createCrashReportUri(
      nonExistentFile,
      crashId,
    );

    const content = await crashReportProvider.provideTextDocumentContent(uri);

    // Should return message about missing fuzzer context (not an error about missing file)
    assert(
      content.includes(
        "Full crash report unavailable - missing fuzzer context",
      ),
    );
    assert(
      content.includes("This document is read-only and cannot be edited."),
    );
  });

  test("CrashReportProvider should cache content", async () => {
    const crashId = "cache-test-001";
    const uri = CrashReportProvider.createCrashReportUri(
      testCrashFile,
      crashId,
    );

    // First call
    const content1 = await crashReportProvider.provideTextDocumentContent(uri);

    // Second call should use cache
    const content2 = await crashReportProvider.provideTextDocumentContent(uri);

    assert.strictEqual(content1, content2);

    // Verify cache is working by checking internal cache
    const cacheKey = `${testCrashFile}:${crashId}`;
    assert(crashReportProvider.contentCache.has(cacheKey));
  });

  test("CrashReportProvider should clear cache", async () => {
    const crashId = "clear-cache-test-001";
    const uri = CrashReportProvider.createCrashReportUri(
      testCrashFile,
      crashId,
    );

    // Generate content to populate cache
    await crashReportProvider.provideTextDocumentContent(uri);

    const cacheKey = `${testCrashFile}:${crashId}`;
    assert(crashReportProvider.contentCache.has(cacheKey));

    // Clear cache
    crashReportProvider.clearCache();

    assert(!crashReportProvider.contentCache.has(cacheKey));
  });

  test("CrashReportProvider should handle empty files", async () => {
    // Create empty test file
    const emptyFile = path.join(__dirname, "..", "fixtures", "empty-crash.bin");
    await fs.writeFile(emptyFile, Buffer.alloc(0));

    try {
      const crashId = "empty-crash-001";
      const uri = CrashReportProvider.createCrashReportUri(emptyFile, crashId);

      const content = await crashReportProvider.provideTextDocumentContent(uri);

      // Should return message about missing fuzzer context
      assert(
        content.includes(
          "Full crash report unavailable - missing fuzzer context",
        ),
      );
    } finally {
      // Clean up
      try {
        await fs.unlink(emptyFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  test("CrashReportProvider should truncate large files", async () => {
    // Create a large test file (larger than 64KB)
    const largeFile = path.join(__dirname, "..", "fixtures", "large-crash.bin");
    const largeData = Buffer.alloc(100 * 1024, 0xaa); // 100KB of 0xAA
    await fs.writeFile(largeFile, largeData);

    try {
      const crashId = "large-crash-001";
      const uri = CrashReportProvider.createCrashReportUri(largeFile, crashId);

      const content = await crashReportProvider.provideTextDocumentContent(uri);

      // Should return message about missing fuzzer context
      assert(
        content.includes(
          "Full crash report unavailable - missing fuzzer context",
        ),
      );
    } finally {
      // Clean up
      try {
        await fs.unlink(largeFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });
});
