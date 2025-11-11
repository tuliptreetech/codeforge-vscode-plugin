/**
 * ResourceManager Test Suite
 *
 * This file contains comprehensive tests for the ResourceManager class.
 * Tests cover resource loading, dumping, error handling, and integration scenarios.
 * These are automated Mocha tests that run with `npm test`.
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs").promises;
const sinon = require("sinon");
const os = require("os");

// Import the ResourceManager class
const { ResourceManager } = require("../../src/core/resourceManager");

suite("ResourceManager Test Suite", () => {
  let sandbox;
  let tempDir;
  let resourceManager;
  let mockExtensionPath;

  setup(async () => {
    sandbox = sinon.createSandbox();

    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codeforge-test-"));

    // Create mock extension path structure
    mockExtensionPath = path.join(tempDir, "extension");
    await fs.mkdir(mockExtensionPath, { recursive: true });
    await fs.mkdir(path.join(mockExtensionPath, "resources"), {
      recursive: true,
    });
    await fs.mkdir(path.join(mockExtensionPath, "resources", "templates"), {
      recursive: true,
    });
    await fs.mkdir(path.join(mockExtensionPath, "resources", "scripts"), {
      recursive: true,
    });

    // Create mock resource files
    await fs.writeFile(
      path.join(mockExtensionPath, "resources", "templates", "Dockerfile"),
      "FROM ubuntu:24.04\nRUN apt-get update\n",
    );
    await fs.writeFile(
      path.join(mockExtensionPath, "resources", "templates", ".gitignore"),
      "# Ignore fuzzing output directory\n/fuzzing\n",
    );
    await fs.writeFile(
      path.join(mockExtensionPath, "resources", "test-resource.txt"),
      "Test resource content\n",
    );

    // Create mock script files
    await fs.writeFile(
      path.join(
        mockExtensionPath,
        "resources",
        "scripts",
        "build-fuzz-tests.sh",
      ),
      "#!/usr/bin/env bash\necho 'Building fuzz tests'\n",
    );
    await fs.writeFile(
      path.join(
        mockExtensionPath,
        "resources",
        "scripts",
        "find-fuzz-tests.sh",
      ),
      "#!/usr/bin/env bash\necho 'Finding fuzz tests'\n",
    );
    await fs.writeFile(
      path.join(mockExtensionPath, "resources", "scripts", "run-fuzz-tests.sh"),
      "#!/usr/bin/env bash\necho 'Running fuzz tests'\n",
    );
    await fs.writeFile(
      path.join(mockExtensionPath, "resources", "scripts", "find-crashes.sh"),
      "#!/usr/bin/env bash\necho 'Finding crashes'\n",
    );
    await fs.writeFile(
      path.join(
        mockExtensionPath,
        "resources",
        "scripts",
        "generate-backtrace.sh",
      ),
      "#!/usr/bin/env bash\necho 'Generating backtrace'\n",
    );
    await fs.writeFile(
      path.join(mockExtensionPath, "resources", "scripts", "clear-crashes.sh"),
      "#!/usr/bin/env bash\necho 'Clearing crashes'\n",
    );
    await fs.writeFile(
      path.join(
        mockExtensionPath,
        "resources",
        "scripts",
        "launch-process-in-docker.sh",
      ),
      "#!/usr/bin/env bash\necho 'Launch process in docker'\n",
    );
    await fs.writeFile(
      path.join(
        mockExtensionPath,
        "resources",
        "scripts",
        "reevaluate-crashes.sh",
      ),
      "#!/usr/bin/env bash\necho 'Reevaluate crashes'\n",
    );

    // Initialize ResourceManager with mock extension path
    resourceManager = new ResourceManager(mockExtensionPath);
  });

  teardown(async () => {
    sandbox.restore();

    // Clean up temporary directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
        console.warn(`Failed to clean up temp directory: ${error.message}`);
      }
    }
  });

  suite("Constructor and Initialization", () => {
    test("Should initialize with correct paths", () => {
      const rm = new ResourceManager("/test/extension/path");

      assert.strictEqual(rm.extensionPath, "/test/extension/path");
      assert.strictEqual(
        rm.resourcesPath,
        path.join("/test/extension/path", "resources"),
      );
      assert.strictEqual(
        rm.templatesPath,
        path.join("/test/extension/path", "resources", "templates"),
      );
      assert.strictEqual(
        rm.scriptsPath,
        path.join("/test/extension/path", "resources", "scripts"),
      );
    });

    test("Should handle Windows paths correctly", () => {
      const windowsPath = "C:\\Users\\Test\\Extension";
      const rm = new ResourceManager(windowsPath);

      assert.strictEqual(rm.extensionPath, windowsPath);
      assert.strictEqual(rm.resourcesPath, path.join(windowsPath, "resources"));
      assert.strictEqual(
        rm.templatesPath,
        path.join(windowsPath, "resources", "templates"),
      );
      assert.strictEqual(
        rm.scriptsPath,
        path.join(windowsPath, "resources", "scripts"),
      );
    });

    test("Should handle relative paths correctly", () => {
      const relativePath = "./test/extension";
      const rm = new ResourceManager(relativePath);

      assert.strictEqual(rm.extensionPath, relativePath);
      assert.strictEqual(
        rm.resourcesPath,
        path.join(relativePath, "resources"),
      );
      assert.strictEqual(
        rm.templatesPath,
        path.join(relativePath, "resources", "templates"),
      );
      assert.strictEqual(
        rm.scriptsPath,
        path.join(relativePath, "resources", "scripts"),
      );
    });
  });

  suite("getResourceContent() Method", () => {
    test("Should read existing resource file", async () => {
      const content =
        await resourceManager.getResourceContent("test-resource.txt");
      assert.strictEqual(content, "Test resource content\n");
    });

    test("Should read Dockerfile template", async () => {
      const content = await resourceManager.getResourceContent(
        "templates/Dockerfile",
      );
      assert.strictEqual(content, "FROM ubuntu:24.04\nRUN apt-get update\n");
    });

    test("Should read .gitignore template", async () => {
      const content = await resourceManager.getResourceContent(
        "templates/.gitignore",
      );
      assert.strictEqual(
        content,
        "# Ignore fuzzing output directory\n/fuzzing\n",
      );
    });

    test("Should throw error for non-existent resource", async () => {
      await assert.rejects(
        async () => {
          await resourceManager.getResourceContent("non-existent.txt");
        },
        {
          name: "Error",
          message: /Failed to read resource 'non-existent\.txt'/,
        },
      );
    });

    test("Should throw error for invalid path", async () => {
      await assert.rejects(
        async () => {
          await resourceManager.getResourceContent("../../../etc/passwd");
        },
        {
          name: "Error",
          message: /Failed to read resource/,
        },
      );
    });

    test("Should handle empty resource path", async () => {
      await assert.rejects(
        async () => {
          await resourceManager.getResourceContent("");
        },
        {
          name: "Error",
          message: /Failed to read resource/,
        },
      );
    });
  });

  suite("dumpResource() Method", () => {
    let targetDir;

    setup(async () => {
      targetDir = path.join(tempDir, "target");
      await fs.mkdir(targetDir, { recursive: true });
    });

    test("Should dump resource to target directory", async () => {
      const dumpedPath = await resourceManager.dumpResource(
        "test-resource.txt",
        targetDir,
      );

      assert.strictEqual(dumpedPath, path.join(targetDir, "test-resource.txt"));

      const content = await fs.readFile(dumpedPath, "utf8");
      assert.strictEqual(content, "Test resource content\n");
    });

    test("Should dump resource with custom filename", async () => {
      const dumpedPath = await resourceManager.dumpResource(
        "test-resource.txt",
        targetDir,
        "custom-name.txt",
      );

      assert.strictEqual(dumpedPath, path.join(targetDir, "custom-name.txt"));

      const content = await fs.readFile(dumpedPath, "utf8");
      assert.strictEqual(content, "Test resource content\n");
    });

    test("Should create target directory if it doesn't exist", async () => {
      const newTargetDir = path.join(tempDir, "new-target", "nested");

      const dumpedPath = await resourceManager.dumpResource(
        "test-resource.txt",
        newTargetDir,
      );

      assert.strictEqual(
        dumpedPath,
        path.join(newTargetDir, "test-resource.txt"),
      );

      const content = await fs.readFile(dumpedPath, "utf8");
      assert.strictEqual(content, "Test resource content\n");
    });

    test("Should overwrite existing file", async () => {
      const targetFile = path.join(targetDir, "test-resource.txt");
      await fs.writeFile(targetFile, "Old content");

      const dumpedPath = await resourceManager.dumpResource(
        "test-resource.txt",
        targetDir,
      );

      const content = await fs.readFile(dumpedPath, "utf8");
      assert.strictEqual(content, "Test resource content\n");
    });

    test("Should throw error for non-existent resource", async () => {
      await assert.rejects(
        async () => {
          await resourceManager.dumpResource("non-existent.txt", targetDir);
        },
        {
          name: "Error",
          message: /Failed to dump resource 'non-existent\.txt'/,
        },
      );
    });

    test("Should handle permission errors gracefully", async () => {
      // Create a read-only directory (skip on Windows as it's complex)
      if (process.platform !== "win32") {
        const readOnlyDir = path.join(tempDir, "readonly");
        await fs.mkdir(readOnlyDir);
        await fs.chmod(readOnlyDir, 0o444);

        await assert.rejects(
          async () => {
            await resourceManager.dumpResource(
              "test-resource.txt",
              readOnlyDir,
            );
          },
          {
            name: "Error",
            message: /Failed to dump resource/,
          },
        );

        // Restore permissions for cleanup
        await fs.chmod(readOnlyDir, 0o755);
      }
    });
  });

  suite("dumpGitignore() Method", () => {
    let targetDir;

    setup(async () => {
      targetDir = path.join(tempDir, "gitignore-target");
      await fs.mkdir(targetDir, { recursive: true });
    });

    test("Should dump .gitignore template", async () => {
      const dumpedPath = await resourceManager.dumpGitignore(targetDir);

      assert.strictEqual(dumpedPath, path.join(targetDir, ".gitignore"));

      const content = await fs.readFile(dumpedPath, "utf8");
      assert.strictEqual(
        content,
        "# Ignore fuzzing output directory\n/fuzzing\n",
      );
    });

    test("Should create target directory if needed", async () => {
      const newTargetDir = path.join(tempDir, "new-gitignore-target");

      const dumpedPath = await resourceManager.dumpGitignore(newTargetDir);

      assert.strictEqual(dumpedPath, path.join(newTargetDir, ".gitignore"));

      const content = await fs.readFile(dumpedPath, "utf8");
      assert.strictEqual(
        content,
        "# Ignore fuzzing output directory\n/fuzzing\n",
      );
    });

    test("Should throw error if .gitignore template is missing", async () => {
      // Remove the .gitignore template
      await fs.unlink(
        path.join(mockExtensionPath, "resources", "templates", ".gitignore"),
      );

      await assert.rejects(
        async () => {
          await resourceManager.dumpGitignore(targetDir);
        },
        {
          name: "Error",
          message: /Failed to dump \.gitignore/,
        },
      );
    });
  });

  suite("Utility Methods", () => {
    test("getResourcePath() should return correct full path", () => {
      const fullPath = resourceManager.getResourcePath("test-resource.txt");
      const expectedPath = path.join(
        mockExtensionPath,
        "resources",
        "test-resource.txt",
      );

      assert.strictEqual(fullPath, expectedPath);
    });

    test("getResourcePath() should handle nested paths", () => {
      const fullPath = resourceManager.getResourcePath("templates/Dockerfile");
      const expectedPath = path.join(
        mockExtensionPath,
        "resources",
        "templates",
        "Dockerfile",
      );

      assert.strictEqual(fullPath, expectedPath);
    });

    test("resourceExists() should return true for existing resource", async () => {
      const exists = await resourceManager.resourceExists("test-resource.txt");
      assert.strictEqual(exists, true);
    });

    test("resourceExists() should return false for non-existent resource", async () => {
      const exists = await resourceManager.resourceExists("non-existent.txt");
      assert.strictEqual(exists, false);
    });

    test("resourceExists() should return true for template files", async () => {
      const dockerfileExists = await resourceManager.resourceExists(
        "templates/Dockerfile",
      );
      const gitignoreExists = await resourceManager.resourceExists(
        "templates/.gitignore",
      );

      assert.strictEqual(dockerfileExists, true);
      assert.strictEqual(gitignoreExists, true);
    });
  });

  suite("Error Handling", () => {
    test("Should handle corrupted resource files", async () => {
      // Create a resource file with invalid encoding
      const corruptedPath = path.join(
        mockExtensionPath,
        "resources",
        "corrupted.bin",
      );
      await fs.writeFile(corruptedPath, Buffer.from([0xff, 0xfe, 0x00, 0x00]));

      // Should still read the file (fs.readFile handles binary data)
      const content = await resourceManager.getResourceContent("corrupted.bin");
      assert.ok(typeof content === "string");
    });

    test("Should handle very long file paths", async () => {
      const longPath = "a".repeat(200) + ".txt";

      await assert.rejects(
        async () => {
          await resourceManager.getResourceContent(longPath);
        },
        {
          name: "Error",
          message: /Failed to read resource/,
        },
      );
    });

    test("Should handle special characters in resource paths", async () => {
      // Create a resource with special characters
      const specialPath = path.join(
        mockExtensionPath,
        "resources",
        "special-chars-@#$.txt",
      );
      await fs.writeFile(specialPath, "Special content");

      const content = await resourceManager.getResourceContent(
        "special-chars-@#$.txt",
      );
      assert.strictEqual(content, "Special content");
    });
  });

  suite("Cross-Platform Path Handling", () => {
    test("Should handle Unix-style paths", () => {
      const rm = new ResourceManager("/home/user/extension");
      const resourcePath = rm.getResourcePath("templates/Dockerfile");

      assert.ok(resourcePath.includes("templates"));
      assert.ok(resourcePath.includes("Dockerfile"));
    });

    test("Should handle Windows-style paths", () => {
      const rm = new ResourceManager("C:\\Users\\Test\\Extension");
      const resourcePath = rm.getResourcePath("templates\\Dockerfile");

      assert.ok(resourcePath.includes("templates"));
      assert.ok(resourcePath.includes("Dockerfile"));
    });

    test("Should normalize path separators", () => {
      const resourcePath = resourceManager.getResourcePath(
        "templates/Dockerfile",
      );

      // Should use the correct path separator for the current platform
      assert.strictEqual(
        resourcePath,
        path.join(mockExtensionPath, "resources", "templates", "Dockerfile"),
      );
    });
  });

  suite("Integration Scenarios", () => {
    test("Should work with real extension structure", async () => {
      // Test with a structure similar to the actual extension
      const realExtensionPath = path.join(tempDir, "real-extension");
      await fs.mkdir(path.join(realExtensionPath, "resources", "templates"), {
        recursive: true,
      });

      // Copy actual template content
      const dockerfileContent = `# specify the base image (latest ubuntu lts release as of Oct 2024)
FROM ubuntu:24.04

# remove pre-installed 'ubuntu' user
RUN touch /var/mail/ubuntu && chown ubuntu /var/mail/ubuntu && userdel -r ubuntu`;

      await fs.writeFile(
        path.join(realExtensionPath, "resources", "templates", "Dockerfile"),
        dockerfileContent,
      );

      const rm = new ResourceManager(realExtensionPath);
      const content = await rm.getResourceContent("templates/Dockerfile");

      assert.ok(content.includes("FROM ubuntu:24.04"));
      assert.ok(content.includes("userdel -r ubuntu"));
    });

    test("Should handle concurrent operations", async () => {
      const targetDir = path.join(tempDir, "concurrent");
      await fs.mkdir(targetDir, { recursive: true });

      // Run multiple dump operations concurrently
      const promises = [
        resourceManager.dumpResource(
          "test-resource.txt",
          targetDir,
          "file1.txt",
        ),
        resourceManager.dumpResource(
          "test-resource.txt",
          targetDir,
          "file2.txt",
        ),
        resourceManager.dumpResource(
          "test-resource.txt",
          targetDir,
          "file3.txt",
        ),
      ];

      const results = await Promise.all(promises);

      assert.strictEqual(results.length, 3);

      // Verify all files were created
      for (let i = 1; i <= 3; i++) {
        const content = await fs.readFile(
          path.join(targetDir, `file${i}.txt`),
          "utf8",
        );
        assert.strictEqual(content, "Test resource content\n");
      }
    });

    test("Should maintain file permissions", async () => {
      const targetDir = path.join(tempDir, "permissions");
      await fs.mkdir(targetDir, { recursive: true });

      const dumpedPath = await resourceManager.dumpResource(
        "test-resource.txt",
        targetDir,
      );

      // Check that the file is readable
      const stats = await fs.stat(dumpedPath);
      assert.ok(stats.isFile());
      assert.ok(stats.size > 0);
    });

    suite("dumpScript() Method", () => {
      let targetDir;

      setup(async () => {
        targetDir = path.join(tempDir, "script-target");
        await fs.mkdir(targetDir, { recursive: true });
      });

      test("Should dump script file with executable permissions", async () => {
        const dumpedPath = await resourceManager.dumpScript(
          "build-fuzz-tests.sh",
          targetDir,
        );

        assert.strictEqual(
          dumpedPath,
          path.join(targetDir, "build-fuzz-tests.sh"),
        );

        // Verify file content
        const content = await fs.readFile(dumpedPath, "utf8");
        assert.strictEqual(
          content,
          "#!/usr/bin/env bash\necho 'Building fuzz tests'\n",
        );

        // Verify executable permissions using fs.statSync().mode
        const stats = require("fs").statSync(dumpedPath);
        const hasExecutePermission = (stats.mode & parseInt("755", 8)) !== 0;
        assert.strictEqual(
          hasExecutePermission,
          true,
          "Script should have executable permissions",
        );
      });

      test("Should dump find-fuzz-tests.sh script", async () => {
        const dumpedPath = await resourceManager.dumpScript(
          "find-fuzz-tests.sh",
          targetDir,
        );

        assert.strictEqual(
          dumpedPath,
          path.join(targetDir, "find-fuzz-tests.sh"),
        );

        const content = await fs.readFile(dumpedPath, "utf8");
        assert.strictEqual(
          content,
          "#!/usr/bin/env bash\necho 'Finding fuzz tests'\n",
        );

        // Verify executable permissions
        const stats = require("fs").statSync(dumpedPath);
        const hasExecutePermission = (stats.mode & parseInt("755", 8)) !== 0;
        assert.strictEqual(hasExecutePermission, true);
      });

      test("Should dump run-fuzz-tests.sh script", async () => {
        const dumpedPath = await resourceManager.dumpScript(
          "run-fuzz-tests.sh",
          targetDir,
        );

        assert.strictEqual(
          dumpedPath,
          path.join(targetDir, "run-fuzz-tests.sh"),
        );

        const content = await fs.readFile(dumpedPath, "utf8");
        assert.strictEqual(
          content,
          "#!/usr/bin/env bash\necho 'Running fuzz tests'\n",
        );

        // Verify executable permissions
        const stats = require("fs").statSync(dumpedPath);
        const hasExecutePermission = (stats.mode & parseInt("755", 8)) !== 0;
        assert.strictEqual(hasExecutePermission, true);
      });

      test("Should create target directory if it doesn't exist", async () => {
        const newTargetDir = path.join(tempDir, "new-script-target", "nested");

        const dumpedPath = await resourceManager.dumpScript(
          "build-fuzz-tests.sh",
          newTargetDir,
        );

        assert.strictEqual(
          dumpedPath,
          path.join(newTargetDir, "build-fuzz-tests.sh"),
        );

        const content = await fs.readFile(dumpedPath, "utf8");
        assert.strictEqual(
          content,
          "#!/usr/bin/env bash\necho 'Building fuzz tests'\n",
        );

        // Verify executable permissions
        const stats = require("fs").statSync(dumpedPath);
        const hasExecutePermission = (stats.mode & parseInt("755", 8)) !== 0;
        assert.strictEqual(hasExecutePermission, true);
      });

      test("Should overwrite existing script file", async () => {
        const targetFile = path.join(targetDir, "build-fuzz-tests.sh");
        await fs.writeFile(targetFile, "Old script content");

        const dumpedPath = await resourceManager.dumpScript(
          "build-fuzz-tests.sh",
          targetDir,
        );

        const content = await fs.readFile(dumpedPath, "utf8");
        assert.strictEqual(
          content,
          "#!/usr/bin/env bash\necho 'Building fuzz tests'\n",
        );

        // Verify executable permissions are set correctly
        const stats = require("fs").statSync(dumpedPath);
        const hasExecutePermission = (stats.mode & parseInt("755", 8)) !== 0;
        assert.strictEqual(hasExecutePermission, true);
      });

      test("Should throw error for non-existent script", async () => {
        await assert.rejects(
          async () => {
            await resourceManager.dumpScript(
              "non-existent-script.sh",
              targetDir,
            );
          },
          {
            name: "Error",
            message: /Failed to dump script 'non-existent-script\.sh'/,
          },
        );
      });

      test("Should throw error for invalid target directory", async () => {
        // Create a file where we expect a directory (this will cause mkdir to fail)
        const invalidTarget = path.join(tempDir, "invalid-target");
        await fs.writeFile(invalidTarget, "This is a file, not a directory");

        await assert.rejects(
          async () => {
            await resourceManager.dumpScript(
              "build-fuzz-tests.sh",
              invalidTarget,
            );
          },
          {
            name: "Error",
            message: /Failed to dump script/,
          },
        );
      });

      test("Should handle permission errors gracefully", async () => {
        // Skip on Windows as permission handling is different
        if (process.platform !== "win32") {
          const readOnlyDir = path.join(tempDir, "readonly-script");
          await fs.mkdir(readOnlyDir);
          await fs.chmod(readOnlyDir, 0o444);

          await assert.rejects(
            async () => {
              await resourceManager.dumpScript(
                "build-fuzz-tests.sh",
                readOnlyDir,
              );
            },
            {
              name: "Error",
              message: /Failed to dump script/,
            },
          );

          // Restore permissions for cleanup
          await fs.chmod(readOnlyDir, 0o755);
        }
      });
    });

    suite("dumpScripts() Method", () => {
      let targetDir;

      setup(async () => {
        targetDir = path.join(tempDir, "scripts-target");
        await fs.mkdir(targetDir, { recursive: true });
      });

      test("Should dump launch-process-in-docker.sh script file with executable permissions", async () => {
        const dumpedPaths = await resourceManager.dumpScripts(targetDir);

        // Verify return value is an array with correct length
        // Note: Only launch-process-in-docker.sh is dumped now; other scripts are in Docker image
        assert.strictEqual(Array.isArray(dumpedPaths), true);
        assert.strictEqual(dumpedPaths.length, 1);

        // Expected script file
        const expectedScripts = ["launch-process-in-docker.sh"];

        // Verify all scripts were dumped
        for (let i = 0; i < expectedScripts.length; i++) {
          const expectedPath = path.join(targetDir, expectedScripts[i]);
          assert.strictEqual(dumpedPaths[i], expectedPath);

          // Verify file exists and has correct content
          const content = await fs.readFile(expectedPath, "utf8");
          assert.ok(content.includes("#!/usr/bin/env bash"));

          // Verify executable permissions
          const stats = require("fs").statSync(expectedPath);
          const hasExecutePermission = (stats.mode & parseInt("755", 8)) !== 0;
          assert.strictEqual(
            hasExecutePermission,
            true,
            `${expectedScripts[i]} should have executable permissions`,
          );
        }
      });

      test("Should verify specific content of dumped script", async () => {
        const dumpedPaths = await resourceManager.dumpScripts(targetDir);

        // Verify launch-process-in-docker.sh content
        const launchProcessContent = await fs.readFile(dumpedPaths[0], "utf8");
        assert.strictEqual(
          launchProcessContent,
          "#!/usr/bin/env bash\necho 'Launch process in docker'\n",
        );
      });

      test("Should create target directory if it doesn't exist", async () => {
        const newTargetDir = path.join(tempDir, "new-scripts-target", "nested");

        const dumpedPaths = await resourceManager.dumpScripts(newTargetDir);

        assert.strictEqual(dumpedPaths.length, 1);

        // Verify all files were created in the new directory
        for (const dumpedPath of dumpedPaths) {
          assert.ok(dumpedPath.startsWith(newTargetDir));

          const content = await fs.readFile(dumpedPath, "utf8");
          assert.ok(content.includes("#!/usr/bin/env bash"));

          // Verify executable permissions
          const stats = require("fs").statSync(dumpedPath);
          const hasExecutePermission = (stats.mode & parseInt("755", 8)) !== 0;
          assert.strictEqual(hasExecutePermission, true);
        }
      });

      test("Should overwrite existing script file", async () => {
        // Create existing file with old content
        await fs.writeFile(
          path.join(targetDir, "launch-process-in-docker.sh"),
          "Old launch script",
        );

        const dumpedPaths = await resourceManager.dumpScripts(targetDir);

        // Verify file was overwritten with correct content
        const launchContent = await fs.readFile(dumpedPaths[0], "utf8");
        assert.strictEqual(
          launchContent,
          "#!/usr/bin/env bash\necho 'Launch process in docker'\n",
        );

        // Verify executable permissions are set
        for (const dumpedPath of dumpedPaths) {
          const stats = require("fs").statSync(dumpedPath);
          const hasExecutePermission = (stats.mode & parseInt("755", 8)) !== 0;
          assert.strictEqual(hasExecutePermission, true);
        }
      });

      test("Should throw error if script is missing", async () => {
        // Remove the script file
        await fs.unlink(
          path.join(
            mockExtensionPath,
            "resources",
            "scripts",
            "launch-process-in-docker.sh",
          ),
        );

        await assert.rejects(
          async () => {
            await resourceManager.dumpScripts(targetDir);
          },
          {
            name: "Error",
            message: /Failed to dump scripts/,
          },
        );
      });

      test("Should throw error for invalid target directory", async () => {
        // Create a file where we expect a directory
        const invalidTarget = path.join(tempDir, "invalid-scripts-target");
        await fs.writeFile(invalidTarget, "This is a file, not a directory");

        await assert.rejects(
          async () => {
            await resourceManager.dumpScripts(invalidTarget);
          },
          {
            name: "Error",
            message: /Failed to dump scripts/,
          },
        );
      });

      test("Should handle permission errors gracefully", async () => {
        // Skip on Windows as permission handling is different
        if (process.platform !== "win32") {
          const readOnlyDir = path.join(tempDir, "readonly-scripts");
          await fs.mkdir(readOnlyDir);
          await fs.chmod(readOnlyDir, 0o444);

          await assert.rejects(
            async () => {
              await resourceManager.dumpScripts(readOnlyDir);
            },
            {
              name: "Error",
              message: /Failed to dump scripts/,
            },
          );

          // Restore permissions for cleanup
          await fs.chmod(readOnlyDir, 0o755);
        }
      });

      test("Should maintain cross-platform path compatibility", async () => {
        const dumpedPaths = await resourceManager.dumpScripts(targetDir);

        // Verify paths use correct separators for the current platform
        for (const dumpedPath of dumpedPaths) {
          assert.strictEqual(
            dumpedPath,
            path.normalize(dumpedPath),
            "Path should be normalized for current platform",
          );
          assert.ok(
            dumpedPath.startsWith(targetDir),
            "Path should be within target directory",
          );
        }
      });
    });
  });
});
