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

  suite("dumpDockerfile() Method", () => {
    let targetDir;

    setup(async () => {
      targetDir = path.join(tempDir, "dockerfile-target");
      await fs.mkdir(targetDir, { recursive: true });
    });

    test("Should dump Dockerfile template", async () => {
      const dumpedPath = await resourceManager.dumpDockerfile(targetDir);

      assert.strictEqual(dumpedPath, path.join(targetDir, "Dockerfile"));

      const content = await fs.readFile(dumpedPath, "utf8");
      assert.strictEqual(content, "FROM ubuntu:24.04\nRUN apt-get update\n");
    });

    test("Should create target directory if needed", async () => {
      const newTargetDir = path.join(tempDir, "new-dockerfile-target");

      const dumpedPath = await resourceManager.dumpDockerfile(newTargetDir);

      assert.strictEqual(dumpedPath, path.join(newTargetDir, "Dockerfile"));

      const content = await fs.readFile(dumpedPath, "utf8");
      assert.strictEqual(content, "FROM ubuntu:24.04\nRUN apt-get update\n");
    });

    test("Should throw error if Dockerfile template is missing", async () => {
      // Remove the Dockerfile template
      await fs.unlink(
        path.join(mockExtensionPath, "resources", "templates", "Dockerfile"),
      );

      await assert.rejects(
        async () => {
          await resourceManager.dumpDockerfile(targetDir);
        },
        {
          name: "Error",
          message: /Failed to dump Dockerfile/,
        },
      );
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
  });
});
