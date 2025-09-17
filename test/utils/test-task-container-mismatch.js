#!/usr/bin/env node

/**
 * Test script to reproduce and fix the container name mismatch issue for tasks
 *
 * The issue: When launching a CodeForge task and trying to stop the container,
 * the GUI says it stopped but the container doesn't actually stop because
 * the tracked name doesn't match the actual Docker container name.
 */

const { spawn, exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const path = require("path");

// Import the docker operations module
const dockerOps = require("../../src/core/dockerOperations");

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

async function testTaskContainerTracking() {
  console.log("=== Testing Task Container Name Mismatch Issue ===\n");

  // Step 1: Check initial state
  console.log("Step 1: Checking initial container state...");
  const initialContainers = await getRunningContainers();
  console.log(`  Running containers: ${initialContainers.length}`);
  const trackedContainers = dockerOps.getActiveContainers();
  console.log(`  Tracked containers: ${trackedContainers.length}\n`);

  // Step 2: Simulate a task launch (similar to what taskProvider.js does)
  console.log("Step 2: Simulating task launch with auto-remove...");
  const containerName = dockerOps.generateContainerName(testWorkspace);
  console.log(`  Generated container name: ${containerName}`);

  // This simulates what happens in taskProvider.js
  const dockerProcess = dockerOps.runDockerCommandWithOutput(
    testWorkspace,
    containerName, // This is used as the image name
    "sleep 30", // Long-running command so we can test stopping
    "/bin/bash",
    {
      removeAfterRun: true, // Default for tasks
      enableTracking: true,
      containerType: "task",
    },
  );

  // Wait for container to start
  await delay(2000);

  // Step 3: Check what's actually running vs what's tracked
  console.log("\nStep 3: Checking container state after launch...");
  const runningContainers = await getRunningContainers();
  console.log(`  Running containers: ${runningContainers.length}`);
  runningContainers.forEach((c) => {
    console.log(`    - ID: ${c.id}, Name: ${c.name}`);
  });

  const tracked = dockerOps.getActiveContainers();
  console.log(`  Tracked containers: ${tracked.length}`);
  tracked.forEach((c) => {
    console.log(`    - ID: ${c.id}, Name: ${c.name}`);
  });

  // Step 4: Try to stop the tracked container
  console.log("\nStep 4: Attempting to stop tracked container...");
  if (tracked.length > 0) {
    const trackedId = tracked[0].id;
    console.log(`  Trying to stop container with tracked ID: ${trackedId}`);

    try {
      // This is what happens when the user clicks "stop" in the GUI
      const stopped = await dockerOps.stopContainer(trackedId);
      console.log(`  Stop command result: ${stopped ? "SUCCESS" : "FAILED"}`);
    } catch (error) {
      console.log(`  Stop command error: ${error.message}`);
    }
  }

  // Wait a moment
  await delay(1000);

  // Step 5: Check if container is still running
  console.log("\nStep 5: Checking if container is still running...");
  const stillRunning = await getRunningContainers();
  console.log(`  Running containers: ${stillRunning.length}`);
  stillRunning.forEach((c) => {
    console.log(`    - ID: ${c.id}, Name: ${c.name}`);
  });

  // Step 6: Clean up - kill the process if still running
  console.log("\nStep 6: Cleaning up...");
  if (dockerProcess && !dockerProcess.killed) {
    dockerProcess.kill();
    console.log("  Killed docker process");
  }

  // Try to stop any remaining containers
  for (const container of stillRunning) {
    if (container.name.includes(containerName)) {
      try {
        await execAsync(`docker stop ${container.id}`);
        console.log(`  Stopped container: ${container.id}`);
      } catch (error) {
        console.log(`  Failed to stop container: ${error.message}`);
      }
    }
  }

  await delay(2000);

  // Final check
  console.log("\nFinal Check:");
  const finalContainers = await getRunningContainers();
  console.log(`  Running containers: ${finalContainers.length}`);
  const finalTracked = dockerOps.getActiveContainers();
  console.log(`  Tracked containers: ${finalTracked.length}`);

  // Analysis
  console.log("\n=== ISSUE ANALYSIS ===");
  console.log("The problem is that for auto-remove containers (--rm flag):");
  console.log("1. A temporary ID is used for tracking (e.g., temp_xxx_xxx)");
  console.log(
    "2. Docker creates the container with a random name (no --name flag used)",
  );
  console.log(
    "3. The stop command tries to use the temp ID which doesn't match any real container",
  );
  console.log(
    "4. Result: Container keeps running even though GUI says it stopped\n",
  );

  console.log("=== SOLUTION ===");
  console.log("We need to:");
  console.log("1. Always use --name flag even with --rm (Docker allows this)");
  console.log("2. Track the actual container name/ID that Docker uses");
  console.log("3. Ensure stop commands use the correct identifier\n");
}

// Run the test
testTaskContainerTracking().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
