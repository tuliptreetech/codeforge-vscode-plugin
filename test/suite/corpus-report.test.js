const assert = require("assert");
const sinon = require("sinon");
const {
  CorpusReportService,
} = require("../../src/fuzzing/corpusReportService");
const dockerOperations = require("../../src/core/dockerOperations");
const { EventEmitter } = require("events");

suite("CorpusReportService Tests", function () {
  let corpusReportService;
  let sandbox;

  setup(function () {
    corpusReportService = new CorpusReportService();
    sandbox = sinon.createSandbox();
  });

  teardown(function () {
    sandbox.restore();
  });

  test("should create CorpusReportService instance", function () {
    assert.ok(corpusReportService instanceof CorpusReportService);
    assert.ok(corpusReportService.dockerOperations);
  });

  test("should generate corpus report successfully", async function () {
    const workspacePath = "/workspace";
    const fuzzerName = "example-fuzz";
    const imageName = "test-image";
    const expectedOutput = `
CORPUS VIEWER: example-fuzz
================================================================================
File Count: 2
HEXDUMPS
...
    `.trim();

    // Create a mock process with EventEmitter
    const mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();

    // Stub dockerOperations.runDockerCommandWithOutput
    const runDockerStub = sandbox
      .stub(dockerOperations, "runDockerCommandWithOutput")
      .returns(mockProcess);

    // Start the async operation
    const reportPromise = corpusReportService.generateCorpusReport(
      workspacePath,
      fuzzerName,
      imageName,
    );

    // Simulate command output
    setTimeout(() => {
      mockProcess.stdout.emit("data", expectedOutput);
      mockProcess.emit("close", 0);
    }, 10);

    const result = await reportPromise;

    assert.strictEqual(result, expectedOutput);
    assert.ok(runDockerStub.calledOnce);

    const callArgs = runDockerStub.firstCall.args;
    assert.strictEqual(callArgs[0], workspacePath);
    assert.strictEqual(callArgs[1], imageName);
    assert.ok(
      callArgs[2].includes('codeforge generate-corpus-report "example-fuzz"'),
    );
  });

  test("should handle corpus report generation failure", async function () {
    const workspacePath = "/workspace";
    const fuzzerName = "example-fuzz";
    const imageName = "test-image";
    const errorMessage = "Fuzzer not found";

    // Create a mock process with EventEmitter
    const mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();

    // Stub dockerOperations.runDockerCommandWithOutput
    sandbox
      .stub(dockerOperations, "runDockerCommandWithOutput")
      .returns(mockProcess);

    // Start the async operation
    const reportPromise = corpusReportService.generateCorpusReport(
      workspacePath,
      fuzzerName,
      imageName,
    );

    // Simulate error output
    setTimeout(() => {
      mockProcess.stderr.emit("data", errorMessage);
      mockProcess.emit("close", 1);
    }, 10);

    try {
      await reportPromise;
      assert.fail("Should have thrown an error");
    } catch (error) {
      assert.ok(error.message.includes("Corpus report generation failed"));
      assert.ok(error.message.includes("exited with code 1"));
    }
  });

  test("should handle empty corpus output", async function () {
    const workspacePath = "/workspace";
    const fuzzerName = "example-fuzz";
    const imageName = "test-image";
    const infoMessage = "No corpus files found";

    // Create a mock process with EventEmitter
    const mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();

    // Stub dockerOperations.runDockerCommandWithOutput
    sandbox
      .stub(dockerOperations, "runDockerCommandWithOutput")
      .returns(mockProcess);

    // Start the async operation
    const reportPromise = corpusReportService.generateCorpusReport(
      workspacePath,
      fuzzerName,
      imageName,
    );

    // Simulate empty stdout but informational stderr
    setTimeout(() => {
      mockProcess.stderr.emit("data", infoMessage);
      mockProcess.emit("close", 0);
    }, 10);

    const result = await reportPromise;

    assert.strictEqual(result, infoMessage);
  });

  test("should handle process error", async function () {
    const workspacePath = "/workspace";
    const fuzzerName = "example-fuzz";
    const imageName = "test-image";
    const processError = new Error("Process spawn failed");

    // Create a mock process with EventEmitter
    const mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();

    // Stub dockerOperations.runDockerCommandWithOutput
    sandbox
      .stub(dockerOperations, "runDockerCommandWithOutput")
      .returns(mockProcess);

    // Start the async operation
    const reportPromise = corpusReportService.generateCorpusReport(
      workspacePath,
      fuzzerName,
      imageName,
    );

    // Simulate process error
    setTimeout(() => {
      mockProcess.emit("error", processError);
    }, 10);

    try {
      await reportPromise;
      assert.fail("Should have thrown an error");
    } catch (error) {
      assert.ok(
        error.message.includes("Failed to execute corpus report generation"),
      );
      assert.ok(error.message.includes("Process spawn failed"));
    }
  });

  test("should check if corpus report is available", async function () {
    const workspacePath = "/workspace";
    const fuzzerName = "example-fuzz";

    // Stub fs.access to simulate existing fuzzing directory
    const fsPromises = require("fs").promises;
    sandbox.stub(fsPromises, "access").resolves();

    const result = await corpusReportService.isCorpusReportAvailable(
      workspacePath,
      fuzzerName,
    );

    assert.strictEqual(result, true);
  });

  test("should return false when fuzzing directory does not exist", async function () {
    const workspacePath = "/workspace";
    const fuzzerName = "example-fuzz";

    // Stub fs.access to simulate missing fuzzing directory
    const fsPromises = require("fs").promises;
    const error = new Error("ENOENT");
    error.code = "ENOENT";
    sandbox.stub(fsPromises, "access").rejects(error);

    const result = await corpusReportService.isCorpusReportAvailable(
      workspacePath,
      fuzzerName,
    );

    assert.strictEqual(result, false);
  });

  test("should pass resource manager to options", async function () {
    const workspacePath = "/workspace";
    const fuzzerName = "example-fuzz";
    const imageName = "test-image";
    const mockResourceManager = { getResource: () => {} };

    const serviceWithRM = new CorpusReportService(mockResourceManager);

    // Create a mock process with EventEmitter
    const mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();

    // Stub dockerOperations.runDockerCommandWithOutput
    const runDockerStub = sandbox
      .stub(dockerOperations, "runDockerCommandWithOutput")
      .returns(mockProcess);

    // Start the async operation
    const reportPromise = serviceWithRM.generateCorpusReport(
      workspacePath,
      fuzzerName,
      imageName,
    );

    // Simulate successful output
    setTimeout(() => {
      mockProcess.stdout.emit("data", "test output");
      mockProcess.emit("close", 0);
    }, 10);

    await reportPromise;

    // Verify that resourceManager was passed in options
    const callArgs = runDockerStub.firstCall.args;
    const options = callArgs[4];
    assert.strictEqual(options.resourceManager, mockResourceManager);
  });
});
