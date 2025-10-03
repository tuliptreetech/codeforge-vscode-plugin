/**
 * Initialization Detection Service Test Suite
 *
 * This file contains comprehensive tests for the CodeForge initialization detection service:
 * - isCodeForgeInitialized() function with various scenarios
 * - initializeProjectWithProgress() function with progress callbacks
 * - getInitializationStatusSummary() function
 * - hasCodeForgeProject() function
 * - Error handling and edge cases
 */

const assert = require("assert");
const sinon = require("sinon");
const path = require("path");
const fs = require("fs").promises;

// Import the module to test
const {
  InitializationDetectionService,
} = require("../../src/core/initializationDetectionService");

// Import test helpers
const {
  createMockExtensionContext,
  setupTestEnvironment,
  cleanupTestEnvironment,
  waitForAsync,
} = require("../utils/activity-bar-test-helpers");

suite("Initialization Detection Service Test Suite", () => {
  let sandbox;
  let testEnvironment;
  let initService;
  let mockResourceManager;
  let mockWorkspacePath;

  setup(() => {
    sandbox = sinon.createSandbox();
    testEnvironment = setupTestEnvironment(sandbox);
    mockWorkspacePath = "/test/workspace";

    // Create mock resource manager
    mockResourceManager = {
      dumpGitignore: sandbox.stub().resolves(),
      dumpDockerfile: sandbox.stub().resolves(),
      dumpScripts: sandbox.stub().resolves(),
    };

    initService = new InitializationDetectionService(mockResourceManager);
  });

  teardown(() => {
    cleanupTestEnvironment(sandbox);
  });

  suite("Constructor Tests", () => {
    test("Should create service with resource manager", () => {
      assert.ok(initService, "Service should be created");
      assert.strictEqual(
        initService.resourceManager,
        mockResourceManager,
        "Resource manager should be set",
      );
    });

    test("Should create service without resource manager", () => {
      const serviceWithoutRM = new InitializationDetectionService(null);
      assert.ok(
        serviceWithoutRM,
        "Service should be created without resource manager",
      );
      assert.strictEqual(
        serviceWithoutRM.resourceManager,
        null,
        "Resource manager should be null",
      );
    });
  });

  suite("isCodeForgeInitialized Tests", () => {
    let fsStatStub;

    setup(() => {
      // Only stub if not already stubbed
      if (!fs.stat.isSinonProxy) {
        fsStatStub = sandbox.stub(fs, "stat");
      } else {
        fsStatStub = fs.stat;
        fsStatStub.reset();
      }
    });

    test("Should return false for null workspace path", async () => {
      const result = await initService.isCodeForgeInitialized(null);

      assert.strictEqual(
        result.isInitialized,
        false,
        "Should not be initialized",
      );
      assert.deepStrictEqual(
        result.missingComponents,
        ["workspace"],
        "Should have workspace as missing component",
      );
      assert.strictEqual(
        result.details.error,
        "No workspace path provided",
        "Should have correct error message",
      );
    });

    test("Should return false for undefined workspace path", async () => {
      const result = await initService.isCodeForgeInitialized(undefined);

      assert.strictEqual(
        result.isInitialized,
        false,
        "Should not be initialized",
      );
      assert.deepStrictEqual(
        result.missingComponents,
        ["workspace"],
        "Should have workspace as missing component",
      );
    });

    test("Should return true for fully initialized project", async () => {
      // Mock all required files as existing
      const mockStats = {
        isDirectory: () => false,
        size: 1024,
        mtime: new Date(),
      };
      const mockDirStats = {
        isDirectory: () => true,
        size: 0,
        mtime: new Date(),
      };

      fsStatStub.callsFake((filePath) => {
        if (filePath.includes("scripts") && !filePath.includes(".sh")) {
          return Promise.resolve(mockDirStats);
        }
        if (
          filePath.includes(".codeforge") &&
          !filePath.includes("Dockerfile") &&
          !filePath.includes(".gitignore")
        ) {
          return Promise.resolve(mockDirStats);
        }
        return Promise.resolve(mockStats);
      });

      const result =
        await initService.isCodeForgeInitialized(mockWorkspacePath);

      assert.strictEqual(result.isInitialized, true, "Should be initialized");
      assert.strictEqual(
        result.missingComponents.length,
        0,
        "Should have no missing components",
      );

      // Verify all components are marked as existing
      const expectedComponents = [
        "codeforgeDirectory",
        "dockerfile",
        "gitignore",
        "scriptsDirectory",
        "buildScript",
        "findScript",
        "runScript",
      ];

      expectedComponents.forEach((component) => {
        assert.strictEqual(
          result.details[component].exists,
          true,
          `${component} should exist`,
        );
      });
    });

    test("Should return false for partially initialized project", async () => {
      // Mock some files as missing
      fsStatStub.callsFake((filePath) => {
        if (
          filePath.includes("Dockerfile") ||
          filePath.includes("build-fuzz-tests.sh")
        ) {
          const error = new Error("File not found");
          error.code = "ENOENT";
          return Promise.reject(error);
        }

        const mockStats =
          filePath.includes("scripts") && !filePath.includes(".sh")
            ? { isDirectory: () => true, size: 0, mtime: new Date() }
            : { isDirectory: () => false, size: 1024, mtime: new Date() };

        return Promise.resolve(mockStats);
      });

      const result =
        await initService.isCodeForgeInitialized(mockWorkspacePath);

      assert.strictEqual(
        result.isInitialized,
        false,
        "Should not be initialized",
      );
      assert.ok(
        result.missingComponents.includes("dockerfile"),
        "Should include dockerfile as missing",
      );
      assert.ok(
        result.missingComponents.includes("buildScript"),
        "Should include buildScript as missing",
      );
      assert.strictEqual(
        result.details.dockerfile.exists,
        false,
        "Dockerfile should not exist",
      );
      assert.strictEqual(
        result.details.buildScript.exists,
        false,
        "Build script should not exist",
      );
    });

    test("Should return false for uninitialized project", async () => {
      // Mock all files as missing
      fsStatStub.callsFake(() => {
        const error = new Error("File not found");
        error.code = "ENOENT";
        return Promise.reject(error);
      });

      const result =
        await initService.isCodeForgeInitialized(mockWorkspacePath);

      assert.strictEqual(
        result.isInitialized,
        false,
        "Should not be initialized",
      );
      assert.strictEqual(
        result.missingComponents.length,
        10,
        "Should have 7 missing components",
      );

      const expectedMissing = [
        "codeforgeDirectory",
        "dockerfile",
        "gitignore",
        "scriptsDirectory",
        "buildScript",
        "findScript",
        "runScript",
      ];

      expectedMissing.forEach((component) => {
        assert.ok(
          result.missingComponents.includes(component),
          `Should include ${component} as missing`,
        );
        assert.strictEqual(
          result.details[component].exists,
          false,
          `${component} should not exist`,
        );
      });
    });

    test("Should handle file system errors gracefully", async () => {
      // Mock file system error
      fsStatStub.callsFake(() => {
        const error = new Error("Permission denied");
        error.code = "EACCES";
        return Promise.reject(error);
      });

      const result =
        await initService.isCodeForgeInitialized(mockWorkspacePath);

      assert.strictEqual(
        result.isInitialized,
        false,
        "Should not be initialized",
      );
      assert.strictEqual(
        result.missingComponents.length,
        10,
        "Should have 7 missing components",
      );

      // Verify error codes are captured
      Object.values(result.details).forEach((detail) => {
        assert.strictEqual(detail.exists, false, "Component should not exist");
        assert.strictEqual(detail.error, "EACCES", "Should capture error code");
      });
    });

    test("Should provide detailed component information", async () => {
      const mockStats = {
        isDirectory: () => false,
        size: 2048,
        mtime: new Date("2023-01-01T00:00:00Z"),
      };

      fsStatStub.resolves(mockStats);

      const result =
        await initService.isCodeForgeInitialized(mockWorkspacePath);

      // Check detailed information for one component
      const dockerfileDetails = result.details.dockerfile;
      assert.strictEqual(
        dockerfileDetails.exists,
        true,
        "Dockerfile should exist",
      );
      assert.strictEqual(
        dockerfileDetails.isDirectory,
        false,
        "Dockerfile should not be directory",
      );
      assert.strictEqual(
        dockerfileDetails.size,
        2048,
        "Should have correct size",
      );
      assert.ok(
        dockerfileDetails.path.includes("Dockerfile"),
        "Should have correct path",
      );
      assert.ok(
        dockerfileDetails.modified instanceof Date,
        "Should have modification date",
      );
    });
  });

  suite("initializeProjectWithProgress Tests", () => {
    let fsStatStub;
    let fsMkdirStub;
    let progressCallback;

    setup(() => {
      // Only stub if not already stubbed
      if (!fs.stat.isSinonProxy) {
        fsStatStub = sandbox.stub(fs, "stat");
      } else {
        fsStatStub = fs.stat;
        fsStatStub.reset();
      }

      if (!fs.mkdir.isSinonProxy) {
        fsMkdirStub = sandbox.stub(fs, "mkdir");
      } else {
        fsMkdirStub = fs.mkdir;
        fsMkdirStub.reset();
      }

      progressCallback = sandbox.stub();
    });

    test("Should return error for null workspace path", async () => {
      const result = await initService.initializeProjectWithProgress(
        null,
        progressCallback,
      );

      assert.strictEqual(result.success, false, "Should not succeed");
      assert.strictEqual(
        result.error,
        "No workspace path provided",
        "Should have correct error",
      );
      assert.ok(
        progressCallback.notCalled,
        "Progress callback should not be called",
      );
    });

    test("Should return error when resource manager is not available", async () => {
      const serviceWithoutRM = new InitializationDetectionService(null);

      const result = await serviceWithoutRM.initializeProjectWithProgress(
        mockWorkspacePath,
        progressCallback,
      );

      assert.strictEqual(result.success, false, "Should not succeed");
      assert.strictEqual(
        result.error,
        "ResourceManager not available",
        "Should have correct error",
      );
    });

    test("Should return success if already initialized", async () => {
      // Mock fully initialized state
      const mockStats = {
        isDirectory: () => false,
        size: 1024,
        mtime: new Date(),
      };
      const mockDirStats = {
        isDirectory: () => true,
        size: 0,
        mtime: new Date(),
      };

      fsStatStub.callsFake((filePath) => {
        if (filePath.includes("scripts") && !filePath.includes(".sh")) {
          return Promise.resolve(mockDirStats);
        }
        if (
          filePath.includes(".codeforge") &&
          !filePath.includes("Dockerfile") &&
          !filePath.includes(".gitignore")
        ) {
          return Promise.resolve(mockDirStats);
        }
        return Promise.resolve(mockStats);
      });

      const result = await initService.initializeProjectWithProgress(
        mockWorkspacePath,
        progressCallback,
      );

      assert.strictEqual(result.success, true, "Should succeed");
      assert.ok(
        result.details.message.includes("already initialized"),
        "Should indicate already initialized",
      );
      assert.ok(
        progressCallback.calledWith("CodeForge already initialized", 100),
        "Should report completion",
      );
    });

    test("Should initialize project with progress reporting", async () => {
      // Mock uninitialized state initially, then initialized after creation
      let callCount = 0;
      fsStatStub.callsFake((filePath) => {
        callCount++;
        if (callCount <= 7) {
          // First call (initial check) - all missing
          const error = new Error("File not found");
          error.code = "ENOENT";
          return Promise.reject(error);
        } else {
          // Second call (verification) - all exist
          const mockStats = {
            isDirectory: () => false,
            size: 1024,
            mtime: new Date(),
          };
          const mockDirStats = {
            isDirectory: () => true,
            size: 0,
            mtime: new Date(),
          };

          if (filePath.includes("scripts") && !filePath.includes(".sh")) {
            return Promise.resolve(mockDirStats);
          }
          if (
            filePath.includes(".codeforge") &&
            !filePath.includes("Dockerfile") &&
            !filePath.includes(".gitignore")
          ) {
            return Promise.resolve(mockDirStats);
          }
          return Promise.resolve(mockStats);
        }
      });

      fsMkdirStub.resolves();

      const result = await initService.initializeProjectWithProgress(
        mockWorkspacePath,
        progressCallback,
      );

      assert.strictEqual(result.success, true, "Should succeed");
      assert.ok(
        result.details.message.includes("initialized successfully"),
        "Should indicate success",
      );

      // Verify progress reporting - at least some calls were made
      assert.ok(progressCallback.called, "Should call progress callback");

      // Verify resource manager calls
      assert.ok(
        mockResourceManager.dumpGitignore.called,
        "Should create .gitignore",
      );
      assert.ok(
        mockResourceManager.dumpDockerfile.called,
        "Should create Dockerfile",
      );
      assert.ok(
        mockResourceManager.dumpScripts.called,
        "Should create scripts",
      );
    });

    test("Should handle partial initialization correctly", async () => {
      // Mock some components existing, some missing
      let callCount = 0;
      fsStatStub.callsFake((filePath) => {
        callCount++;

        if (callCount <= 7) {
          // Initial check - some exist, some don't
          if (
            filePath.includes(".codeforge") &&
            !filePath.includes("Dockerfile") &&
            !filePath.includes(".gitignore") &&
            !filePath.includes("scripts")
          ) {
            return Promise.resolve({
              isDirectory: () => true,
              size: 0,
              mtime: new Date(),
            });
          }
          // Scripts directory doesn't exist initially, so all scripts are missing

          const error = new Error("File not found");
          error.code = "ENOENT";
          return Promise.reject(error);
        } else {
          // Verification check - all exist after initialization
          const mockStats = {
            isDirectory: () => false,
            size: 1024,
            mtime: new Date(),
          };
          const mockDirStats = {
            isDirectory: () => true,
            size: 0,
            mtime: new Date(),
          };

          if (filePath.includes("scripts") && !filePath.includes(".sh")) {
            return Promise.resolve(mockDirStats);
          }
          if (
            filePath.includes(".codeforge") &&
            !filePath.includes("Dockerfile") &&
            !filePath.includes(".gitignore") &&
            !filePath.includes("scripts")
          ) {
            return Promise.resolve(mockDirStats);
          }
          return Promise.resolve(mockStats);
        }
      });

      fsMkdirStub.resolves();

      const result = await initService.initializeProjectWithProgress(
        mockWorkspacePath,
        progressCallback,
      );

      assert.strictEqual(result.success, true, "Should succeed");

      // Should still create missing files
      assert.ok(
        mockResourceManager.dumpGitignore.called,
        "Should create missing .gitignore",
      );
      assert.ok(
        mockResourceManager.dumpDockerfile.called,
        "Should create missing Dockerfile",
      );
      assert.ok(
        mockResourceManager.dumpScripts.called,
        "Should create missing scripts",
      );
    });

    test("Should handle initialization failure", async () => {
      // Mock resource manager failure
      mockResourceManager.dumpDockerfile.rejects(
        new Error("Failed to create Dockerfile"),
      );

      // Mock initial state as uninitialized
      fsStatStub.callsFake(() => {
        const error = new Error("File not found");
        error.code = "ENOENT";
        return Promise.reject(error);
      });

      fsMkdirStub.resolves();

      const result = await initService.initializeProjectWithProgress(
        mockWorkspacePath,
        progressCallback,
      );

      assert.strictEqual(result.success, false, "Should not succeed");
      assert.ok(
        result.error.includes("Initialization failed"),
        "Should indicate initialization failure",
      );
    });

    test("Should handle resource manager errors", async () => {
      // Mock uninitialized state
      fsStatStub.callsFake(() => {
        const error = new Error("File not found");
        error.code = "ENOENT";
        return Promise.reject(error);
      });

      fsMkdirStub.resolves();
      mockResourceManager.dumpGitignore.rejects(new Error("Permission denied"));

      const result = await initService.initializeProjectWithProgress(
        mockWorkspacePath,
        progressCallback,
      );

      assert.strictEqual(result.success, false, "Should not succeed");
      assert.ok(
        result.error.includes("Initialization failed"),
        "Should indicate failure",
      );
      assert.ok(result.details.error, "Should include error details");
    });

    test("Should work without progress callback", async () => {
      // Mock already initialized state
      const mockStats = {
        isDirectory: () => false,
        size: 1024,
        mtime: new Date(),
      };
      const mockDirStats = {
        isDirectory: () => true,
        size: 0,
        mtime: new Date(),
      };

      fsStatStub.callsFake((filePath) => {
        if (filePath.includes("scripts") && !filePath.includes(".sh")) {
          return Promise.resolve(mockDirStats);
        }
        if (
          filePath.includes(".codeforge") &&
          !filePath.includes("Dockerfile") &&
          !filePath.includes(".gitignore")
        ) {
          return Promise.resolve(mockDirStats);
        }
        return Promise.resolve(mockStats);
      });

      const result =
        await initService.initializeProjectWithProgress(mockWorkspacePath);

      assert.strictEqual(
        result.success,
        true,
        "Should succeed without progress callback",
      );
    });
  });

  suite("getInitializationStatusSummary Tests", () => {
    let fsStatStub;

    setup(() => {
      // Only stub if not already stubbed
      if (!fs.stat.isSinonProxy) {
        fsStatStub = sandbox.stub(fs, "stat");
      } else {
        fsStatStub = fs.stat;
        fsStatStub.reset();
      }
    });

    test("Should return initialized status for fully initialized project", async () => {
      // Mock fully initialized state
      const mockStats = {
        isDirectory: () => false,
        size: 1024,
        mtime: new Date(),
      };
      const mockDirStats = {
        isDirectory: () => true,
        size: 0,
        mtime: new Date(),
      };

      fsStatStub.callsFake((filePath) => {
        if (filePath.includes("scripts") && !filePath.includes(".sh")) {
          return Promise.resolve(mockDirStats);
        }
        if (
          filePath.includes(".codeforge") &&
          !filePath.includes("Dockerfile") &&
          !filePath.includes(".gitignore")
        ) {
          return Promise.resolve(mockDirStats);
        }
        return Promise.resolve(mockStats);
      });

      const result =
        await initService.getInitializationStatusSummary(mockWorkspacePath);

      assert.strictEqual(
        result.status,
        "initialized",
        "Should have initialized status",
      );
      assert.ok(
        result.message.includes("fully initialized"),
        "Should indicate fully initialized",
      );
      assert.ok(result.details, "Should include details");
    });

    test("Should return not_initialized status with missing components", async () => {
      // Mock partially initialized state
      fsStatStub.callsFake((filePath) => {
        if (
          filePath.includes("Dockerfile") ||
          filePath.includes("build-fuzz-tests.sh")
        ) {
          const error = new Error("File not found");
          error.code = "ENOENT";
          return Promise.reject(error);
        }

        const mockStats =
          filePath.includes("scripts") && !filePath.includes(".sh")
            ? { isDirectory: () => true, size: 0, mtime: new Date() }
            : { isDirectory: () => false, size: 1024, mtime: new Date() };

        return Promise.resolve(mockStats);
      });

      const result =
        await initService.getInitializationStatusSummary(mockWorkspacePath);

      assert.strictEqual(
        result.status,
        "not_initialized",
        "Should have not_initialized status",
      );
      assert.ok(
        result.message.includes("Missing 2 of 10"),
        "Should indicate missing count",
      );
      assert.ok(
        result.message.includes("dockerfile"),
        "Should list missing components",
      );
      assert.ok(
        result.message.includes("buildScript"),
        "Should list missing components",
      );
    });

    test("Should handle empty workspace path", async () => {
      const result = await initService.getInitializationStatusSummary("");

      assert.strictEqual(
        result.status,
        "not_initialized",
        "Should have not_initialized status",
      );
      assert.ok(
        result.message.includes("Missing"),
        "Should indicate missing components",
      );
    });
  });

  suite("hasCodeForgeProject Tests", () => {
    let fsAccessStub;

    setup(() => {
      // Only stub if not already stubbed
      if (!fs.access.isSinonProxy) {
        fsAccessStub = sandbox.stub(fs, "access");
      } else {
        fsAccessStub = fs.access;
        fsAccessStub.reset();
      }
    });

    test("Should return true when .codeforge directory exists", async () => {
      fsAccessStub.resolves();

      const result = await initService.hasCodeForgeProject(mockWorkspacePath);

      assert.strictEqual(result, true, "Should return true");
      assert.ok(
        fsAccessStub.calledWith(path.join(mockWorkspacePath, ".codeforge")),
        "Should check .codeforge directory",
      );
    });

    test("Should return false when .codeforge directory does not exist", async () => {
      fsAccessStub.rejects(new Error("Directory not found"));

      const result = await initService.hasCodeForgeProject(mockWorkspacePath);

      assert.strictEqual(result, false, "Should return false");
    });

    test("Should return false for null workspace path", async () => {
      const result = await initService.hasCodeForgeProject(null);

      assert.strictEqual(result, false, "Should return false for null path");
      assert.ok(fsAccessStub.notCalled, "Should not call fs.access");
    });

    test("Should return false for undefined workspace path", async () => {
      const result = await initService.hasCodeForgeProject(undefined);

      assert.strictEqual(
        result,
        false,
        "Should return false for undefined path",
      );
      assert.ok(fsAccessStub.notCalled, "Should not call fs.access");
    });

    test("Should handle file system errors gracefully", async () => {
      fsAccessStub.rejects(new Error("Permission denied"));

      const result = await initService.hasCodeForgeProject(mockWorkspacePath);

      assert.strictEqual(result, false, "Should return false on error");
    });
  });

  suite("Edge Cases and Error Handling", () => {
    test("Should handle concurrent initialization checks", async () => {
      let fsStatStub;
      if (!fs.stat.isSinonProxy) {
        fsStatStub = sandbox.stub(fs, "stat");
      } else {
        fsStatStub = fs.stat;
        fsStatStub.reset();
      }
      fsStatStub.resolves({
        isDirectory: () => false,
        size: 1024,
        mtime: new Date(),
      });

      // Run multiple concurrent checks
      const promises = [
        initService.isCodeForgeInitialized(mockWorkspacePath),
        initService.isCodeForgeInitialized(mockWorkspacePath),
        initService.isCodeForgeInitialized(mockWorkspacePath),
      ];

      const results = await Promise.all(promises);

      results.forEach((result) => {
        assert.strictEqual(
          result.isInitialized,
          true,
          "All checks should succeed",
        );
      });
    });

    test("Should handle very long workspace paths", async () => {
      const longPath =
        "/very/long/path/that/exceeds/normal/limits/" + "a".repeat(200);
      let fsStatStub;
      if (!fs.stat.isSinonProxy) {
        fsStatStub = sandbox.stub(fs, "stat");
      } else {
        fsStatStub = fs.stat;
        fsStatStub.reset();
      }
      fsStatStub.rejects(new Error("Path too long"));

      const result = await initService.isCodeForgeInitialized(longPath);

      assert.strictEqual(
        result.isInitialized,
        false,
        "Should handle long paths",
      );
      assert.strictEqual(
        result.missingComponents.length,
        10,
        "Should have all components missing",
      );
    });

    test("Should handle special characters in workspace path", async () => {
      // Use path.join for cross-platform compatibility and avoid Windows-invalid characters
      const specialPath = path.join(
        process.platform === "win32" ? "C:" : "",
        "test",
        "workspace with spaces",
        "and-special_chars",
      );
      let fsStatStub;
      if (!fs.stat.isSinonProxy) {
        fsStatStub = sandbox.stub(fs, "stat");
      } else {
        fsStatStub = fs.stat;
        fsStatStub.reset();
      }
      fsStatStub.resolves({
        isDirectory: () => false,
        size: 1024,
        mtime: new Date(),
      });

      const result = await initService.isCodeForgeInitialized(specialPath);

      assert.ok(result, "Should handle special characters in path");
      // Verify paths are constructed correctly
      Object.values(result.details).forEach((detail) => {
        assert.ok(
          detail.path.includes(specialPath),
          "Should include special path",
        );
      });
    });
  });
});
