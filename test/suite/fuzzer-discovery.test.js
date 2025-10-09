const assert = require("assert");
const path = require("path");
const {
  FuzzerDiscoveryService,
} = require("../../src/fuzzing/fuzzerDiscoveryService");

suite("FuzzerDiscoveryService Tests", function () {
  let fuzzerDiscoveryService;
  const testWorkspacePath = path.join(__dirname, "..", "fixtures");

  setup(function () {
    fuzzerDiscoveryService = new FuzzerDiscoveryService();
  });

  test("should create FuzzerDiscoveryService instance", function () {
    assert.ok(fuzzerDiscoveryService instanceof FuzzerDiscoveryService);
    assert.ok(fuzzerDiscoveryService.crashDiscoveryService);
    assert.ok(fuzzerDiscoveryService.cachedFuzzers instanceof Map);
  });

  test("should have required methods", function () {
    assert.strictEqual(
      typeof fuzzerDiscoveryService.discoverFuzzers,
      "function",
    );
    assert.strictEqual(
      typeof fuzzerDiscoveryService.associateCrashesWithFuzzers,
      "function",
    );
    assert.strictEqual(
      typeof fuzzerDiscoveryService.refreshFuzzerData,
      "function",
    );
  });

  test("should parse find script output correctly", function () {
    const testOutput = `
debug:codeforge-example-fuzz
release:codeforge-test-fuzz
debug:codeforge-another-fuzz
    `;

    const result = fuzzerDiscoveryService.parseFindScriptOutput(testOutput);

    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result[0], {
      preset: "debug",
      fuzzer: "codeforge-example-fuzz",
    });
    assert.deepStrictEqual(result[1], {
      preset: "release",
      fuzzer: "codeforge-test-fuzz",
    });
    assert.deepStrictEqual(result[2], {
      preset: "debug",
      fuzzer: "codeforge-another-fuzz",
    });
  });

  test("should handle empty find script output", function () {
    const result = fuzzerDiscoveryService.parseFindScriptOutput("");
    assert.strictEqual(result.length, 0);
  });

  test("should handle malformed find script output", function () {
    const testOutput = `
invalid-line-without-colon
debug:codeforge-valid-fuzz
another-invalid-line
    `;

    const result = fuzzerDiscoveryService.parseFindScriptOutput(testOutput);

    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], {
      preset: "debug",
      fuzzer: "codeforge-valid-fuzz",
    });
  });

  test("should associate crashes with fuzzers correctly", function () {
    const crashData = [
      {
        fuzzerName: "example-fuzz",
        crashes: [
          { id: "crash1", createdAt: "2023-01-01T10:00:00Z" },
          { id: "crash2", createdAt: "2023-01-01T11:00:00Z" },
        ],
      },
      {
        fuzzerName: "other-fuzz",
        crashes: [{ id: "crash3", createdAt: "2023-01-01T12:00:00Z" }],
      },
    ];

    const result = fuzzerDiscoveryService.associateCrashesWithFuzzers(
      "example-fuzz",
      crashData,
    );

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, "crash2"); // Newest first
    assert.strictEqual(result[1].id, "crash1");
  });

  test("should return empty array for fuzzer with no crashes", function () {
    const crashData = [
      {
        fuzzerName: "other-fuzz",
        crashes: [{ id: "crash1", createdAt: "2023-01-01T10:00:00Z" }],
      },
    ];

    const result = fuzzerDiscoveryService.associateCrashesWithFuzzers(
      "example-fuzz",
      crashData,
    );
    assert.strictEqual(result.length, 0);
  });

  test("should get correct fuzzer output directory", function () {
    const result = fuzzerDiscoveryService.getFuzzerOutputDirectory(
      testWorkspacePath,
      "codeforge-example-fuzz",
    );
    const expected = path.join(
      testWorkspacePath,
      ".codeforge",
      "fuzzing",
      "codeforge-example-fuzz-output",
    );
    assert.strictEqual(result, expected);
  });

  test("should manage cache correctly", function () {
    // Initially cache should be invalid
    assert.strictEqual(fuzzerDiscoveryService.isCacheValid(), false);

    // Update cache with test data
    const testFuzzers = [
      { name: "test-fuzz", preset: "debug", status: "built" },
    ];
    fuzzerDiscoveryService.updateCache(testFuzzers);

    // Cache should now be valid
    assert.strictEqual(fuzzerDiscoveryService.isCacheValid(), true);
    assert.strictEqual(fuzzerDiscoveryService.getAllCachedFuzzers().length, 1);
    assert.ok(fuzzerDiscoveryService.getCachedFuzzer("test-fuzz"));

    // Invalidate cache
    fuzzerDiscoveryService.invalidateCache();
    assert.strictEqual(fuzzerDiscoveryService.isCacheValid(), false);
    assert.strictEqual(fuzzerDiscoveryService.getAllCachedFuzzers().length, 0);
  });

  test("should handle cache timeout", function (done) {
    // Set a very short cache timeout for testing
    fuzzerDiscoveryService.cacheTimeout = 10; // 10ms

    const testFuzzers = [
      { name: "test-fuzz", preset: "debug", status: "built" },
    ];
    fuzzerDiscoveryService.updateCache(testFuzzers);

    // Cache should be valid initially
    assert.strictEqual(fuzzerDiscoveryService.isCacheValid(), true);

    // Wait for cache to expire
    setTimeout(() => {
      assert.strictEqual(fuzzerDiscoveryService.isCacheValid(), false);
      done();
    }, 15);
  });

  suite("Integration Tests", function () {
    const sinon = require("sinon");
    let sandbox;
    let clock;

    setup(function () {
      sandbox = sinon.createSandbox();
      // Use fake timers to control Date.now() and new Date() for consistent timestamps
      clock = sinon.useFakeTimers({
        now: new Date("2024-01-15T10:30:00.000Z"),
        toFake: ["Date"],
      });
    });

    teardown(function () {
      clock.restore();
      sandbox.restore();
    });

    test("should integrate with CrashDiscoveryService", async function () {
      // Mock the crash discovery service
      const mockCrashData = [
        {
          fuzzerName: "example-fuzz",
          crashes: [
            {
              id: "crash-123",
              filePath: "/path/to/crash-123",
              fileName: "crash-123",
              fileSize: 1024,
              createdAt: "2024-01-15T10:30:00.000Z",
              fuzzerName: "example-fuzz",
            },
          ],
        },
      ];

      sandbox
        .stub(fuzzerDiscoveryService.crashDiscoveryService, "discoverCrashes")
        .resolves(mockCrashData);

      // Mock Docker operations for fuzzer discovery
      const dockerOperations = require("../../src/core/dockerOperations");
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      // Mock the process events for success
      mockProcess.stdout.on
        .withArgs("data")
        .callsArgWith(
          1,
          "debug:codeforge-example-fuzz\nrelease:codeforge-test-fuzz\n",
        );
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0);

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Mock file system operations
      const fs = require("fs").promises;
      sandbox.stub(fs, "access").resolves(); // File exists
      sandbox.stub(fs, "stat").resolves({
        isFile: () => true,
        mtime: new Date(),
      });

      const result =
        await fuzzerDiscoveryService.discoverFuzzers(testWorkspacePath);

      assert.ok(Array.isArray(result), "Should return array of fuzzers");
      assert.ok(result.length > 0, "Should find fuzzers");

      // Verify simplified fuzzer structure
      const fuzzer = result[0];
      assert.ok(fuzzer.name, "Fuzzer should have name");
      assert.ok(fuzzer.preset, "Fuzzer should have preset");
      assert.ok(
        Array.isArray(fuzzer.crashes),
        "Fuzzer should have crashes array",
      );
      assert.ok(fuzzer.lastUpdated, "Fuzzer should have lastUpdated");
      assert.ok(fuzzer.outputDir, "Fuzzer should have outputDir");
    });

    test("should handle Docker command failures gracefully", async function () {
      const dockerOperations = require("../../src/core/dockerOperations");
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      // Mock the process events for failure
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, "");
      mockProcess.stderr.on
        .withArgs("data")
        .callsArgWith(1, "Docker not available");
      mockProcess.on.withArgs("close").callsArgWith(1, 1);

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      try {
        await fuzzerDiscoveryService.discoverFuzzers(testWorkspacePath);
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(
          error.message.includes("Failed to discover fuzzers"),
          "Should throw discovery error",
        );
        assert.ok(
          error.message.includes("Docker not available"),
          "Should include Docker error message",
        );
      }
    });

    test("should handle crash discovery failures gracefully", async function () {
      // Mock successful fuzzer discovery
      const dockerOperations = require("../../src/core/dockerOperations");
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      // Mock the process events for success
      mockProcess.stdout.on
        .withArgs("data")
        .callsArgWith(1, "debug:codeforge-example-fuzz\n");
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0);

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Mock file system operations
      const fs = require("fs").promises;
      sandbox.stub(fs, "access").resolves();
      sandbox.stub(fs, "stat").resolves({
        isFile: () => true,
        mtime: new Date(),
      });

      // Mock crash discovery failure
      sandbox
        .stub(fuzzerDiscoveryService.crashDiscoveryService, "discoverCrashes")
        .rejects(new Error("Permission denied"));

      const result =
        await fuzzerDiscoveryService.discoverFuzzers(testWorkspacePath);

      assert.ok(
        Array.isArray(result),
        "Should return array even when crash discovery fails",
      );
      assert.ok(result.length > 0, "Should still return fuzzers");

      // Verify fuzzer has empty crashes array when crash discovery fails
      const fuzzer = result[0];
      assert.strictEqual(
        fuzzer.crashes.length,
        0,
        "Should have empty crashes array on crash discovery failure",
      );
    });

    test("should build simplified fuzzer objects", async function () {
      const mockFuzzerList = [
        {
          preset: "Debug",
          fuzzer: "example-fuzz",
        },
      ];

      const mockCrashData = [
        {
          fuzzerName: "example-fuzz",
          crashes: [
            {
              id: "crash-123",
              filePath: "/path/to/crash-123",
              fileName: "crash-123",
              fileSize: 1024,
              createdAt: "2024-01-15T10:30:00.000Z",
              fuzzerName: "example-fuzz",
            },
          ],
        },
      ];

      const result = await fuzzerDiscoveryService.buildFuzzerObjects(
        testWorkspacePath,
        mockFuzzerList,
        mockCrashData,
      );

      assert.ok(Array.isArray(result), "Should return array of fuzzers");
      assert.strictEqual(result.length, 1, "Should have one fuzzer");

      const fuzzer = result[0];
      assert.strictEqual(
        fuzzer.name,
        "example-fuzz",
        "Should have correct name",
      );
      assert.strictEqual(fuzzer.preset, "Debug", "Should have correct preset");
      assert.ok(Array.isArray(fuzzer.crashes), "Should have crashes array");
      assert.strictEqual(fuzzer.crashes.length, 1, "Should have one crash");
      assert.ok(fuzzer.lastUpdated, "Should have lastUpdated");
      assert.ok(fuzzer.outputDir, "Should have outputDir");
    });

    test("should handle fuzzer objects without crashes", async function () {
      const mockFuzzerList = [
        {
          preset: "Debug",
          fuzzer: "no-crash-fuzz",
        },
      ];

      const result = await fuzzerDiscoveryService.buildFuzzerObjects(
        testWorkspacePath,
        mockFuzzerList,
        [],
      );

      assert.ok(Array.isArray(result), "Should return array of fuzzers");
      assert.strictEqual(result.length, 1, "Should have one fuzzer");

      const fuzzer = result[0];
      assert.strictEqual(
        fuzzer.name,
        "no-crash-fuzz",
        "Should have correct name",
      );
      assert.strictEqual(fuzzer.preset, "Debug", "Should have correct preset");
      assert.ok(Array.isArray(fuzzer.crashes), "Should have crashes array");
      assert.strictEqual(fuzzer.crashes.length, 0, "Should have no crashes");
    });

    test("should refresh specific fuzzer data", async function () {
      // Setup cache with initial data - use a different timestamp for initial data
      const initialTimestamp = new Date("2024-01-15T10:00:00.000Z"); // Earlier than mocked time
      const initialFuzzers = [
        {
          name: "example-fuzz",
          preset: "Debug",
          crashes: [],
          lastUpdated: initialTimestamp,
          outputDir: "/test/output",
        },
      ];
      fuzzerDiscoveryService.updateCache(initialFuzzers);

      // Mock crash discovery with new crashes
      const mockCrashData = [
        {
          fuzzerName: "example-fuzz",
          crashes: [
            {
              id: "crash-456",
              filePath: "/path/to/crash-456",
              fileName: "crash-456",
              fileSize: 2048,
              createdAt: "2024-01-15T11:30:00.000Z",
              fuzzerName: "example-fuzz",
            },
          ],
        },
      ];

      sandbox
        .stub(fuzzerDiscoveryService.crashDiscoveryService, "discoverCrashes")
        .resolves(mockCrashData);

      const updatedFuzzers = await fuzzerDiscoveryService.refreshFuzzerData(
        testWorkspacePath,
        "test-container",
        "example-fuzz",
      );

      assert.ok(
        Array.isArray(updatedFuzzers),
        "Should return array of fuzzers",
      );
      assert.strictEqual(
        updatedFuzzers.length,
        1,
        "Should return exactly one fuzzer",
      );

      const updatedFuzzer = updatedFuzzers[0];
      assert.ok(updatedFuzzer, "Should return updated fuzzer");
      assert.strictEqual(
        updatedFuzzer.name,
        "example-fuzz",
        "Should have correct name",
      );
      assert.strictEqual(
        updatedFuzzer.crashes.length,
        1,
        "Should have updated crashes",
      );
      assert.ok(
        updatedFuzzer.lastUpdated > initialFuzzers[0].lastUpdated,
        "Should have newer timestamp",
      );
    });
  });

  suite("Error Handling Tests", function () {
    const sinon = require("sinon");
    let sandbox;
    let clock;

    setup(function () {
      sandbox = sinon.createSandbox();
      // Use fake timers to control Date.now() and new Date() for consistent timestamps
      clock = sinon.useFakeTimers({
        now: new Date("2024-01-15T10:30:00.000Z"),
        toFake: ["Date"],
      });
    });

    teardown(function () {
      clock.restore();
      sandbox.restore();
    });

    test("should handle workspace path errors", async function () {
      try {
        await fuzzerDiscoveryService.discoverFuzzers("/nonexistent/path");
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(
          error.message.includes("Failed to discover fuzzers"),
          "Should throw discovery error",
        );
      }
    });

    test("should handle malformed Docker output", async function () {
      const dockerOperations = require("../../src/core/dockerOperations");
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      // Mock the process events with malformed output (no colons)
      mockProcess.stdout.on
        .withArgs("data")
        .callsArgWith(1, "malformed\noutput\nwithout_proper_format\n");
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0);

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Mock crash discovery
      sandbox
        .stub(fuzzerDiscoveryService.crashDiscoveryService, "discoverCrashes")
        .resolves([]);

      const result =
        await fuzzerDiscoveryService.discoverFuzzers(testWorkspacePath);

      assert.ok(Array.isArray(result), "Should handle malformed output");
      assert.strictEqual(
        result.length,
        0,
        "Should return empty array for malformed output",
      );
    });

    test("should handle concurrent discovery requests", async function () {
      // Mock Docker operations with delay
      const dockerOperations = require("../../src/core/dockerOperations");
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      // Mock the process events with delay
      mockProcess.stdout.on
        .withArgs("data")
        .callsArgWith(1, "debug:codeforge-example-fuzz\n");
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsFake((event, callback) => {
        setTimeout(() => callback(0), 100);
      });

      sandbox
        .stub(dockerOperations, "runDockerCommandWithOutput")
        .returns(mockProcess);

      // Mock crash discovery
      sandbox
        .stub(fuzzerDiscoveryService.crashDiscoveryService, "discoverCrashes")
        .resolves([]);

      // Mock file system operations with fixed timestamp to prevent timing issues
      const fs = require("fs").promises;
      const fixedMtime = new Date("2024-01-15T10:30:00.000Z"); // Same as mocked time
      sandbox.stub(fs, "access").resolves();
      sandbox.stub(fs, "stat").resolves({
        isFile: () => true,
        mtime: fixedMtime,
      });

      // Start multiple concurrent discovery requests
      const promises = [
        fuzzerDiscoveryService.discoverFuzzers(testWorkspacePath),
        fuzzerDiscoveryService.discoverFuzzers(testWorkspacePath),
        fuzzerDiscoveryService.discoverFuzzers(testWorkspacePath),
      ];

      const results = await Promise.all(promises);

      // All should succeed and return consistent results
      results.forEach((result) => {
        assert.ok(Array.isArray(result), "Should return array");
        assert.ok(result.length > 0, "Should find fuzzers");
      });

      // Results should be consistent - fixed timing issue by using fixed mtime in fs.stat mock
      assert.deepStrictEqual(
        results[0],
        results[1],
        "Concurrent requests should return same results",
      );
      assert.deepStrictEqual(
        results[1],
        results[2],
        "Concurrent requests should return same results",
      );
    });
  });
});
