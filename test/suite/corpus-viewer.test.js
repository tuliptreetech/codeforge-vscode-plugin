const assert = require("assert");
const path = require("path");
const sinon = require("sinon");
const {
  CorpusViewerService,
} = require("../../src/fuzzing/corpusViewerService");

suite("CorpusViewerService Tests", function () {
  let corpusViewerService;
  let sandbox;

  setup(function () {
    corpusViewerService = new CorpusViewerService();
    sandbox = sinon.createSandbox();
  });

  teardown(function () {
    sandbox.restore();
  });

  test("should create CorpusViewerService instance", function () {
    assert.ok(corpusViewerService instanceof CorpusViewerService);
    assert.ok(corpusViewerService.fs);
    assert.ok(corpusViewerService.path);
  });

  test("should get correct corpus directory path", function () {
    const workspacePath = "/workspace";
    const fuzzerName = "example-fuzz";

    const result = corpusViewerService.getCorpusDirectory(
      workspacePath,
      fuzzerName,
    );

    const expected = path.join(
      workspacePath,
      ".codeforge",
      "fuzzing",
      "example-fuzz-output",
      "corpus",
    );
    assert.strictEqual(result, expected);
  });

  test("should format file size correctly", function () {
    assert.strictEqual(corpusViewerService.formatFileSize(0), "0 B");
    assert.strictEqual(corpusViewerService.formatFileSize(500), "500 B");
    assert.strictEqual(corpusViewerService.formatFileSize(1024), "1 KB");
    assert.strictEqual(corpusViewerService.formatFileSize(1024 * 1024), "1 MB");
    assert.strictEqual(
      corpusViewerService.formatFileSize(1024 * 1024 * 1024),
      "1 GB",
    );
    assert.strictEqual(corpusViewerService.formatFileSize(2048), "2 KB");
  });

  test("should format date/time correctly", function () {
    const testDate = new Date("2024-12-19T15:30:45Z");
    const formatted = corpusViewerService.formatDateTime(testDate);

    // Should contain the date components (exact format may vary by locale)
    assert.ok(formatted.includes("2024"));
    assert.ok(formatted.includes("19"));
  });

  test("should generate hexdump for empty file", function () {
    const emptyBuffer = Buffer.from([]);
    const fileName = "empty.txt";
    const fileSize = 0;
    const createdAt = new Date();

    const hexDump = corpusViewerService.generateHexDump(
      emptyBuffer,
      fileName,
      fileSize,
      createdAt,
    );

    assert.ok(hexDump.includes("FILE: empty.txt"));
    assert.ok(hexDump.includes("File Size:   0 bytes"));
    assert.ok(hexDump.includes("Empty file - no content to display"));
  });

  test("should generate hexdump for small file", function () {
    const testData = Buffer.from("Hello, World!");
    const fileName = "test.txt";
    const fileSize = testData.length;
    const createdAt = new Date();

    const hexDump = corpusViewerService.generateHexDump(
      testData,
      fileName,
      fileSize,
      createdAt,
    );

    assert.ok(hexDump.includes("FILE: test.txt"));
    assert.ok(hexDump.includes("File Size:   13 bytes"));
    // Should contain hex representation
    assert.ok(hexDump.includes("48")); // 'H' = 0x48
    assert.ok(hexDump.includes("65")); // 'e' = 0x65
    // Should contain ASCII representation
    assert.ok(hexDump.includes("Hello, World!"));
  });

  test("should truncate large files in hexdump", function () {
    const largeData = Buffer.alloc(1024 * 100); // 100KB
    const fileName = "large.bin";
    const fileSize = largeData.length;
    const createdAt = new Date();
    const maxSize = 1024 * 64; // 64KB

    const hexDump = corpusViewerService.generateHexDump(
      largeData,
      fileName,
      fileSize,
      createdAt,
      maxSize,
    );

    assert.ok(hexDump.includes("FILE: large.bin"));
    assert.ok(hexDump.includes("showing first 64KB"));
    assert.ok(hexDump.includes("file truncated at"));
    assert.ok(hexDump.includes("Total file size: 102400 bytes"));
  });

  test("should handle binary data in hexdump", function () {
    const binaryData = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x41, 0x42]);
    const fileName = "binary.bin";
    const fileSize = binaryData.length;
    const createdAt = new Date();

    const hexDump = corpusViewerService.generateHexDump(
      binaryData,
      fileName,
      fileSize,
      createdAt,
    );

    // Check hex representation
    assert.ok(hexDump.includes("00 01 ff fe 41 42"));
    // Non-printable chars should be replaced with dots
    assert.ok(hexDump.includes("."));
    // Printable chars should appear
    assert.ok(hexDump.includes("AB"));
  });

  test("should read corpus files from directory", async function () {
    const corpusDir =
      "/workspace/.codeforge/fuzzing/example-fuzz-output/corpus";
    const mockEntries = [
      { name: "file1.txt", isFile: () => true },
      { name: "file2.bin", isFile: () => true },
      { name: "subdir", isFile: () => false }, // Should be filtered out
    ];

    const mockStats1 = {
      size: 100,
      birthtime: new Date("2024-01-01"),
      mtime: new Date("2024-01-01"),
    };
    const mockStats2 = {
      size: 200,
      birthtime: new Date("2024-01-02"),
      mtime: new Date("2024-01-02"),
    };

    const mockData1 = Buffer.from("test data 1");
    const mockData2 = Buffer.from("test data 2");

    // Stub filesystem operations
    sandbox.stub(corpusViewerService.fs, "access").resolves();
    sandbox.stub(corpusViewerService.fs, "readdir").resolves(mockEntries);
    const statStub = sandbox.stub(corpusViewerService.fs, "stat");
    statStub.onFirstCall().resolves(mockStats1);
    statStub.onSecondCall().resolves(mockStats2);

    const readFileStub = sandbox.stub(corpusViewerService.fs, "readFile");
    readFileStub.onFirstCall().resolves(mockData1);
    readFileStub.onSecondCall().resolves(mockData2);

    const result = await corpusViewerService.readCorpusFiles(corpusDir);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].name, "file1.txt");
    assert.strictEqual(result[0].size, 100);
    assert.strictEqual(result[1].name, "file2.bin");
    assert.strictEqual(result[1].size, 200);
  });

  test("should return empty array when corpus directory does not exist", async function () {
    const corpusDir = "/nonexistent/corpus";

    // Stub filesystem to throw ENOENT error
    const error = new Error("Directory not found");
    error.code = "ENOENT";
    sandbox.stub(corpusViewerService.fs, "access").rejects(error);

    const result = await corpusViewerService.readCorpusFiles(corpusDir);

    assert.strictEqual(result.length, 0);
  });

  test("should handle errors when reading corpus files", async function () {
    const corpusDir =
      "/workspace/.codeforge/fuzzing/example-fuzz-output/corpus";

    // Stub filesystem to throw a non-ENOENT error
    const error = new Error("Permission denied");
    error.code = "EACCES";
    sandbox.stub(corpusViewerService.fs, "access").rejects(error);

    try {
      await corpusViewerService.readCorpusFiles(corpusDir);
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.ok(err.message.includes("Failed to read corpus directory"));
    }
  });

  test("should sort corpus files by name", async function () {
    const corpusDir =
      "/workspace/.codeforge/fuzzing/example-fuzz-output/corpus";
    const mockEntries = [
      { name: "zebra.txt", isFile: () => true },
      { name: "apple.txt", isFile: () => true },
      { name: "banana.txt", isFile: () => true },
    ];

    const mockStats = {
      size: 100,
      birthtime: new Date(),
      mtime: new Date(),
    };
    const mockData = Buffer.from("test");

    sandbox.stub(corpusViewerService.fs, "access").resolves();
    sandbox.stub(corpusViewerService.fs, "readdir").resolves(mockEntries);
    sandbox.stub(corpusViewerService.fs, "stat").resolves(mockStats);
    sandbox.stub(corpusViewerService.fs, "readFile").resolves(mockData);

    const result = await corpusViewerService.readCorpusFiles(corpusDir);

    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].name, "apple.txt");
    assert.strictEqual(result[1].name, "banana.txt");
    assert.strictEqual(result[2].name, "zebra.txt");
  });

  test("should generate complete corpus viewer content", async function () {
    const workspacePath = "/workspace";
    const fuzzerName = "example-fuzz";
    const corpusDir = path.join(
      workspacePath,
      ".codeforge",
      "fuzzing",
      "example-fuzz-output",
      "corpus",
    );

    const mockEntries = [
      { name: "test1.txt", isFile: () => true },
      { name: "test2.txt", isFile: () => true },
    ];

    const mockStats = {
      size: 10,
      birthtime: new Date("2024-01-01"),
      mtime: new Date("2024-01-01"),
    };

    const mockData = Buffer.from("test data");

    sandbox.stub(corpusViewerService.fs, "access").resolves();
    sandbox.stub(corpusViewerService.fs, "readdir").resolves(mockEntries);
    sandbox.stub(corpusViewerService.fs, "stat").resolves(mockStats);
    sandbox.stub(corpusViewerService.fs, "readFile").resolves(mockData);

    const content = await corpusViewerService.generateCorpusViewerContent(
      workspacePath,
      fuzzerName,
    );

    assert.ok(content.includes("CORPUS VIEWER: example-fuzz"));
    assert.ok(content.includes("File Count:  2"));
    assert.ok(content.includes("CORPUS FILE SUMMARY"));
    assert.ok(content.includes("test1.txt"));
    assert.ok(content.includes("test2.txt"));
    assert.ok(content.includes("HEXDUMPS"));
    assert.ok(content.includes("READ-ONLY VIEW"));
  });

  test("should generate corpus viewer content for empty corpus", async function () {
    const workspacePath = "/workspace";
    const fuzzerName = "example-fuzz";

    // Stub to return no files
    const error = new Error("Directory not found");
    error.code = "ENOENT";
    sandbox.stub(corpusViewerService.fs, "access").rejects(error);

    const content = await corpusViewerService.generateCorpusViewerContent(
      workspacePath,
      fuzzerName,
    );

    assert.ok(content.includes("CORPUS VIEWER: example-fuzz"));
    assert.ok(content.includes("File Count:  0"));
    assert.ok(content.includes("NO CORPUS FILES FOUND"));
    assert.ok(content.includes("Run the fuzzer to generate corpus files"));
  });
});
