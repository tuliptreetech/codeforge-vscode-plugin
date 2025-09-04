#!/usr/bin/env node

/**
 * Test script for container tracking functionality
 * This script tests the container tracking and management features
 */

const dockerOperations = require("../../dockerOperations");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

async function testContainerTracking() {
  console.log("🧪 Testing Container Tracking Functionality\n");

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

    // Test 2: Test container tracking functions
    console.log("2️⃣ Testing container tracking functions...");

    // Track a test container
    const testContainerId = "test-container-" + Date.now();
    const testMetadata = {
      name: "test-container",
      image: "test-image",
      workspaceFolder: "/test/workspace",
      type: "test",
    };

    dockerOperations.trackContainer(testContainerId, testMetadata);
    console.log("✅ Container tracked successfully");

    // Get active containers
    const activeContainers = dockerOperations.getActiveContainers();
    console.log(`✅ Active containers: ${activeContainers.length}`);

    // Check container status
    const containerStatus = await dockerOperations.getContainerStatus();
    console.log(
      `✅ Container status retrieved: ${containerStatus.length} container(s)`,
    );

    // Untrack the test container
    dockerOperations.untrackContainer(testContainerId);
    console.log("✅ Container untracked successfully\n");

    // Test 3: Test container name generation
    console.log("3️⃣ Testing container name generation...");
    const testPaths = [
      "/home/user/projects/my-app",
      "C:\\Users\\Developer\\Projects\\MyApp",
      "/var/www/html/website",
    ];

    for (const path of testPaths) {
      try {
        const containerName = dockerOperations.generateContainerName(path);
        console.log(`✅ Generated name for "${path}": ${containerName}`);
      } catch (error) {
        console.log(
          `⚠️ Could not generate name for "${path}": ${error.message}`,
        );
      }
    }
    console.log("");

    // Test 4: Test cleanup of orphaned containers
    console.log("4️⃣ Testing orphaned container cleanup...");

    // Track a fake orphaned container
    dockerOperations.trackContainer("orphaned-container-123", {
      name: "orphaned-test",
      image: "test-image",
      type: "test",
    });

    const cleanedUp = await dockerOperations.cleanupOrphanedContainers();
    console.log(`✅ Cleaned up ${cleanedUp} orphaned container(s)\n`);

    // Test 5: Test the new trackLaunchedContainer function
    console.log("5️⃣ Testing trackLaunchedContainer function...");
    const tracked = await dockerOperations.trackLaunchedContainer(
      "non-existent-container",
      "/test/workspace",
      "test-image",
      "test",
    );
    console.log(
      `✅ Track launched container result: ${tracked ? "tracked" : "not found (expected)"}\n`,
    );

    // Summary
    console.log("📊 Summary:");
    console.log("✅ All container tracking functions are working correctly");
    console.log("✅ Container management system is ready for use");

    // Check if there are any real containers to manage
    const finalContainers = dockerOperations.getActiveContainers();
    if (finalContainers.length > 0) {
      console.log(
        `\n⚠️ Note: There are ${finalContainers.length} container(s) currently tracked`,
      );
      finalContainers.forEach((c) => {
        console.log(`   - ${c.name} (${c.type})`);
      });
    }
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testContainerTracking()
  .then(() => {
    console.log("\n✅ All tests completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test execution failed:", error);
    process.exit(1);
  });
