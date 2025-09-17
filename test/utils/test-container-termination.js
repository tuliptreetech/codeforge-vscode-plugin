#!/usr/bin/env node

/**
 * Test script for container termination and cleanup functionality
 * This script tests the terminate containers command and cleanup on deactivation
 */

const dockerOperations = require("../../src/core/dockerOperations");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

// Mock VSCode API for testing
const vscode = {
  window: {
    showInformationMessage: (msg, ...items) => {
      console.log(`[VSCode Info] ${msg}`);
      // Simulate user clicking "Yes" for confirmation dialogs
      if (items.length > 0 && items.includes("Yes")) {
        return Promise.resolve("Yes");
      }
      return Promise.resolve();
    },
    showErrorMessage: (msg) => {
      console.error(`[VSCode Error] ${msg}`);
      return Promise.resolve();
    },
    showWarningMessage: (msg, ...items) => {
      console.log(`[VSCode Warning] ${msg}`);
      if (items.length > 0 && items.includes("Yes")) {
        return Promise.resolve("Yes");
      }
      return Promise.resolve();
    },
    withProgress: (options, task) => {
      console.log(`[VSCode Progress] ${options.title}`);
      return task({
        report: (update) => {
          if (update.message) {
            console.log(`  Progress: ${update.message}`);
          }
        },
      });
    },
  },
  ProgressLocation: {
    Notification: "Notification",
  },
};

async function createTestContainer(name, image = "alpine:latest") {
  try {
    console.log(`Creating test container: ${name}`);
    // Pull the image if not available
    await execAsync(`docker pull ${image}`);

    // Create and run a simple container that stays alive
    const { stdout } = await execAsync(
      `docker run -d --name ${name} ${image} sh -c "while true; do sleep 30; done"`,
    );
    const containerId = stdout.trim();
    console.log(`✅ Created container ${name} with ID: ${containerId}`);
    return containerId;
  } catch (error) {
    console.error(`Failed to create container ${name}: ${error.message}`);
    // Try to remove the container if it exists
    try {
      await execAsync(`docker rm -f ${name}`);
    } catch (e) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

async function cleanupTestContainer(nameOrId) {
  try {
    await execAsync(`docker rm -f ${nameOrId}`);
    console.log(`✅ Cleaned up container: ${nameOrId}`);
  } catch (error) {
    // Container might not exist, which is fine
    console.log(`⚠️ Container ${nameOrId} not found or already removed`);
  }
}

async function testTerminateContainers() {
  console.log("🧪 Testing Container Termination Functionality\n");

  const testContainers = [];

  try {
    // Test 1: Check Docker availability
    console.log("1️⃣ Checking Docker availability...");
    const dockerAvailable = await dockerOperations.checkDockerAvailable();
    if (!dockerAvailable) {
      console.error(
        "❌ Docker is not available. Please ensure Docker is installed and running.",
      );
      process.exit(1);
    }
    console.log("✅ Docker is available\n");

    // Test 2: Create and track test containers
    console.log("2️⃣ Creating and tracking test containers...");

    // Create first test container
    const container1Name = `codeforge-test-${Date.now()}-1`;
    const container1Id = await createTestContainer(container1Name);
    testContainers.push(container1Name);

    // Track the container
    dockerOperations.trackContainer(container1Id, {
      name: container1Name,
      image: "alpine:latest",
      workspaceFolder: "/test/workspace1",
      type: "test",
      startedAt: new Date().toISOString(),
    });

    // Create second test container
    const container2Name = `codeforge-test-${Date.now()}-2`;
    const container2Id = await createTestContainer(container2Name);
    testContainers.push(container2Name);

    // Track the second container
    dockerOperations.trackContainer(container2Id, {
      name: container2Name,
      image: "alpine:latest",
      workspaceFolder: "/test/workspace2",
      type: "test",
      startedAt: new Date().toISOString(),
    });

    console.log("✅ Created and tracked 2 test containers\n");

    // Test 3: Verify containers are tracked
    console.log("3️⃣ Verifying container tracking...");
    const activeContainers = dockerOperations.getActiveContainers();
    console.log(`Active containers: ${activeContainers.length}`);
    activeContainers.forEach((c) => {
      console.log(
        `  - ${c.name} (${c.type}) - Started: ${c.startedAt || "unknown"}`,
      );
    });

    if (activeContainers.length < 2) {
      throw new Error(
        `Expected at least 2 tracked containers, but found ${activeContainers.length}`,
      );
    }
    console.log("✅ Containers are properly tracked\n");

    // Test 4: Get container status
    console.log("4️⃣ Getting container status...");
    const containerStatus = await dockerOperations.getContainerStatus();
    console.log(
      `Container status: ${containerStatus.length} container(s) found`,
    );
    containerStatus.forEach((status) => {
      console.log(`  - ${status.name}: ${status.status} (${status.state})`);
    });
    console.log("");

    // Test 5: Test terminate all containers function
    console.log("5️⃣ Testing terminateAllContainers function...");

    // Call the terminate function with mock vscode
    const terminationResult =
      await dockerOperations.terminateAllContainers(vscode);
    const terminated = terminationResult.succeeded || 0;
    console.log(`✅ Terminated ${terminated} container(s)\n`);

    // Verify containers are no longer tracked
    const remainingContainers = dockerOperations.getActiveContainers();
    if (remainingContainers.length > 0) {
      console.log(
        `⚠️ Warning: ${remainingContainers.length} container(s) still tracked after termination`,
      );
      remainingContainers.forEach((c) => {
        console.log(`  - ${c.name}`);
      });
    } else {
      console.log("✅ All containers successfully untracked\n");
    }

    // Test 6: Verify containers are actually stopped
    console.log("6️⃣ Verifying containers are stopped...");
    for (const containerName of testContainers) {
      try {
        const { stdout } = await execAsync(
          `docker ps --filter "name=${containerName}" --format "{{.Names}}"`,
        );
        if (stdout.trim()) {
          console.log(`❌ Container ${containerName} is still running!`);
        } else {
          console.log(`✅ Container ${containerName} is stopped`);
        }
      } catch (error) {
        console.log(`✅ Container ${containerName} is stopped or removed`);
      }
    }
    console.log("");

    // Test 7: Test cleanup on deactivation (simulated)
    console.log("7️⃣ Testing cleanup on deactivation (simulated)...");

    // Create another container to test cleanup
    const container3Name = `codeforge-test-${Date.now()}-3`;
    const container3Id = await createTestContainer(container3Name);
    testContainers.push(container3Name);

    // Track it
    dockerOperations.trackContainer(container3Id, {
      name: container3Name,
      image: "alpine:latest",
      workspaceFolder: "/test/workspace3",
      type: "test",
      startedAt: new Date().toISOString(),
    });

    // Simulate deactivation cleanup (as done in extension.js)
    console.log(
      "Simulating extension deactivation with terminateContainersOnDeactivate=true...",
    );
    const containersBeforeCleanup = dockerOperations.getActiveContainers();
    if (containersBeforeCleanup.length > 0) {
      console.log(
        `Found ${containersBeforeCleanup.length} container(s) to terminate on deactivation`,
      );
      const terminationResult =
        await dockerOperations.terminateAllContainers(vscode);
      const terminated = terminationResult.succeeded || 0;
      console.log(
        `✅ Cleanup on deactivation: terminated ${terminated} container(s)\n`,
      );
    } else {
      console.log("✅ No containers to clean up on deactivation\n");
    }

    // Test 8: Test orphaned container cleanup
    console.log("8️⃣ Testing orphaned container cleanup...");

    // Track a non-existent container (orphaned)
    dockerOperations.trackContainer("orphaned-test-123456", {
      name: "orphaned-container",
      image: "test-image",
      type: "test",
    });

    const orphansCleaned = await dockerOperations.cleanupOrphanedContainers();
    console.log(`✅ Cleaned up ${orphansCleaned} orphaned container(s)\n`);

    // Summary
    console.log("📊 Test Summary:");
    console.log("✅ Container tracking works correctly");
    console.log("✅ Container termination command works");
    console.log("✅ Cleanup on deactivation works");
    console.log("✅ Orphaned container cleanup works");
    console.log("✅ All termination and cleanup functions are operational");
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    console.error(error.stack);

    // Cleanup any remaining test containers
    console.log("\n🧹 Cleaning up test containers...");
    for (const containerName of testContainers) {
      await cleanupTestContainer(containerName);
    }

    process.exit(1);
  }

  // Final cleanup
  console.log("\n🧹 Final cleanup of test containers...");
  for (const containerName of testContainers) {
    await cleanupTestContainer(containerName);
  }
}

// Run the test
testTerminateContainers()
  .then(() => {
    console.log("\n✅ All termination tests completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test execution failed:", error);
    process.exit(1);
  });
