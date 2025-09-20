/**
 * GDB Integration Test Suite
 *
 * This file contains comprehensive tests for the GDB integration functionality:
 * - GdbCommandBuilder - GDB command construction
 * - FuzzerResolver - Fuzzer executable discovery
 * - PathMapper - Host-to-container path mapping
 * - GdbTerminalLauncher - Terminal creation
 * - GdbIntegration - Main orchestration
 */

const assert = require("assert");
const sinon = require("sinon");
const path = require("path");
const {
  GdbCommandBuilder,
  FuzzerResolver,
  PathMapper,
  GdbTerminalLauncher,
  GdbIntegration,
} = require("../../src/fuzzing/gdbIntegration");

// Import test helpers
const {
  createMockExtensionContext,
  setupTestEnvironment,
  cleanupTestEnvironment,
} = require("../utils/activity-bar-test-helpers");

suite("GDB Integration Test Suite", () => {
  let sandbox;
  let testEnvironment;

  setup(() => {
    sandbox = sinon.createSandbox();
    testEnvironment = setupTestEnvironment(sandbox);
  });

  teardown(() => {
    cleanupTestEnvironment(sandbox);
  });

  suite("GdbCommandBuilder", () => {
    let commandBuilder;

    setup(() => {
      commandBuilder = new GdbCommandBuilder();
    });

    test("Should build basic GDB analyze command", () => {
      const fuzzerExecutable = "/path/to/fuzzer";
      const crashFile = "/path/to/crash";

      const command = commandBuilder.buildAnalyzeCommand(
        fuzzerExecutable,
        crashFile,
      );

      assert.deepStrictEqual(command, [
        "gdb",
        "--args",
        fuzzerExecutable,
        crashFile,
      ]);
    });

    test("Should throw error for missing fuzzer executable", () => {
      const crashFile = "/path/to/crash";

      assert.throws(() => {
        commandBuilder.buildAnalyzeCommand(null, crashFile);
      }, /Both fuzzer executable and crash file are required/);
    });

    test("Should throw error for missing crash file", () => {
      const fuzzerExecutable = "/path/to/fuzzer";

      assert.throws(() => {
        commandBuilder.buildAnalyzeCommand(fuzzerExecutable, null);
      }, /Both fuzzer executable and crash file are required/);
    });

    test("Should throw error for empty parameters", () => {
      assert.throws(() => {
        commandBuilder.buildAnalyzeCommand("", "");
      }, /Both fuzzer executable and crash file are required/);
    });

    test("Should build command with batch option", () => {
      const fuzzerExecutable = "/path/to/fuzzer";
      const crashFile = "/path/to/crash";
      const options = { batch: true };

      const command = commandBuilder.buildAnalyzeCommandWithOptions(
        fuzzerExecutable,
        crashFile,
        options,
      );

      assert.deepStrictEqual(command, [
        "gdb",
        "--batch",
        "--args",
        fuzzerExecutable,
        crashFile,
      ]);
    });

    test("Should build command with quiet option", () => {
      const fuzzerExecutable = "/path/to/fuzzer";
      const crashFile = "/path/to/crash";
      const options = { quiet: true };

      const command = commandBuilder.buildAnalyzeCommandWithOptions(
        fuzzerExecutable,
        crashFile,
        options,
      );

      assert.deepStrictEqual(command, [
        "gdb",
        "--quiet",
        "--args",
        fuzzerExecutable,
        crashFile,
      ]);
    });

    test("Should build command with execute commands", () => {
      const fuzzerExecutable = "/path/to/fuzzer";
      const crashFile = "/path/to/crash";
      const options = { ex: ["run", "bt", "quit"] };

      const command = commandBuilder.buildAnalyzeCommandWithOptions(
        fuzzerExecutable,
        crashFile,
        options,
      );

      assert.deepStrictEqual(command, [
        "gdb",
        "--ex",
        "run",
        "--ex",
        "bt",
        "--ex",
        "quit",
        "--args",
        fuzzerExecutable,
        crashFile,
      ]);
    });

    test("Should build command with multiple options", () => {
      const fuzzerExecutable = "/path/to/fuzzer";
      const crashFile = "/path/to/crash";
      const options = {
        batch: true,
        quiet: true,
        ex: ["run", "bt"],
      };

      const command = commandBuilder.buildAnalyzeCommandWithOptions(
        fuzzerExecutable,
        crashFile,
        options,
      );

      assert.deepStrictEqual(command, [
        "gdb",
        "--batch",
        "--quiet",
        "--ex",
        "run",
        "--ex",
        "bt",
        "--args",
        fuzzerExecutable,
        crashFile,
      ]);
    });

    test("Should handle empty options", () => {
      const fuzzerExecutable = "/path/to/fuzzer";
      const crashFile = "/path/to/crash";

      const command = commandBuilder.buildAnalyzeCommandWithOptions(
        fuzzerExecutable,
        crashFile,
        {},
      );

      assert.deepStrictEqual(command, [
        "gdb",
        "--args",
        fuzzerExecutable,
        crashFile,
      ]);
    });
  });

  suite("FuzzerResolver", () => {
    let fuzzerResolver;

    setup(() => {
      fuzzerResolver = new FuzzerResolver();
    });

    test("Should resolve fuzzer executable from direct path", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "libfuzzer";
      const expectedPath = path.join(
        workspacePath,
        ".codeforge",
        "fuzzing",
        fuzzerName,
      );

      // Mock file system operations
      testEnvironment.fsMocks.access.resolves(); // fuzzing directory exists
      testEnvironment.fsMocks.stat
        .onFirstCall()
        .resolves({ isFile: () => true });
      testEnvironment.fsMocks.access
        .withArgs(expectedPath, sinon.match.any)
        .resolves();

      const result = await fuzzerResolver.resolveFuzzerExecutable(
        workspacePath,
        fuzzerName,
      );

      assert.strictEqual(result, expectedPath);
      assert.ok(testEnvironment.fsMocks.access.calledWith(expectedPath));
    });

    test("Should resolve fuzzer executable from subdirectory", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "libfuzzer";
      const expectedPath = path.join(
        workspacePath,
        ".codeforge",
        "fuzzing",
        fuzzerName,
        fuzzerName,
      );

      // Mock file system operations - first few paths fail, subdirectory succeeds
      testEnvironment.fsMocks.access.resolves(); // fuzzing directory exists
      testEnvironment.fsMocks.stat
        .onCall(0)
        .rejects(new Error("ENOENT")) // direct path fails
        .onCall(1)
        .rejects(new Error("ENOENT")) // -fuzz path fails
        .onCall(2)
        .rejects(new Error("ENOENT")) // codeforge- path fails
        .onCall(3)
        .resolves({ isFile: () => true }); // subdirectory path succeeds
      testEnvironment.fsMocks.access
        .withArgs(expectedPath, sinon.match.any)
        .resolves();

      const result = await fuzzerResolver.resolveFuzzerExecutable(
        workspacePath,
        fuzzerName,
      );

      assert.strictEqual(result, expectedPath);
    });

    test("Should throw error for missing fuzzer name", async () => {
      const workspacePath = "/test/workspace";

      await assert.rejects(
        fuzzerResolver.resolveFuzzerExecutable(workspacePath, null),
        /Fuzzer name is required/,
      );
    });

    test("Should throw error for missing fuzzing directory", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "libfuzzer";

      testEnvironment.fsMocks.access.rejects(new Error("ENOENT"));

      await assert.rejects(
        fuzzerResolver.resolveFuzzerExecutable(workspacePath, fuzzerName),
        /Fuzzing directory not found/,
      );
    });

    test("Should throw error when no executable found", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "nonexistent";

      testEnvironment.fsMocks.access.resolves(); // fuzzing directory exists
      testEnvironment.fsMocks.stat.rejects(new Error("ENOENT")); // all paths fail

      await assert.rejects(
        fuzzerResolver.resolveFuzzerExecutable(workspacePath, fuzzerName),
        /Fuzzer executable not found for: nonexistent/,
      );
    });

    test("Should skip non-executable files", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "libfuzzer";
      const expectedPath = path.join(
        workspacePath,
        ".codeforge",
        "fuzzing",
        `${fuzzerName}-fuzz`,
      );

      testEnvironment.fsMocks.access.resolves(); // fuzzing directory exists
      testEnvironment.fsMocks.stat
        .onCall(0)
        .resolves({ isFile: () => true }) // first path exists but not executable
        .onCall(1)
        .resolves({ isFile: () => true }); // second path exists and executable
      testEnvironment.fsMocks.access
        .withArgs(sinon.match.string, testEnvironment.fsMocks.constants.X_OK)
        .onCall(0)
        .rejects(new Error("Not executable")) // first path not executable
        .onCall(1)
        .resolves(); // second path executable

      const result = await fuzzerResolver.resolveFuzzerExecutable(
        workspacePath,
        fuzzerName,
      );

      assert.strictEqual(result, expectedPath);
    });

    test("Should list available fuzzers from files", async () => {
      const workspacePath = "/test/workspace";
      const fuzzingDir = path.join(workspacePath, ".codeforge", "fuzzing");

      testEnvironment.fsMocks.access.resolves(); // fuzzing directory exists
      testEnvironment.fsMocks.readdir.resolves([
        { name: "libfuzzer", isFile: () => true, isDirectory: () => false },
        { name: "afl-fuzz", isFile: () => true, isDirectory: () => false },
        { name: "readme.txt", isFile: () => true, isDirectory: () => false },
      ]);
      testEnvironment.fsMocks.access
        .withArgs(sinon.match.string, testEnvironment.fsMocks.constants.X_OK)
        .onCall(0)
        .resolves() // libfuzzer executable
        .onCall(1)
        .resolves() // afl-fuzz executable
        .onCall(2)
        .rejects(new Error("Not executable")); // readme.txt not executable

      const result = await fuzzerResolver.listAvailableFuzzers(workspacePath);

      assert.deepStrictEqual(result, ["libfuzzer", "afl-fuzz"]);
    });

    test("Should list available fuzzers from directories", async () => {
      const workspacePath = "/test/workspace";

      testEnvironment.fsMocks.access.resolves(); // fuzzing directory exists
      testEnvironment.fsMocks.readdir
        .onCall(0)
        .resolves([
          { name: "libfuzzer", isFile: () => false, isDirectory: () => true },
        ])
        .onCall(1)
        .resolves([
          {
            name: "libfuzzer-exe",
            isFile: () => true,
            isDirectory: () => false,
          },
        ]);
      testEnvironment.fsMocks.access
        .withArgs(sinon.match.string, testEnvironment.fsMocks.constants.X_OK)
        .resolves(); // executable found in directory

      const result = await fuzzerResolver.listAvailableFuzzers(workspacePath);

      assert.deepStrictEqual(result, ["libfuzzer"]);
    });

    test("Should return empty array when fuzzing directory doesn't exist", async () => {
      const workspacePath = "/test/workspace";

      testEnvironment.fsMocks.access.rejects(new Error("ENOENT"));

      const result = await fuzzerResolver.listAvailableFuzzers(workspacePath);

      assert.deepStrictEqual(result, []);
    });

    test("Should handle readdir errors", async () => {
      const workspacePath = "/test/workspace";

      testEnvironment.fsMocks.access.resolves(); // fuzzing directory exists
      testEnvironment.fsMocks.readdir.rejects(new Error("Permission denied"));

      await assert.rejects(
        fuzzerResolver.listAvailableFuzzers(workspacePath),
        /Failed to list fuzzers/,
      );
    });
  });

  suite("PathMapper", () => {
    let pathMapper;

    setup(() => {
      pathMapper = new PathMapper();
    });

    test("Should map host path to container path", () => {
      const hostPath = "/test/workspace/src/main.cpp";
      const workspacePath = "/test/workspace";

      const result = pathMapper.mapHostToContainer(hostPath, workspacePath);

      assert.strictEqual(result, "/test/workspace/src/main.cpp");
    });

    test("Should handle nested paths", () => {
      const hostPath = "/test/workspace/deep/nested/path/file.txt";
      const workspacePath = "/test/workspace";

      const result = pathMapper.mapHostToContainer(hostPath, workspacePath);

      assert.strictEqual(result, "/test/workspace/deep/nested/path/file.txt");
    });

    test("Should throw error for path outside workspace", () => {
      const hostPath = "/other/path/file.txt";
      const workspacePath = "/test/workspace";

      assert.throws(() => {
        pathMapper.mapHostToContainer(hostPath, workspacePath);
      }, /Host path .+ is not within workspace/);
    });

    test("Should throw error for missing host path", () => {
      const workspacePath = "/test/workspace";

      assert.throws(() => {
        pathMapper.mapHostToContainer(null, workspacePath);
      }, /Both host path and workspace path are required/);
    });

    test("Should throw error for missing workspace path", () => {
      const hostPath = "/test/workspace/file.txt";

      assert.throws(() => {
        pathMapper.mapHostToContainer(hostPath, null);
      }, /Both host path and workspace path are required/);
    });

    test("Should map container path to host path", () => {
      const containerPath = "/test/workspace/src/main.cpp";
      const workspacePath = "/test/workspace";

      const result = pathMapper.mapContainerToHost(
        containerPath,
        workspacePath,
      );

      assert.strictEqual(result, containerPath);
    });

    test("Should throw error for missing container path", () => {
      const workspacePath = "/test/workspace";

      assert.throws(() => {
        pathMapper.mapContainerToHost(null, workspacePath);
      }, /Both container path and workspace path are required/);
    });

    test("Should handle Windows-style paths", () => {
      const hostPath = "C:\\test\\workspace\\src\\main.cpp";
      const workspacePath = "C:\\test\\workspace";

      // Should normalize paths and work correctly
      const result = pathMapper.mapHostToContainer(hostPath, workspacePath);

      // Result should be Unix-style container path (no drive letter, forward slashes)
      assert.strictEqual(result, "/test/workspace/src/main.cpp");
    });

    test("Should handle Windows paths with mixed separators", () => {
      const hostPath = "D:\\test\\workspace/src\\main.cpp";
      const workspacePath = "D:\\test\\workspace";

      const result = pathMapper.mapHostToContainer(hostPath, workspacePath);

      // Should normalize to Unix-style container path
      assert.strictEqual(result, "/test/workspace/src/main.cpp");
    });

    test("Should handle Windows paths with different drive letters", () => {
      const hostPath = "E:\\project\\workspace\\deep\\nested\\file.txt";
      const workspacePath = "E:\\project\\workspace";

      const result = pathMapper.mapHostToContainer(hostPath, workspacePath);

      // Should normalize to Unix-style container path
      assert.strictEqual(result, "/project/workspace/deep/nested/file.txt");
    });
  });

  suite("GdbTerminalLauncher", () => {
    let terminalLauncher;
    let mockDockerOperations;
    let mockVscode;

    setup(() => {
      mockDockerOperations = {
        generateContainerName: sandbox.stub().returns("test-container"),
        generateDockerRunArgs: sandbox
          .stub()
          .returns(["run", "-it", "--rm", "test-image", "/bin/bash"]),
      };

      // Mock vscode configuration
      mockVscode = {
        workspace: {
          getConfiguration: sandbox.stub().returns({
            get: sandbox.stub().callsFake((key, defaultValue) => {
              const config = {
                dockerCommand: "docker",
                defaultShell: "/bin/bash",
                additionalDockerRunArgs: [],
                mountWorkspace: true,
              };
              return config[key] || defaultValue;
            }),
          }),
        },
      };

      // Apply vscode mock
      sandbox.stub(require("vscode"), "workspace").value(mockVscode.workspace);

      terminalLauncher = new GdbTerminalLauncher(mockDockerOperations);
    });

    test("Should create GDB terminal configuration", async () => {
      const workspacePath = "/test/workspace";
      const gdbCommand = ["gdb", "--args", "/path/to/fuzzer", "/path/to/crash"];

      const result = await terminalLauncher.createGdbTerminal(
        workspacePath,
        gdbCommand,
      );

      assert.ok(result.shellPath);
      assert.ok(result.shellArgs);
      assert.ok(result.terminalName);
      assert.strictEqual(result.shellPath, "docker");
      assert.ok(result.shellArgs.includes("/bin/bash"));
      assert.ok(result.shellArgs.includes("-c"));
      assert.ok(result.shellArgs.some((arg) => arg.includes("gdb --args")));
    });

    test("Should use custom terminal name", async () => {
      const workspacePath = "/test/workspace";
      const gdbCommand = ["gdb", "--args", "/path/to/fuzzer", "/path/to/crash"];
      const options = { terminalName: "Custom GDB Terminal" };

      const result = await terminalLauncher.createGdbTerminal(
        workspacePath,
        gdbCommand,
        options,
      );

      assert.strictEqual(result.terminalName, "Custom GDB Terminal");
    });

    test("Should use custom container name", async () => {
      const workspacePath = "/test/workspace";
      const gdbCommand = ["gdb", "--args", "/path/to/fuzzer", "/path/to/crash"];
      const options = { containerName: "custom-container" };

      await terminalLauncher.createGdbTerminal(
        workspacePath,
        gdbCommand,
        options,
      );

      assert.ok(
        mockDockerOperations.generateDockerRunArgs.calledWith(
          workspacePath,
          "custom-container",
          sinon.match.any,
        ),
      );
    });

    test("Should handle additional Docker arguments", async () => {
      const workspacePath = "/test/workspace";
      const gdbCommand = ["gdb", "--args", "/path/to/fuzzer", "/path/to/crash"];
      const options = {
        additionalArgs: ["--privileged", "--cap-add=SYS_PTRACE"],
      };

      await terminalLauncher.createGdbTerminal(
        workspacePath,
        gdbCommand,
        options,
      );

      const dockerOptions =
        mockDockerOperations.generateDockerRunArgs.getCall(0).args[2];
      assert.ok(dockerOptions.additionalArgs.includes("--privileged"));
      assert.ok(dockerOptions.additionalArgs.includes("--cap-add=SYS_PTRACE"));
    });

    test("Should configure container for GDB analysis", async () => {
      const workspacePath = "/test/workspace";
      const gdbCommand = ["gdb", "--args", "/path/to/fuzzer", "/path/to/crash"];

      await terminalLauncher.createGdbTerminal(workspacePath, gdbCommand);

      const dockerOptions =
        mockDockerOperations.generateDockerRunArgs.getCall(0).args[2];
      assert.strictEqual(dockerOptions.containerType, "gdb-analysis");
      assert.strictEqual(dockerOptions.interactive, true);
      assert.strictEqual(dockerOptions.tty, true);
      assert.strictEqual(dockerOptions.enableTracking, true);
    });
  });

  suite("GdbIntegration", () => {
    let gdbIntegration;
    let mockDockerOperations;

    setup(() => {
      mockDockerOperations = {
        generateContainerName: sandbox.stub().returns("test-container"),
        generateDockerRunArgs: sandbox
          .stub()
          .returns(["run", "-it", "--rm", "test-image", "/bin/bash"]),
      };

      // Mock vscode configuration
      const mockVscode = {
        workspace: {
          getConfiguration: sandbox.stub().returns({
            get: sandbox.stub().callsFake((key, defaultValue) => {
              const config = {
                dockerCommand: "docker",
                defaultShell: "/bin/bash",
                additionalDockerRunArgs: [],
                mountWorkspace: true,
              };
              return config[key] || defaultValue;
            }),
          }),
        },
      };

      sandbox.stub(require("vscode"), "workspace").value(mockVscode.workspace);

      gdbIntegration = new GdbIntegration(mockDockerOperations);
    });

    test("Should analyze crash successfully", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "libfuzzer";
      const crashFilePath = "/test/workspace/crash-file";

      // Mock successful fuzzer resolution
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.fsMocks.stat.resolves({ isFile: () => true });

      const result = await gdbIntegration.analyzeCrash(
        workspacePath,
        fuzzerName,
        crashFilePath,
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.fuzzerExecutable);
      assert.strictEqual(result.crashFilePath, crashFilePath);
      assert.ok(result.gdbCommand);
      assert.ok(result.terminalConfig);
    });

    test("Should handle fuzzer resolution failure", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "nonexistent";
      const crashFilePath = "/test/workspace/crash-file";

      // Mock fuzzer resolution failure
      testEnvironment.fsMocks.access.rejects(
        new Error("Fuzzing directory not found"),
      );

      const result = await gdbIntegration.analyzeCrash(
        workspacePath,
        fuzzerName,
        crashFilePath,
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.strictEqual(result.fuzzerName, fuzzerName);
      assert.strictEqual(result.crashFilePath, crashFilePath);
    });

    test("Should validate analysis requirements successfully", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "libfuzzer";
      const crashFilePath = "/test/workspace/crash-file";

      // Mock successful validation
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.fsMocks.stat.resolves({ isFile: () => true });

      const result = await gdbIntegration.validateAnalysisRequirements(
        workspacePath,
        fuzzerName,
        crashFilePath,
      );

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.issues.length, 0);
    });

    test("Should detect missing crash file", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "libfuzzer";
      const crashFilePath = "/test/workspace/nonexistent-crash";

      // Mock crash file access failure but fuzzing directory exists
      testEnvironment.fsMocks.access.callsFake((path) => {
        if (path === crashFilePath) {
          return Promise.reject(new Error("ENOENT"));
        }
        if (path.includes(".codeforge") && path.includes("fuzzing")) {
          return Promise.resolve();
        }
        return Promise.resolve();
      });
      testEnvironment.fsMocks.stat.resolves({ isFile: () => true });

      const result = await gdbIntegration.validateAnalysisRequirements(
        workspacePath,
        fuzzerName,
        crashFilePath,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.issues.some((issue) =>
          issue.includes("Crash file not accessible"),
        ),
      );
    });

    test("Should detect missing fuzzer executable", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "nonexistent";
      const crashFilePath = "/test/workspace/crash-file";

      // Mock crash file exists but fuzzer doesn't
      testEnvironment.fsMocks.access.withArgs(crashFilePath).resolves();
      testEnvironment.fsMocks.access
        .withArgs(sinon.match(/\.codeforge.*fuzzing/))
        .rejects(new Error("Fuzzing directory not found"));

      const result = await gdbIntegration.validateAnalysisRequirements(
        workspacePath,
        fuzzerName,
        crashFilePath,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.issues.some((issue) =>
          issue.includes("Fuzzer executable not found"),
        ),
      );
    });

    test("Should detect path mapping issues", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "libfuzzer";
      const crashFilePath = "/outside/workspace/crash-file";

      // Mock crash file exists and fuzzer exists, but path is outside workspace
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.fsMocks.stat.resolves({ isFile: () => true });

      const result = await gdbIntegration.validateAnalysisRequirements(
        workspacePath,
        fuzzerName,
        crashFilePath,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.issues.some((issue) => issue.includes("Path mapping failed")),
      );
    });

    test("Should collect multiple validation issues", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "nonexistent";
      const crashFilePath = "/outside/workspace/nonexistent-crash";

      // Mock multiple failures
      testEnvironment.fsMocks.access.rejects(new Error("Not found"));

      const result = await gdbIntegration.validateAnalysisRequirements(
        workspacePath,
        fuzzerName,
        crashFilePath,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.length > 1);
    });

    test("Should pass options to terminal launcher", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "libfuzzer";
      const crashFilePath = "/test/workspace/crash-file";
      const options = {
        removeAfterRun: false,
        terminalName: "Custom GDB Terminal",
        additionalArgs: ["--privileged"],
      };

      // Mock successful setup
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.fsMocks.stat.resolves({ isFile: () => true });

      const result = await gdbIntegration.analyzeCrash(
        workspacePath,
        fuzzerName,
        crashFilePath,
        options,
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(
        result.terminalConfig.terminalName,
        "Custom GDB Terminal",
      );
    });
  });

  suite("Integration Tests", () => {
    let gdbIntegration;
    let mockDockerOperations;

    setup(() => {
      mockDockerOperations = {
        generateContainerName: sandbox.stub().returns("test-container"),
        generateDockerRunArgs: sandbox
          .stub()
          .returns(["run", "-it", "--rm", "test-image", "/bin/bash"]),
      };

      const mockVscode = {
        workspace: {
          getConfiguration: sandbox.stub().returns({
            get: sandbox.stub().callsFake((key, defaultValue) => {
              const config = {
                dockerCommand: "docker",
                defaultShell: "/bin/bash",
                additionalDockerRunArgs: [],
                mountWorkspace: true,
              };
              return config[key] || defaultValue;
            }),
          }),
        },
      };

      sandbox.stub(require("vscode"), "workspace").value(mockVscode.workspace);

      gdbIntegration = new GdbIntegration(mockDockerOperations);
    });

    test("Should handle complete analysis workflow", async () => {
      const workspacePath = "/test/workspace";
      const fuzzerName = "libfuzzer";
      const crashFilePath =
        "/test/workspace/.codeforge/fuzzing/corpus/crash-abc123";

      // Mock file system for successful workflow
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.fsMocks.stat.resolves({ isFile: () => true });

      // First validate requirements
      const validation = await gdbIntegration.validateAnalysisRequirements(
        workspacePath,
        fuzzerName,
        crashFilePath,
      );

      assert.strictEqual(validation.valid, true);

      // Then perform analysis
      const result = await gdbIntegration.analyzeCrash(
        workspacePath,
        fuzzerName,
        crashFilePath,
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.terminalConfig);
      assert.ok(result.gdbCommand.includes("gdb"));
      assert.ok(result.gdbCommand.includes("--args"));
    });

    test("Should handle analysis with custom GDB options", async () => {
      const commandBuilder = new GdbCommandBuilder();
      const fuzzerExecutable = "/path/to/fuzzer";
      const crashFile = "/path/to/crash";

      // Test various GDB command configurations
      const basicCommand = commandBuilder.buildAnalyzeCommand(
        fuzzerExecutable,
        crashFile,
      );
      const batchCommand = commandBuilder.buildAnalyzeCommandWithOptions(
        fuzzerExecutable,
        crashFile,
        { batch: true, quiet: true },
      );
      const scriptedCommand = commandBuilder.buildAnalyzeCommandWithOptions(
        fuzzerExecutable,
        crashFile,
        { ex: ["run", "bt", "info registers", "quit"] },
      );

      assert.ok(basicCommand.includes("gdb"));
      assert.ok(batchCommand.includes("--batch"));
      assert.ok(batchCommand.includes("--quiet"));
      assert.ok(scriptedCommand.includes("--ex"));
      assert.strictEqual(
        scriptedCommand.filter((arg) => arg === "--ex").length,
        4,
      );
    });

    test("Should handle fuzzer discovery edge cases", async () => {
      const fuzzerResolver = new FuzzerResolver();
      const workspacePath = "/test/workspace";

      // Test with empty fuzzing directory
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.fsMocks.readdir.resolves([]);

      const emptyResult =
        await fuzzerResolver.listAvailableFuzzers(workspacePath);
      assert.deepStrictEqual(emptyResult, []);

      // Test with mixed file types
      testEnvironment.fsMocks.readdir.resolves([
        {
          name: "executable-fuzzer",
          isFile: () => true,
          isDirectory: () => false,
        },
        {
          name: "non-executable-file",
          isFile: () => true,
          isDirectory: () => false,
        },
        { name: "fuzzer-dir", isFile: () => false, isDirectory: () => true },
        { name: ".hidden-file", isFile: () => true, isDirectory: () => false },
      ]);

      testEnvironment.fsMocks.access
        .withArgs(sinon.match.string, testEnvironment.fsMocks.constants.X_OK)
        .onCall(0)
        .resolves() // executable-fuzzer is executable
        .onCall(1)
        .rejects(new Error("Not executable")) // non-executable-file
        .onCall(2)
        .rejects(new Error("Not executable")); // .hidden-file

      // Mock subdirectory check for fuzzer-dir
      testEnvironment.fsMocks.readdir
        .withArgs(sinon.match(/fuzzer-dir/))
        .resolves([
          {
            name: "fuzzer-executable",
            isFile: () => true,
            isDirectory: () => false,
          },
        ]);
      testEnvironment.fsMocks.access
        .withArgs(
          sinon.match(/fuzzer-executable/),
          testEnvironment.fsMocks.constants.X_OK,
        )
        .resolves();

      const mixedResult =
        await fuzzerResolver.listAvailableFuzzers(workspacePath);
      assert.ok(mixedResult.includes("executable-fuzzer"));
      assert.ok(mixedResult.includes("fuzzer-dir"));
      assert.ok(!mixedResult.includes("non-executable-file"));
      // Note: .hidden-file might be included if it's executable, so we don't test for its exclusion
    });

    test("Should handle path mapping with various path formats", () => {
      const pathMapper = new PathMapper();
      const workspacePath = "/test/workspace";

      // Test various valid paths
      const testCases = [
        {
          input: "/test/workspace/file.txt",
          expected: "/test/workspace/file.txt",
        },
        {
          input: "/test/workspace/deep/nested/path/file.txt",
          expected: "/test/workspace/deep/nested/path/file.txt",
        },
        {
          input: "/test/workspace/./file.txt",
          expected: "/test/workspace/file.txt",
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = pathMapper.mapHostToContainer(input, workspacePath);
        assert.ok(result.includes("file.txt"));
      });
    });

    test("Should handle terminal launcher with various Docker configurations", async () => {
      const mockDockerOps = {
        generateContainerName: sandbox.stub().returns("custom-container"),
        generateDockerRunArgs: sandbox
          .stub()
          .returns([
            "run",
            "-it",
            "--rm",
            "--privileged",
            "test-image",
            "/bin/bash",
          ]),
      };

      const mockVscode = {
        workspace: {
          getConfiguration: sandbox.stub().returns({
            get: sandbox.stub().callsFake((key, defaultValue) => {
              const config = {
                dockerCommand: "podman", // Test with alternative container runtime
                defaultShell: "/bin/zsh",
                additionalDockerRunArgs: [
                  "--security-opt",
                  "seccomp=unconfined",
                ],
                mountWorkspace: true,
              };
              return config[key] || defaultValue;
            }),
          }),
        },
      };

      sandbox.stub(require("vscode"), "workspace").value(mockVscode.workspace);

      const launcher = new GdbTerminalLauncher(mockDockerOps);
      const result = await launcher.createGdbTerminal("/test/workspace", [
        "gdb",
        "--args",
        "fuzzer",
        "crash",
      ]);

      assert.strictEqual(result.shellPath, "podman");
      // Verify that the Docker options were configured correctly
      const dockerOptions =
        mockDockerOps.generateDockerRunArgs.getCall(0).args[2];
      assert.strictEqual(dockerOptions.shell, "/bin/zsh");
      assert.ok(dockerOptions.additionalArgs.includes("--security-opt"));
    });
  });

  suite("Error Handling and Edge Cases", () => {
    test("Should handle malformed GDB commands gracefully", () => {
      const commandBuilder = new GdbCommandBuilder();

      // Test with various edge cases
      assert.throws(() => {
        commandBuilder.buildAnalyzeCommand(undefined, "/path/to/crash");
      });

      assert.throws(() => {
        commandBuilder.buildAnalyzeCommand("/path/to/fuzzer", "");
      });

      // Should handle special characters in paths
      const result = commandBuilder.buildAnalyzeCommand(
        "/path/with spaces/fuzzer",
        "/path/with-special@chars/crash",
      );
      assert.ok(result.includes("/path/with spaces/fuzzer"));
      assert.ok(result.includes("/path/with-special@chars/crash"));
    });

    test("Should handle file system permission errors", async () => {
      const fuzzerResolver = new FuzzerResolver();
      const workspacePath = "/test/workspace";
      const fuzzerName = "restricted-fuzzer";

      // Mock permission denied errors
      testEnvironment.fsMocks.access
        .withArgs(sinon.match(/\.codeforge.*fuzzing$/))
        .resolves(); // fuzzing directory exists
      testEnvironment.fsMocks.stat.rejects(
        new Error("EACCES: permission denied"),
      );

      await assert.rejects(
        fuzzerResolver.resolveFuzzerExecutable(workspacePath, fuzzerName),
        /Fuzzer executable not found/,
      );
    });

    test("Should handle Docker operations failures", async () => {
      const mockDockerOps = {
        generateContainerName: sandbox
          .stub()
          .throws(new Error("Docker not available")),
        generateDockerRunArgs: sandbox.stub().returns([]),
      };

      const gdbIntegration = new GdbIntegration(mockDockerOps);

      // Mock successful file operations
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.fsMocks.stat.resolves({ isFile: () => true });

      const result = await gdbIntegration.analyzeCrash(
        "/test/workspace",
        "libfuzzer",
        "/test/workspace/crash",
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes("Docker not available"));
    });

    test("Should handle concurrent analysis requests", async () => {
      const gdbIntegration = new GdbIntegration({
        generateContainerName: sandbox.stub().returns("test-container"),
        generateDockerRunArgs: sandbox.stub().returns(["run", "-it", "test"]),
      });

      // Mock vscode configuration
      const mockVscode = {
        workspace: {
          getConfiguration: sandbox.stub().returns({
            get: sandbox.stub().returns("docker"),
          }),
        },
      };
      sandbox.stub(require("vscode"), "workspace").value(mockVscode.workspace);

      // Mock successful file operations
      testEnvironment.fsMocks.access.resolves();
      testEnvironment.fsMocks.stat.resolves({ isFile: () => true });

      // Run multiple analyses concurrently
      const promises = [
        gdbIntegration.analyzeCrash(
          "/test/workspace",
          "fuzzer1",
          "/test/workspace/crash1",
        ),
        gdbIntegration.analyzeCrash(
          "/test/workspace",
          "fuzzer2",
          "/test/workspace/crash2",
        ),
        gdbIntegration.analyzeCrash(
          "/test/workspace",
          "fuzzer3",
          "/test/workspace/crash3",
        ),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach((result) => {
        assert.strictEqual(result.success, true);
      });
    });

    test("Should validate input parameters thoroughly", async () => {
      const gdbIntegration = new GdbIntegration({
        generateContainerName: sandbox.stub().returns("test-container"),
        generateDockerRunArgs: sandbox.stub().returns(["run", "-it", "test"]),
      });

      // Test various invalid inputs
      const invalidInputs = [
        { workspacePath: null, fuzzerName: "test", crashFilePath: "/path" },
        { workspacePath: "", fuzzerName: "test", crashFilePath: "/path" },
        { workspacePath: "/path", fuzzerName: null, crashFilePath: "/path" },
        { workspacePath: "/path", fuzzerName: "", crashFilePath: "/path" },
        { workspacePath: "/path", fuzzerName: "test", crashFilePath: null },
        { workspacePath: "/path", fuzzerName: "test", crashFilePath: "" },
      ];

      for (const input of invalidInputs) {
        const result = await gdbIntegration.analyzeCrash(
          input.workspacePath,
          input.fuzzerName,
          input.crashFilePath,
        );
        assert.strictEqual(result.success, false);
        assert.ok(result.error);
      }
    });
  });
});
