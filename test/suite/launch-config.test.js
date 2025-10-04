/**
 * Launch Configuration Manager Test Suite
 *
 * Tests for managing VS Code launch.json configurations for GDB debugging
 */

const assert = require("assert");
const sinon = require("sinon");
const path = require("path");
const { LaunchConfigManager } = require("../../src/utils/launchConfig");

// Import test helpers
const {
  createMockExtensionContext,
  setupTestEnvironment,
  cleanupTestEnvironment,
} = require("../utils/activity-bar-test-helpers");

suite("Launch Configuration Manager Test Suite", () => {
  let sandbox;
  let testEnvironment;
  let launchConfigManager;
  let mockFs;

  setup(() => {
    sandbox = sinon.createSandbox();
    testEnvironment = setupTestEnvironment(sandbox);

    // Mock fs.promises module
    mockFs = {
      access: sandbox.stub(),
      mkdir: sandbox.stub().resolves(),
      readFile: sandbox.stub(),
      writeFile: sandbox.stub().resolves(),
      stat: sandbox.stub(),
    };

    // Create LaunchConfigManager with mocked fs
    launchConfigManager = new LaunchConfigManager(mockFs);
  });

  teardown(() => {
    cleanupTestEnvironment(sandbox);
  });

  suite("createOrUpdateGdbAttachConfig", () => {
    const workspacePath = "/workspace";
    const configName = "Test GDB Config";
    const port = 2000;
    const fuzzerExecutable = "/workspace/.codeforge/fuzzing/test-fuzzer";

    setup(() => {
      // Reset all stubs before each test
      mockFs.access.reset();
      mockFs.mkdir.reset();
      mockFs.readFile.reset();
      mockFs.writeFile.reset();
    });

    test("Should create new launch.json when it doesn't exist", async () => {
      // Mock .vscode directory doesn't exist
      mockFs.access.rejects(new Error("ENOENT"));
      mockFs.readFile.rejects(new Error("ENOENT"));
      mockFs.mkdir.resolves();
      mockFs.writeFile.resolves();

      const result = await launchConfigManager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        fuzzerExecutable,
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.action, "created");
      assert.strictEqual(result.configName, configName);
      assert.strictEqual(result.launchJsonExists, false);

      // Verify .vscode directory was created
      assert.strictEqual(mockFs.mkdir.calledOnce, true);
      const mkdirCall = mockFs.mkdir.firstCall;
      assert.strictEqual(
        mkdirCall.args[0],
        path.join(workspacePath, ".vscode"),
      );

      // Verify launch.json was written
      assert.strictEqual(mockFs.writeFile.calledOnce, true);
      const writeCall = mockFs.writeFile.firstCall;
      assert.strictEqual(
        writeCall.args[0],
        path.join(workspacePath, ".vscode", "launch.json"),
      );

      // Parse and verify the written content
      const writtenContent = JSON.parse(writeCall.args[1]);
      assert.strictEqual(writtenContent.version, "0.2.0");
      assert.strictEqual(writtenContent.configurations.length, 1);

      const config = writtenContent.configurations[0];
      assert.strictEqual(config.name, configName);
      assert.strictEqual(config.type, "gdb");
      assert.strictEqual(config.request, "attach");
      assert.strictEqual(config.target, `localhost:${port}`);
      assert.strictEqual(config.remote, true);
      assert.strictEqual(config.executable, fuzzerExecutable);
    });

    test("Should add configuration to existing launch.json", async () => {
      // Mock existing launch.json
      const existingConfig = {
        version: "0.2.0",
        configurations: [
          {
            name: "Existing Config",
            type: "node",
            request: "launch",
          },
        ],
      };

      mockFs.access.resolves(); // .vscode exists
      mockFs.readFile.resolves(JSON.stringify(existingConfig));
      mockFs.writeFile.resolves();

      const result = await launchConfigManager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        fuzzerExecutable,
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.action, "created");
      assert.strictEqual(result.launchJsonExists, true);

      // Verify the existing config was preserved
      const writeCall = mockFs.writeFile.firstCall;
      const writtenContent = JSON.parse(writeCall.args[1]);
      assert.strictEqual(writtenContent.configurations.length, 2);
      assert.strictEqual(
        writtenContent.configurations[0].name,
        "Existing Config",
      );
      assert.strictEqual(writtenContent.configurations[1].name, configName);
    });

    test("Should update existing configuration with same name", async () => {
      // Mock existing launch.json with same config name
      const existingConfig = {
        version: "0.2.0",
        configurations: [
          {
            name: configName,
            type: "gdb",
            request: "attach",
            target: "localhost:1999", // Old port
            executable: "/old/path",
          },
        ],
      };

      mockFs.access.resolves();
      mockFs.readFile.resolves(JSON.stringify(existingConfig));
      mockFs.writeFile.resolves();

      const result = await launchConfigManager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        fuzzerExecutable,
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.action, "updated");

      // Verify the config was updated, not duplicated
      const writeCall = mockFs.writeFile.firstCall;
      const writtenContent = JSON.parse(writeCall.args[1]);
      assert.strictEqual(writtenContent.configurations.length, 1);

      const config = writtenContent.configurations[0];
      assert.strictEqual(config.target, `localhost:${port}`);
      assert.strictEqual(config.executable, fuzzerExecutable);
    });

    test("Should handle launch.json with comments", async () => {
      // Mock launch.json with comments
      const jsonWithComments = `{
        // This is a comment
        "version": "0.2.0",
        /* Multi-line
           comment */
        "configurations": [
          {
            "name": "Existing",
            "type": "node" // inline comment
          }
        ]
      }`;

      mockFs.access.resolves();
      mockFs.readFile.resolves(jsonWithComments);
      mockFs.writeFile.resolves();

      const result = await launchConfigManager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        fuzzerExecutable,
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.action, "created");

      // Verify it parsed correctly and added the config
      const writeCall = mockFs.writeFile.firstCall;
      const writtenContent = JSON.parse(writeCall.args[1]);
      assert.strictEqual(writtenContent.configurations.length, 2);
    });

    test("Should include optional configuration parameters", async () => {
      mockFs.access.rejects(new Error("ENOENT"));
      mockFs.readFile.rejects(new Error("ENOENT"));
      mockFs.mkdir.resolves();
      mockFs.writeFile.resolves();

      const options = {
        autorun: ["target remote localhost:2000", "continue"],
        valuesFormatting: "prettyPrinters",
        printCalls: true,
      };

      const result = await launchConfigManager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        fuzzerExecutable,
        options,
      );

      assert.strictEqual(result.success, true);

      const writeCall = mockFs.writeFile.firstCall;
      const writtenContent = JSON.parse(writeCall.args[1]);
      const config = writtenContent.configurations[0];

      assert.deepStrictEqual(config.autorun, options.autorun);
      assert.strictEqual(config.valuesFormatting, options.valuesFormatting);
      assert.strictEqual(config.printCalls, options.printCalls);
    });

    test("Should handle file system errors gracefully", async () => {
      mockFs.access.rejects(new Error("ENOENT"));
      mockFs.readFile.rejects(new Error("ENOENT"));
      mockFs.mkdir.resolves();
      mockFs.writeFile.rejects(new Error("Permission denied"));

      const result = await launchConfigManager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        fuzzerExecutable,
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Permission denied");
      assert.strictEqual(result.configName, configName);
    });
  });

  suite("getGdbConfigurations", () => {
    const workspacePath = "/workspace";

    setup(() => {
      // Reset all stubs before each test
      mockFs.readFile.reset();
    });

    test("Should return all GDB attach configurations", async () => {
      const launchConfig = {
        version: "0.2.0",
        configurations: [
          {
            name: "GDB Config 1",
            type: "gdb",
            request: "attach",
            target: "localhost:2000",
          },
          {
            name: "Node Config",
            type: "node",
            request: "launch",
          },
          {
            name: "GDB Config 2",
            type: "gdb",
            request: "attach",
            target: "localhost:2001",
          },
          {
            name: "GDB Launch",
            type: "gdb",
            request: "launch", // Not attach
          },
        ],
      };

      mockFs.readFile.resolves(JSON.stringify(launchConfig));

      const configs =
        await launchConfigManager.getGdbConfigurations(workspacePath);

      assert.strictEqual(configs.length, 2);
      assert.strictEqual(configs[0].name, "GDB Config 1");
      assert.strictEqual(configs[1].name, "GDB Config 2");
    });

    test("Should return empty array when launch.json doesn't exist", async () => {
      mockFs.readFile.rejects(new Error("ENOENT"));

      const configs =
        await launchConfigManager.getGdbConfigurations(workspacePath);

      assert.deepStrictEqual(configs, []);
    });

    test("Should return empty array when configurations array is missing", async () => {
      const launchConfig = {
        version: "0.2.0",
      };

      mockFs.readFile.resolves(JSON.stringify(launchConfig));

      const configs =
        await launchConfigManager.getGdbConfigurations(workspacePath);

      assert.deepStrictEqual(configs, []);
    });
  });

  suite("removeGdbConfig", () => {
    const workspacePath = "/workspace";
    const configName = "Test GDB Config";

    setup(() => {
      // Reset all stubs before each test
      mockFs.readFile.reset();
      mockFs.writeFile.reset();
    });

    test("Should remove configuration by name", async () => {
      const launchConfig = {
        version: "0.2.0",
        configurations: [
          {
            name: configName,
            type: "gdb",
            request: "attach",
          },
          {
            name: "Other Config",
            type: "node",
            request: "launch",
          },
        ],
      };

      mockFs.readFile.resolves(JSON.stringify(launchConfig));
      mockFs.writeFile.resolves();

      const result = await launchConfigManager.removeGdbConfig(
        workspacePath,
        configName,
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.configName, configName);
      assert.strictEqual(result.removed, true);

      // Verify the config was removed
      const writeCall = mockFs.writeFile.firstCall;
      const writtenContent = JSON.parse(writeCall.args[1]);
      assert.strictEqual(writtenContent.configurations.length, 1);
      assert.strictEqual(writtenContent.configurations[0].name, "Other Config");
    });

    test("Should return error when configuration not found", async () => {
      const launchConfig = {
        version: "0.2.0",
        configurations: [
          {
            name: "Other Config",
            type: "node",
            request: "launch",
          },
        ],
      };

      mockFs.readFile.resolves(JSON.stringify(launchConfig));

      const result = await launchConfigManager.removeGdbConfig(
        workspacePath,
        "NonExistent",
      );

      assert.strictEqual(result.success, false);
      assert(result.error.includes("not found"));
    });

    test("Should return error when configurations array is missing", async () => {
      const launchConfig = {
        version: "0.2.0",
      };

      mockFs.readFile.resolves(JSON.stringify(launchConfig));

      const result = await launchConfigManager.removeGdbConfig(
        workspacePath,
        configName,
      );

      assert.strictEqual(result.success, false);
      assert(result.error.includes("No configurations found"));
    });
  });

  suite("configExists", () => {
    const workspacePath = "/workspace";
    const configName = "Test GDB Config";

    setup(() => {
      // Reset all stubs before each test
      mockFs.readFile.reset();
    });

    test("Should return true when configuration exists", async () => {
      const launchConfig = {
        version: "0.2.0",
        configurations: [
          {
            name: configName,
            type: "gdb",
            request: "attach",
          },
        ],
      };

      mockFs.readFile.resolves(JSON.stringify(launchConfig));

      const exists = await launchConfigManager.configExists(
        workspacePath,
        configName,
      );

      assert.strictEqual(exists, true);
    });

    test("Should return false when configuration doesn't exist", async () => {
      const launchConfig = {
        version: "0.2.0",
        configurations: [],
      };

      mockFs.readFile.resolves(JSON.stringify(launchConfig));

      const exists = await launchConfigManager.configExists(
        workspacePath,
        "NonExistent",
      );

      assert.strictEqual(exists, false);
    });

    test("Should return false when launch.json doesn't exist", async () => {
      mockFs.readFile.rejects(new Error("ENOENT"));

      const exists = await launchConfigManager.configExists(
        workspacePath,
        configName,
      );

      assert.strictEqual(exists, false);
    });
  });

  suite("stripJsonComments", () => {
    test("Should remove single-line comments", () => {
      const jsonWithComments = `{
        // This is a comment
        "key": "value" // inline comment
      }`;

      const stripped = launchConfigManager.stripJsonComments(jsonWithComments);
      const parsed = JSON.parse(stripped);

      assert.strictEqual(parsed.key, "value");
    });

    test("Should remove multi-line comments", () => {
      const jsonWithComments = `{
        /* This is a
           multi-line comment */
        "key": "value"
      }`;

      const stripped = launchConfigManager.stripJsonComments(jsonWithComments);
      const parsed = JSON.parse(stripped);

      assert.strictEqual(parsed.key, "value");
    });

    test("Should handle mixed comment types", () => {
      const jsonWithComments = `{
        // Single line comment
        "key1": "value1", /* inline multi-line */
        /* Multi-line
           comment */
        "key2": "value2" // another single-line
      }`;

      const stripped = launchConfigManager.stripJsonComments(jsonWithComments);
      const parsed = JSON.parse(stripped);

      assert.strictEqual(parsed.key1, "value1");
      assert.strictEqual(parsed.key2, "value2");
    });

    test("Should not affect valid JSON without comments", () => {
      const validJson = `{
        "key": "value",
        "nested": {
          "array": [1, 2, 3]
        }
      }`;

      const stripped = launchConfigManager.stripJsonComments(validJson);
      const parsed = JSON.parse(stripped);

      assert.strictEqual(parsed.key, "value");
      assert.deepStrictEqual(parsed.nested.array, [1, 2, 3]);
    });
  });
});
