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

  suite("checkFuzzerExists", () => {
    const workspacePath = "/workspace";
    const fuzzerName = "test_fuzzer";

    test("Should return exists=true when fuzzer is found", async () => {
      // Create mock process with event emitters
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      // Use the existing stub from testEnvironment and configure it
      testEnvironment.dockerMocks.runDockerCommandWithOutput.returns(
        mockProcess,
      );

      // Set up the process event handlers
      mockProcess.stdout.on
        .withArgs("data")
        .callsArgWith(
          1,
          "/workspace/.codeforge/fuzzing/target/debug/test_fuzzer\n",
        );
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0);

      const result = await launchConfigManager.checkFuzzerExists(
        workspacePath,
        fuzzerName,
      );

      assert.strictEqual(result.exists, true);
      assert.strictEqual(
        result.path,
        "/workspace/.codeforge/fuzzing/target/debug/test_fuzzer",
      );
      assert.strictEqual(result.error, undefined);

      // Verify the command was called correctly
      assert.strictEqual(
        testEnvironment.dockerMocks.runDockerCommandWithOutput.calledOnce,
        true,
      );
      const callArgs =
        testEnvironment.dockerMocks.runDockerCommandWithOutput.firstCall.args;
      assert.strictEqual(
        callArgs[2],
        `codeforge get-path-to-fuzzer ${fuzzerName}`,
      );
    });

    test("Should return exists=false when fuzzer is not found", async () => {
      // Create mock process with event emitters
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      // Use the existing stub from testEnvironment and configure it
      testEnvironment.dockerMocks.runDockerCommandWithOutput.returns(
        mockProcess,
      );

      // Set up the process event handlers for failure case
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, "");
      mockProcess.stderr.on
        .withArgs("data")
        .callsArgWith(1, "Error: Fuzzer 'test_fuzzer' not found\n");
      mockProcess.on.withArgs("close").callsArgWith(1, 1);

      const result = await launchConfigManager.checkFuzzerExists(
        workspacePath,
        fuzzerName,
      );

      assert.strictEqual(result.exists, false);
      assert.strictEqual(result.path, undefined);
      assert.strictEqual(result.error, "Error: Fuzzer 'test_fuzzer' not found");
    });

    test("Should return exists=false when command throws error", async () => {
      // Create mock process with event emitters
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      // Use the existing stub from testEnvironment and configure it
      testEnvironment.dockerMocks.runDockerCommandWithOutput.returns(
        mockProcess,
      );

      // Set up the process event handlers to trigger error event
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, "");
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on
        .withArgs("error")
        .callsArgWith(1, new Error("Docker command failed"));

      const result = await launchConfigManager.checkFuzzerExists(
        workspacePath,
        fuzzerName,
      );

      assert.strictEqual(result.exists, false);
      assert.strictEqual(result.path, undefined);
      assert.strictEqual(result.error, "Docker command failed");
    });

    test("Should return exists=false when stdout is empty", async () => {
      // Create mock process with event emitters
      const mockProcess = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        on: sandbox.stub(),
      };

      // Use the existing stub from testEnvironment and configure it
      testEnvironment.dockerMocks.runDockerCommandWithOutput.returns(
        mockProcess,
      );

      // Set up the process event handlers with empty stdout
      mockProcess.stdout.on.withArgs("data").callsArgWith(1, "");
      mockProcess.stderr.on.withArgs("data").callsArgWith(1, "");
      mockProcess.on.withArgs("close").callsArgWith(1, 0);

      const result = await launchConfigManager.checkFuzzerExists(
        workspacePath,
        fuzzerName,
      );

      assert.strictEqual(result.exists, false);
      assert.strictEqual(result.error, "Fuzzer not found");
    });
  });

  suite("getFuzzerPath", () => {
    const workspacePath = "/workspace";
    const fuzzerName = "test_fuzzer";

    test("Should return path when fuzzer exists", async () => {
      // Mock checkFuzzerExists
      const checkStub = sandbox
        .stub(launchConfigManager, "checkFuzzerExists")
        .resolves({
          exists: true,
          path: "/workspace/.codeforge/fuzzing/target/debug/test_fuzzer",
        });

      const result = await launchConfigManager.getFuzzerPath(
        workspacePath,
        fuzzerName,
      );

      assert.strictEqual(
        result,
        "/workspace/.codeforge/fuzzing/target/debug/test_fuzzer",
      );
      assert.strictEqual(checkStub.calledOnce, true);
    });

    test("Should return null when fuzzer does not exist", async () => {
      // Mock checkFuzzerExists
      const checkStub = sandbox
        .stub(launchConfigManager, "checkFuzzerExists")
        .resolves({
          exists: false,
          error: "Fuzzer not found",
        });

      const result = await launchConfigManager.getFuzzerPath(
        workspacePath,
        fuzzerName,
      );

      assert.strictEqual(result, null);
      assert.strictEqual(checkStub.calledOnce, true);
    });
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
      assert.strictEqual(config.target, `:${port}`);
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
      assert.strictEqual(config.target, `:${port}`);
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

  suite("Extension Detection", () => {
    test("Should detect CodeLLDB extension", () => {
      // Create mock vscode with CodeLLDB extension
      const mockVscode = {
        extensions: {
          all: [{ id: "vadimcn.vscode-lldb" }, { id: "some.other.extension" }],
        },
      };

      const manager = new LaunchConfigManager(mockFs, mockVscode);
      const result = manager.detectDebugExtensions();

      assert.strictEqual(result.codeLLDB, true);
      assert.strictEqual(result.nativeDebug, false);
      assert.strictEqual(result.preferredExtension, "codeLLDB");
    });

    test("Should detect NativeDebug extension", () => {
      // Create mock vscode with NativeDebug extension
      const mockVscode = {
        extensions: {
          all: [{ id: "webfreak.debug" }, { id: "some.other.extension" }],
        },
      };

      const manager = new LaunchConfigManager(mockFs, mockVscode);
      const result = manager.detectDebugExtensions();

      assert.strictEqual(result.codeLLDB, false);
      assert.strictEqual(result.nativeDebug, true);
      assert.strictEqual(result.preferredExtension, "nativeDebug");
    });

    test("Should prefer CodeLLDB over NativeDebug when both installed", () => {
      // Create mock vscode with both extensions
      const mockVscode = {
        extensions: {
          all: [
            { id: "vadimcn.vscode-lldb" },
            { id: "webfreak.debug" },
            { id: "some.other.extension" },
          ],
        },
      };

      const manager = new LaunchConfigManager(mockFs, mockVscode);
      const result = manager.detectDebugExtensions();

      assert.strictEqual(result.codeLLDB, true);
      assert.strictEqual(result.nativeDebug, true);
      assert.strictEqual(result.preferredExtension, "codeLLDB");
    });

    test("Should return null when no debug extensions installed", () => {
      // Create mock vscode with no debug extensions
      const mockVscode = {
        extensions: {
          all: [{ id: "some.other.extension" }, { id: "another.extension" }],
        },
      };

      const manager = new LaunchConfigManager(mockFs, mockVscode);
      const result = manager.detectDebugExtensions();

      assert.strictEqual(result.codeLLDB, false);
      assert.strictEqual(result.nativeDebug, false);
      assert.strictEqual(result.preferredExtension, null);
    });
  });

  suite("Configuration Generation", () => {
    const configName = "Test Debug Config";
    const port = 2000;
    const fuzzerExecutable =
      "/workspace/.codeforge/fuzzing/target/debug/fuzz_target_1";

    test("Should create CodeLLDB configuration", () => {
      const config = launchConfigManager.createCodeLLDBConfig(
        configName,
        port,
        fuzzerExecutable,
      );

      assert.strictEqual(config.type, "lldb");
      assert.strictEqual(config.request, "launch");
      assert.strictEqual(config.name, configName);
      assert.strictEqual(config.program, fuzzerExecutable);
      assert.deepStrictEqual(config.processCreateCommands, [
        `gdb-remote localhost:${port}`,
      ]);
    });

    test("Should create CodeLLDB configuration without program path", () => {
      const config = launchConfigManager.createCodeLLDBConfig(configName, port);

      assert.strictEqual(config.type, "lldb");
      assert.strictEqual(config.request, "launch");
      assert.strictEqual(config.name, configName);
      assert.strictEqual(config.program, undefined);
      assert.deepStrictEqual(config.processCreateCommands, [
        `gdb-remote localhost:${port}`,
      ]);
    });

    test("Should create NativeDebug configuration", () => {
      const config = launchConfigManager.createNativeDebugConfig(
        configName,
        port,
        fuzzerExecutable,
      );

      assert.strictEqual(config.type, "gdb");
      assert.strictEqual(config.request, "attach");
      assert.strictEqual(config.name, configName);
      assert.strictEqual(config.remote, true);
      assert.strictEqual(config.target, `:${port}`);
      assert.strictEqual(config.executable, fuzzerExecutable);
      assert.strictEqual(config.cwd, "${workspaceFolder}");
    });

    test("Should create NativeDebug configuration with options", () => {
      const options = {
        valuesFormatting: "prettyPrinters",
        printCalls: true,
        autorun: ["continue"],
      };

      const config = launchConfigManager.createNativeDebugConfig(
        configName,
        port,
        fuzzerExecutable,
        options,
      );

      assert.strictEqual(config.valuesFormatting, "prettyPrinters");
      assert.strictEqual(config.printCalls, true);
      assert.deepStrictEqual(config.autorun, ["continue"]);
    });
  });

  suite("createOrUpdateGdbAttachConfig with Extension Detection", () => {
    const workspacePath = "/workspace";
    const configName = "Test GDB Config";
    const port = 2000;
    const fuzzerExecutable = "/workspace/.codeforge/fuzzing/test-fuzzer";

    test("Should create CodeLLDB config when CodeLLDB is installed", async () => {
      // Mock vscode with CodeLLDB extension
      const mockVscode = {
        extensions: {
          all: [{ id: "vadimcn.vscode-lldb" }],
        },
      };

      const manager = new LaunchConfigManager(mockFs, mockVscode);

      // Mock file system
      mockFs.access.rejects(new Error("ENOENT"));
      mockFs.readFile.rejects(new Error("ENOENT"));
      mockFs.mkdir.resolves();
      mockFs.writeFile.resolves();

      const result = await manager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        fuzzerExecutable,
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.extensionUsed, "CodeLLDB");
      assert.strictEqual(result.debugExtensions.codeLLDB, true);
      assert.strictEqual(result.debugExtensions.preferred, "codeLLDB");

      // Verify the written config is CodeLLDB format
      const writeCall = mockFs.writeFile.firstCall;
      const writtenContent = JSON.parse(writeCall.args[1]);
      const config = writtenContent.configurations[0];

      assert.strictEqual(config.type, "lldb");
      assert.strictEqual(config.request, "launch");
      assert.ok(config.processCreateCommands);
    });

    test("Should create NativeDebug config when NativeDebug is installed", async () => {
      // Mock vscode with NativeDebug extension
      const mockVscode = {
        extensions: {
          all: [{ id: "webfreak.debug" }],
        },
      };

      const manager = new LaunchConfigManager(mockFs, mockVscode);

      // Mock file system
      mockFs.access.rejects(new Error("ENOENT"));
      mockFs.readFile.rejects(new Error("ENOENT"));
      mockFs.mkdir.resolves();
      mockFs.writeFile.resolves();

      const result = await manager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        fuzzerExecutable,
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.extensionUsed, "NativeDebug");
      assert.strictEqual(result.debugExtensions.nativeDebug, true);
      assert.strictEqual(result.debugExtensions.preferred, "nativeDebug");

      // Verify the written config is NativeDebug format
      const writeCall = mockFs.writeFile.firstCall;
      const writtenContent = JSON.parse(writeCall.args[1]);
      const config = writtenContent.configurations[0];

      assert.strictEqual(config.type, "gdb");
      assert.strictEqual(config.request, "attach");
      assert.strictEqual(config.remote, true);
    });

    test("Should fallback to NativeDebug when no extensions installed", async () => {
      // Mock vscode with no debug extensions
      const mockVscode = {
        extensions: {
          all: [{ id: "some.other.extension" }],
        },
      };

      const manager = new LaunchConfigManager(mockFs, mockVscode);

      // Mock file system
      mockFs.access.rejects(new Error("ENOENT"));
      mockFs.readFile.rejects(new Error("ENOENT"));
      mockFs.mkdir.resolves();
      mockFs.writeFile.resolves();

      const result = await manager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        fuzzerExecutable,
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.extensionUsed, "NativeDebug (fallback)");
      assert.strictEqual(result.debugExtensions.preferred, null);

      // Verify the written config is NativeDebug format (fallback)
      const writeCall = mockFs.writeFile.firstCall;
      const writtenContent = JSON.parse(writeCall.args[1]);
      const config = writtenContent.configurations[0];

      assert.strictEqual(config.type, "gdb");
      assert.strictEqual(config.request, "attach");
    });

    test("Should prefer CodeLLDB when both extensions are installed", async () => {
      // Mock vscode with both extensions
      const mockVscode = {
        extensions: {
          all: [{ id: "vadimcn.vscode-lldb" }, { id: "webfreak.debug" }],
        },
      };

      const manager = new LaunchConfigManager(mockFs, mockVscode);

      // Mock file system
      mockFs.access.rejects(new Error("ENOENT"));
      mockFs.readFile.rejects(new Error("ENOENT"));
      mockFs.mkdir.resolves();
      mockFs.writeFile.resolves();

      const result = await manager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        fuzzerExecutable,
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.extensionUsed, "CodeLLDB");
      assert.strictEqual(result.debugExtensions.codeLLDB, true);
      assert.strictEqual(result.debugExtensions.nativeDebug, true);
      assert.strictEqual(result.debugExtensions.preferred, "codeLLDB");

      // Verify CodeLLDB config was created
      const writeCall = mockFs.writeFile.firstCall;
      const writtenContent = JSON.parse(writeCall.args[1]);
      const config = writtenContent.configurations[0];

      assert.strictEqual(config.type, "lldb");
    });

    test("Should fetch fuzzer path for CodeLLDB when fuzzerName is provided", async () => {
      // Mock vscode with CodeLLDB extension
      const mockVscode = {
        extensions: {
          all: [{ id: "vadimcn.vscode-lldb" }],
        },
      };

      const manager = new LaunchConfigManager(mockFs, mockVscode);

      // Mock getFuzzerPath to return a path
      const expectedFuzzerPath =
        "/workspace/.codeforge/fuzzing/target/debug/test_fuzzer";
      sandbox.stub(manager, "getFuzzerPath").resolves(expectedFuzzerPath);

      // Mock file system
      mockFs.access.rejects(new Error("ENOENT"));
      mockFs.readFile.rejects(new Error("ENOENT"));
      mockFs.mkdir.resolves();
      mockFs.writeFile.resolves();

      const fuzzerName = "test_fuzzer";
      const result = await manager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        null, // No explicit fuzzer executable
        { fuzzerName: fuzzerName },
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.extensionUsed, "CodeLLDB");

      // Verify getFuzzerPath was called with correct arguments
      assert.strictEqual(manager.getFuzzerPath.calledOnce, true);
      assert.strictEqual(
        manager.getFuzzerPath.calledWith(workspacePath, fuzzerName),
        true,
      );

      // Verify the written config has the fuzzer path
      const writeCall = mockFs.writeFile.firstCall;
      const writtenContent = JSON.parse(writeCall.args[1]);
      const config = writtenContent.configurations[0];

      assert.strictEqual(config.type, "lldb");
      assert.strictEqual(config.program, expectedFuzzerPath);
    });

    test("Should not fetch fuzzer path if executable is already provided", async () => {
      // Mock vscode with CodeLLDB extension
      const mockVscode = {
        extensions: {
          all: [{ id: "vadimcn.vscode-lldb" }],
        },
      };

      const manager = new LaunchConfigManager(mockFs, mockVscode);

      // Mock getFuzzerPath (should not be called)
      const getFuzzerPathStub = sandbox.stub(manager, "getFuzzerPath");

      // Mock file system
      mockFs.access.rejects(new Error("ENOENT"));
      mockFs.readFile.rejects(new Error("ENOENT"));
      mockFs.mkdir.resolves();
      mockFs.writeFile.resolves();

      const fuzzerName = "test_fuzzer";
      const explicitPath = "/explicit/path/to/fuzzer";
      const result = await manager.createOrUpdateGdbAttachConfig(
        workspacePath,
        configName,
        port,
        explicitPath, // Explicit fuzzer executable provided
        { fuzzerName: fuzzerName },
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.extensionUsed, "CodeLLDB");

      // Verify getFuzzerPath was NOT called
      assert.strictEqual(getFuzzerPathStub.called, false);

      // Verify the written config uses the explicit path
      const writeCall = mockFs.writeFile.firstCall;
      const writtenContent = JSON.parse(writeCall.args[1]);
      const config = writtenContent.configurations[0];

      assert.strictEqual(config.type, "lldb");
      assert.strictEqual(config.program, explicitPath);
    });
  });
});
