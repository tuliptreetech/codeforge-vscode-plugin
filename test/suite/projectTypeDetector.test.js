const assert = require("assert");
const sinon = require("sinon");
const fs = require("fs").promises;
const {
  detectProjectType,
  getDockerImageForProjectType,
  getProjectTypeAndImage,
  PROJECT_TYPES,
  PROJECT_TYPE_IMAGES,
} = require("../../src/utils/projectTypeDetector");

suite("Project Type Detector", () => {
  let fsAccessStub;

  setup(() => {
    fsAccessStub = sinon.stub(fs, "access");
  });

  teardown(() => {
    sinon.restore();
  });

  suite("detectProjectType", () => {
    test("should detect Rust project when Cargo.toml exists", async () => {
      // Mock Cargo.toml exists
      fsAccessStub.withArgs(sinon.match(/Cargo\.toml$/)).resolves();
      // Mock CMakePresets.json doesn't exist
      fsAccessStub.withArgs(sinon.match(/CMakePresets\.json$/)).rejects();
      // Mock CMakeLists.txt doesn't exist
      fsAccessStub.withArgs(sinon.match(/CMakeLists\.txt$/)).rejects();

      const result = await detectProjectType("/test/workspace");
      assert.strictEqual(result, PROJECT_TYPES.RUST);
    });

    test("should detect CMake project when CMakePresets.json exists", async () => {
      // Mock Cargo.toml doesn't exist
      fsAccessStub.withArgs(sinon.match(/Cargo\.toml$/)).rejects();
      // Mock CMakePresets.json exists
      fsAccessStub.withArgs(sinon.match(/CMakePresets\.json$/)).resolves();

      const result = await detectProjectType("/test/workspace");
      assert.strictEqual(result, PROJECT_TYPES.CMAKE);
    });

    test("should detect CMake project when CMakeLists.txt exists", async () => {
      // Mock Cargo.toml doesn't exist
      fsAccessStub.withArgs(sinon.match(/Cargo\.toml$/)).rejects();
      // Mock CMakePresets.json doesn't exist
      fsAccessStub.withArgs(sinon.match(/CMakePresets\.json$/)).rejects();
      // Mock CMakeLists.txt exists
      fsAccessStub.withArgs(sinon.match(/CMakeLists\.txt$/)).resolves();

      const result = await detectProjectType("/test/workspace");
      assert.strictEqual(result, PROJECT_TYPES.CMAKE);
    });

    test("should prioritize Rust over CMake when both exist", async () => {
      // Mock both Cargo.toml and CMakePresets.json exist
      fsAccessStub.resolves();

      const result = await detectProjectType("/test/workspace");
      assert.strictEqual(result, PROJECT_TYPES.RUST);
    });

    test("should return unknown when no project files found", async () => {
      // Mock all files don't exist
      fsAccessStub.rejects();

      const result = await detectProjectType("/test/workspace");
      assert.strictEqual(result, PROJECT_TYPES.UNKNOWN);
    });

    test("should return unknown when no workspace path provided", async () => {
      const result = await detectProjectType(null);
      assert.strictEqual(result, PROJECT_TYPES.UNKNOWN);
    });
  });

  suite("getDockerImageForProjectType", () => {
    test("should return CMake image for CMake project", () => {
      const image = getDockerImageForProjectType(PROJECT_TYPES.CMAKE);
      assert.strictEqual(image, PROJECT_TYPE_IMAGES[PROJECT_TYPES.CMAKE]);
    });

    test("should return Rust image for Rust project", () => {
      const image = getDockerImageForProjectType(PROJECT_TYPES.RUST);
      assert.strictEqual(image, PROJECT_TYPE_IMAGES[PROJECT_TYPES.RUST]);
    });

    test("should return CMake image as fallback for unknown project", () => {
      const image = getDockerImageForProjectType(PROJECT_TYPES.UNKNOWN);
      assert.strictEqual(image, PROJECT_TYPE_IMAGES[PROJECT_TYPES.CMAKE]);
    });

    test("should return CMake image as fallback for invalid project type", () => {
      const image = getDockerImageForProjectType("invalid");
      assert.strictEqual(image, PROJECT_TYPE_IMAGES[PROJECT_TYPES.CMAKE]);
    });
  });

  suite("getProjectTypeAndImage", () => {
    test("should return Rust project type and Rust image", async () => {
      // Mock Cargo.toml exists
      fsAccessStub.withArgs(sinon.match(/Cargo\.toml$/)).resolves();
      fsAccessStub.withArgs(sinon.match(/CMake/)).rejects();

      const result = await getProjectTypeAndImage("/test/workspace");
      assert.strictEqual(result.projectType, PROJECT_TYPES.RUST);
      assert.strictEqual(
        result.dockerImage,
        PROJECT_TYPE_IMAGES[PROJECT_TYPES.RUST],
      );
    });

    test("should return CMake project type and CMake image", async () => {
      // Mock CMakePresets.json exists
      fsAccessStub.withArgs(sinon.match(/Cargo\.toml$/)).rejects();
      fsAccessStub.withArgs(sinon.match(/CMakePresets\.json$/)).resolves();

      const result = await getProjectTypeAndImage("/test/workspace");
      assert.strictEqual(result.projectType, PROJECT_TYPES.CMAKE);
      assert.strictEqual(
        result.dockerImage,
        PROJECT_TYPE_IMAGES[PROJECT_TYPES.CMAKE],
      );
    });

    test("should return unknown project type and CMake image as fallback", async () => {
      // Mock all files don't exist
      fsAccessStub.rejects();

      const result = await getProjectTypeAndImage("/test/workspace");
      assert.strictEqual(result.projectType, PROJECT_TYPES.UNKNOWN);
      assert.strictEqual(
        result.dockerImage,
        PROJECT_TYPE_IMAGES[PROJECT_TYPES.CMAKE],
      );
    });
  });

  suite("PROJECT_TYPE_IMAGES", () => {
    test("should have images defined for all project types", () => {
      assert.ok(PROJECT_TYPE_IMAGES[PROJECT_TYPES.CMAKE]);
      assert.ok(PROJECT_TYPE_IMAGES[PROJECT_TYPES.RUST]);
    });

    test("should have valid GHCR image URLs", () => {
      assert.ok(
        PROJECT_TYPE_IMAGES[PROJECT_TYPES.CMAKE].startsWith("ghcr.io/"),
      );
      assert.ok(PROJECT_TYPE_IMAGES[PROJECT_TYPES.RUST].startsWith("ghcr.io/"));
    });
  });
});
