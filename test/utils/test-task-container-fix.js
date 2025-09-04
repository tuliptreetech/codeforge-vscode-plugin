#!/usr/bin/env node

/**
 * Test script to verify the fix for container name mismatch issue
 *
 * This test verifies that:
 * 1. Containers are created with proper names even when using --rm
 * 2. The tracking system uses the actual container name
 * 3. Stop commands successfully stop the containers
 */

const { spawn, exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const path = require("path");

// Import the docker operations module
const dockerOps = require("../../dockerOperations");

// Test workspace path
const testWorkspace = path.resolve(__dirname, "../..");

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRunningContainers() {
  try {
    const { stdout } = await execAsync(
      'docker ps --format "{{.ID}}\\t{{.Names}}"',
    );
    return stdout
      .trim()
      .split("\n")
      .filter((line) => line)
      .map((line) => {
        const [id, name] = line.split("\t");
        return { id, name };
      });
  } catch (error) {
    console.error("Error getting running containers:", error.message);
    return [];
  }
}

async function testTaskContainerFix() {
  console.log("=== Testing Task Container Name Fix ===\n");

  let testPassed = true;
  let dockerProcess = null;

  try {
    // Step 1: Check initial state
    console.log("Step 1: Checking initial container state...");
    const initialContainers = await getRunningContainers();
    console.log(
      `  Running containers before test: ${initialContainers.length}`,
    );
    const trackedContainers = dockerOps.getActiveContainers();
    console.log(
      `  Tracked containers before test: ${trackedContainers.length}\n`,
    );

    // Step 2: Launch a task with auto-remove (simulating what taskProvider.js does)
    console.log("Step 2: Launching task with auto-remove (--rm flag)...");
    const containerName = dockerOps.generateContainerName(testWorkspace);
    console.log(`  Generated container/image name: ${containerName}`);

    dockerProcess = dockerOps.runDockerCommandWithOutput(
      testWorkspace,
      containerName, // This is used as the image name
      "sleep 30", // Long-running command so we can test stopping
      "/bin/bash",
      {
        removeAfterRun: true, // This adds --rm flag
        enableTracking: true,
        containerType: "task",
      },
    );

    // Wait for container to start
    await delay(2000);

    // Step 3: Verify container is running with correct name
    console.log("\nStep 3: Verifying container state...");
    const runningContainers = await getRunningContainers();
    const ourContainer = runningContainers.find(
      (c) => c.name.includes(containerName) && c.name.includes("task"),
    );

    if (ourContainer) {
      console.log(`  ✓ Container is running with name: ${ourContainer.name}`);
    } else {
      console.log(`  ✗ Container not found with expected name pattern`);
      console.log(`    Running containers:`);
      runningContainers.forEach((c) => {
        console.log(`      - ${c.name} (${c.id})`);
      });
      testPassed = false;
    }

    // Step 4: Verify tracking is using correct identifier
    console.log("\nStep 4: Checking tracking system...");
    const tracked = dockerOps.getActiveContainers();
    console.log(`  Tracked containers: ${tracked.length}`);

    if (tracked.length > 0) {
      const trackedContainer = tracked[0];
      console.log(`  Tracked ID: ${trackedContainer.id}`);
      console.log(`  Tracked Name: ${trackedContainer.name}`);

      // The tracked ID should now be the container name, not a temp ID
      if (!trackedContainer.id.startsWith("temp_")) {
        console.log(`  ✓ Tracking uses actual container name (not temp ID)`);
      } else {
        console.log(`  ✗ Still using temporary ID for tracking`);
        testPassed = false;
      }
    } else {
      console.log(`  ✗ No containers being tracked`);
      testPassed = false;
    }

    // Step 5: Test stopping the container using tracked ID
    console.log("\nStep 5: Testing container stop functionality...");
    if (tracked.length > 0) {
      const trackedId = tracked[0].id;
      console.log(`  Attempting to stop container: ${trackedId}`);

      const stopResult = await dockerOps.stopContainer(trackedId, false); // Don't remove, just stop

      if (stopResult) {
        console.log(`  ✓ Container stop command succeeded`);
      } else {
        console.log(`  ✗ Container stop command failed`);
        testPassed = false;
      }

      // Wait for container to stop
      await delay(2000);

      // Verify container is stopped
      const stillRunning = await getRunningContainers();
      const stillExists = stillRunning.find(
        (c) => c.name.includes(containerName) && c.name.includes("task"),
      );

      if (!stillExists) {
        console.log(`  ✓ Container successfully stopped`);
      } else {
        console.log(`  ✗ Container is still running after stop command`);
        testPassed = false;
      }
    }

    // Step 6: Test with multiple simultaneous tasks
    console.log("\nStep 6: Testing multiple simultaneous tasks...");
    const processes = [];
    const expectedNames = [];

    for (let i = 0; i < 3; i++) {
      const process = dockerOps.runDockerCommandWithOutput(
        testWorkspace,
        containerName,
        `sleep ${10 + i * 2}`, // Different sleep times
        "/bin/bash",
        {
          removeAfterRun: true,
          enableTracking: true,
          containerType: "task",
        },
      );
      processes.push(process);
      expectedNames.push(`${containerName}_task_`);
    }

    await delay(2000);

    const multiTracked = dockerOps.getActiveContainers();
    console.log(`  Tracked containers: ${multiTracked.length}`);

    if (multiTracked.length >= 3) {
      console.log(`  ✓ All ${processes.length} tasks are tracked`);

      // Test stopping all tracked containers
      console.log(`  Stopping all tracked containers...`);
      const results = await dockerOps.terminateAllContainers();
      console.log(
        `  Termination results: ${results.succeeded} succeeded, ${results.failed} failed`,
      );

      if (results.succeeded >= 3) {
        console.log(`  ✓ Successfully stopped all task containers`);
      } else {
        console.log(`  ✗ Failed to stop some containers`);
        testPassed = false;
      }
    } else {
      console.log(
        `  ✗ Not all tasks were tracked (expected 3+, got ${multiTracked.length})`,
      );
      testPassed = false;
    }

    // Clean up any remaining processes
    processes.forEach((p) => {
      if (p && !p.killed) p.kill();
    });
  } catch (error) {
    console.error(`\nTest error: ${error.message}`);
    testPassed = false;
  } finally {
    // Clean up
    console.log("\nStep 7: Final cleanup...");

    if (dockerProcess && !dockerProcess.killed) {
      dockerProcess.kill();
    }

    // Stop any remaining test containers
    try {
      const remaining = await getRunningContainers();
      for (const container of remaining) {
        if (
          container.name.includes("codeforge") &&
          container.name.includes("task")
        ) {
          await execAsync(`docker stop ${container.id}`).catch(() => {});
        }
      }
    } catch (error) {
      console.error(`Cleanup error: ${error.message}`);
    }

    await delay(2000);

    // Final state check
    console.log("\nFinal State:");
    const finalContainers = await getRunningContainers();
    const finalTracked = dockerOps.getActiveContainers();
    console.log(`  Running containers: ${finalContainers.length}`);
    console.log(`  Tracked containers: ${finalTracked.length}`);

    // Test result
    console.log("\n" + "=".repeat(50));
    if (testPassed) {
      console.log("✅ TEST PASSED: Container name mismatch issue is FIXED!");
      console.log("\nKey improvements verified:");
      console.log("  • Containers use proper names even with --rm flag");
      console.log("  • Tracking system uses actual container names");
      console.log("  • Stop commands successfully terminate containers");
      console.log("  • Multiple simultaneous tasks are properly managed");
    } else {
      console.log("❌ TEST FAILED: Issues still exist");
      console.log("\nCheck the test output above for details.");
    }
    console.log("=".repeat(50));

    process.exit(testPassed ? 0 : 1);
  }
}

// Run the test
testTaskContainerFix().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
