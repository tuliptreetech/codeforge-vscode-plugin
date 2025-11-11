/**
 * Test script to verify Docker image pull during initialization
 * Run this in the VSCode extension host to see detailed logs
 */

const {
  InitializationDetectionService,
} = require("../../src/core/initializationDetectionService");
const { ResourceManager } = require("../../src/core/resourceManager");
const dockerOperations = require("../../src/core/dockerOperations");

async function testInitializationDockerPull() {
  console.log("=== Testing Docker Pull During Initialization ===\n");

  // Setup
  const testWorkspacePath = "/tmp/codeforge-test-init";
  const extensionPath = __dirname + "/../..";

  console.log(`Test workspace: ${testWorkspacePath}`);
  console.log(`Extension path: ${extensionPath}\n`);

  // Check Docker availability
  console.log("1. Checking Docker availability...");
  const dockerAvailable = await dockerOperations.checkDockerAvailable();
  console.log(`   Docker available: ${dockerAvailable}\n`);

  if (!dockerAvailable) {
    console.error(
      "   ERROR: Docker is not available. Please start Docker and try again.",
    );
    return;
  }

  // Create resource manager and initialization service
  const resourceManager = new ResourceManager(extensionPath);
  const initService = new InitializationDetectionService(resourceManager);

  // Generate container name
  const containerName =
    dockerOperations.generateContainerName(testWorkspacePath);
  console.log(`2. Generated container name: ${containerName}\n`);

  // Check if image already exists
  console.log("3. Checking if image already exists...");
  const imageExistsBefore =
    await dockerOperations.checkImageExists(containerName);
  console.log(`   Image exists: ${imageExistsBefore}\n`);

  // Run initialization with progress tracking
  console.log("4. Running initialization...");
  const result = await initService.initializeProjectWithProgress(
    testWorkspacePath,
    (message, percentage) => {
      console.log(`   [${percentage}%] ${message}`);
    },
  );

  console.log("\n5. Initialization result:");
  console.log(`   Success: ${result.success}`);
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
  console.log("");

  // Check if image exists after initialization
  console.log("6. Checking if image exists after initialization...");
  const imageExistsAfter =
    await dockerOperations.checkImageExists(containerName);
  console.log(`   Image exists: ${imageExistsAfter}\n`);

  if (imageExistsAfter && !imageExistsBefore) {
    console.log("✅ SUCCESS: Docker image was pulled during initialization!");
  } else if (imageExistsAfter && imageExistsBefore) {
    console.log(
      "ℹ️  INFO: Docker image already existed before initialization.",
    );
  } else {
    console.log(
      "❌ FAILURE: Docker image was NOT pulled during initialization!",
    );
    console.log(
      "   This could mean Docker was not available or the pull failed.",
    );
  }

  // List all images to verify
  console.log("\n7. Listing Docker images matching container name...");
  try {
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(
      `docker images --format "{{.Repository}}:{{.Tag}}" | grep "${containerName.split(":")[0]}"`,
    );
    console.log("   Found images:");
    if (stdout.trim()) {
      stdout
        .trim()
        .split("\n")
        .forEach((img) => console.log(`   - ${img}`));
    } else {
      console.log("   (none)");
    }
  } catch (error) {
    console.log("   Could not list images:", error.message);
  }

  console.log("\n=== Test Complete ===");
}

// Run the test
if (require.main === module) {
  testInitializationDockerPull().catch((error) => {
    console.error("Test failed with error:", error);
    process.exit(1);
  });
}

module.exports = { testInitializationDockerPull };
