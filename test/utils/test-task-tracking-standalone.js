#!/usr/bin/env node

/**
 * Standalone test script for task container tracking
 * Tests the Docker container tracking functionality without requiring VS Code API
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs").promises;

// Import the dockerOperations module
const dockerOperations = require("../../src/core/dockerOperations");

// Test configuration
const TEST_WORKSPACE = path.join(__dirname, "../../test-project");
const TEST_IMAGE = "alpine:latest";

// Color codes for output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
  gray: "\x1b[90m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulates a task by running a Docker container with tracking
 */
function simulateTask(taskName, command, duration, options = {}) {
  return new Promise((resolve, reject) => {
    log(`Starting task: ${taskName}`, "blue");

    const containerName = `test_task_${taskName.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;

    // Use runDockerCommandWithOutput to simulate what tasks do
    const dockerProcess = dockerOperations.runDockerCommandWithOutput(
      TEST_WORKSPACE,
      TEST_IMAGE,
      command,
      "/bin/sh",
      {
        removeAfterRun: options.removeAfterRun !== false,
        enableTracking: true,
        containerType: "task",
        containerName: containerName,
        mountWorkspace: false,
        additionalArgs: [],
      },
    );

    let output = "";
    let errorOutput = "";

    dockerProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    dockerProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    dockerProcess.on("close", (code) => {
      if (code === 0) {
        log(`✓ Task "${taskName}" completed successfully`, "green");
        resolve({
          success: true,
          output,
          containerName,
          duration: duration,
        });
      } else {
        log(`✗ Task "${taskName}" failed with exit code ${code}`, "red");
        if (errorOutput) {
          log(`  Error: ${errorOutput}`, "red");
        }
        resolve({
          success: false,
          error: errorOutput || `Exit code ${code}`,
          containerName,
          duration: duration,
        });
      }
    });

    dockerProcess.on("error", (error) => {
      log(`✗ Task "${taskName}" process error: ${error.message}`, "red");
      reject(error);
    });
  });
}

/**
 * Main test function
 */
async function runTaskTrackingTests() {
  log("\n=== Task Container Tracking Test Suite ===\n", "yellow");

  const testResults = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  try {
    // Test 1: Initial state check
    log("Test 1: Checking initial container tracking state...", "blue");
    const initialContainers = dockerOperations.getActiveContainers();
    log(`  Initial tracked containers: ${initialContainers.length}`, "gray");
    if (initialContainers.length > 0) {
      initialContainers.forEach((c) => {
        log(`    - ${c.name} (${c.type})`, "gray");
      });
    }
    testResults.tests.push({
      name: "Initial state check",
      passed: true,
      details: `Found ${initialContainers.length} initially tracked containers`,
    });
    testResults.passed++;
    log("✓ Test 1 passed\n", "green");

    // Test 2: Single short-lived task
    log("Test 2: Testing single short-lived task...", "blue");
    const shortTask = await simulateTask(
      "Short Task",
      'echo "Short task running" && sleep 2 && echo "Short task done"',
      2000,
    );

    // Check if container was tracked during execution
    await sleep(500); // Give it time to register
    const duringShortTask = dockerOperations.getActiveContainers();
    const shortTaskTracked = duringShortTask.some(
      (c) => c.type === "task" && c.name.includes("short_task"),
    );

    if (shortTaskTracked) {
      log("  ✓ Short task container was tracked during execution", "green");
      testResults.tests.push({
        name: "Short-lived task tracking",
        passed: true,
        details: "Container was properly tracked during execution",
      });
      testResults.passed++;
    } else {
      log("  ✗ Short task container was not tracked", "red");
      testResults.tests.push({
        name: "Short-lived task tracking",
        passed: false,
        details: "Container was not tracked during execution",
      });
      testResults.failed++;
    }

    // Wait for task to complete and check if untracked
    await sleep(3000);
    const afterShortTask = dockerOperations.getActiveContainers();
    const shortTaskStillTracked = afterShortTask.some(
      (c) => c.type === "task" && c.name.includes("short_task"),
    );

    if (!shortTaskStillTracked) {
      log("  ✓ Short task container was untracked after completion", "green");
      testResults.tests.push({
        name: "Short task cleanup",
        passed: true,
        details: "Container was properly untracked after completion",
      });
      testResults.passed++;
    } else {
      log("  ✗ Short task container is still tracked after completion", "red");
      testResults.tests.push({
        name: "Short task cleanup",
        passed: false,
        details: "Container was not untracked after completion",
      });
      testResults.failed++;
    }
    log("✓ Test 2 completed\n", "green");

    // Test 3: Long-running task
    log("Test 3: Testing long-running task...", "blue");
    const longTaskPromise = simulateTask(
      "Long Running Task",
      'echo "Long task started" && sleep 10 && echo "Long task done"',
      10000,
    );

    // Wait a bit for the task to start
    await sleep(2000);

    const duringLongTask = dockerOperations.getActiveContainers();
    const longTaskTracked = duringLongTask.some(
      (c) => c.type === "task" && c.name.includes("long_running_task"),
    );

    if (longTaskTracked) {
      log("  ✓ Long-running task container is being tracked", "green");
      testResults.tests.push({
        name: "Long-running task tracking",
        passed: true,
        details: "Container is properly tracked during execution",
      });
      testResults.passed++;
    } else {
      log("  ✗ Long-running task container is not tracked", "red");
      testResults.tests.push({
        name: "Long-running task tracking",
        passed: false,
        details: "Container is not tracked during execution",
      });
      testResults.failed++;
    }

    // Test 4: Multiple simultaneous tasks
    log("\nTest 4: Testing multiple simultaneous tasks...", "blue");
    const task1Promise = simulateTask(
      "Parallel Task 1",
      'echo "Task 1 running" && sleep 5',
      5000,
    );
    const task2Promise = simulateTask(
      "Parallel Task 2",
      'echo "Task 2 running" && sleep 5',
      5000,
    );
    const task3Promise = simulateTask(
      "Parallel Task 3",
      'echo "Task 3 running" && sleep 5',
      5000,
    );

    // Wait for all parallel tasks to start
    await sleep(2000);

    const duringParallelTasks = dockerOperations.getActiveContainers();
    const parallelTaskCount = duringParallelTasks.filter(
      (c) => c.type === "task" && c.name.includes("parallel_task"),
    ).length;

    log(
      `  Found ${parallelTaskCount} parallel task containers tracked`,
      "gray",
    );

    if (parallelTaskCount >= 3) {
      log("  ✓ All parallel tasks are being tracked", "green");
      testResults.tests.push({
        name: "Multiple simultaneous tasks",
        passed: true,
        details: `${parallelTaskCount} parallel tasks tracked successfully`,
      });
      testResults.passed++;
    } else {
      log(
        `  ✗ Only ${parallelTaskCount} of 3 parallel tasks are tracked`,
        "red",
      );
      testResults.tests.push({
        name: "Multiple simultaneous tasks",
        passed: false,
        details: `Only ${parallelTaskCount} of 3 parallel tasks tracked`,
      });
      testResults.failed++;
    }

    // Wait for all tasks to complete
    log("\n  Waiting for all tasks to complete...", "gray");
    await Promise.all([
      longTaskPromise,
      task1Promise,
      task2Promise,
      task3Promise,
    ]);

    // Give some time for cleanup
    await sleep(2000);

    // Test 5: Verify all tasks are cleaned up
    log("\nTest 5: Verifying task cleanup...", "blue");
    const finalContainers = dockerOperations.getActiveContainers();
    const remainingTaskContainers = finalContainers.filter(
      (c) =>
        c.type === "task" &&
        (c.name.includes("short_task") ||
          c.name.includes("long_running_task") ||
          c.name.includes("parallel_task")),
    );

    if (remainingTaskContainers.length === 0) {
      log("  ✓ All task containers have been properly cleaned up", "green");
      testResults.tests.push({
        name: "Task cleanup verification",
        passed: true,
        details: "All task containers were properly untracked",
      });
      testResults.passed++;
    } else {
      log(
        `  ✗ ${remainingTaskContainers.length} task containers are still tracked`,
        "red",
      );
      remainingTaskContainers.forEach((c) => {
        log(`    - ${c.name}`, "red");
      });
      testResults.tests.push({
        name: "Task cleanup verification",
        passed: false,
        details: `${remainingTaskContainers.length} containers still tracked`,
      });
      testResults.failed++;
    }

    // Test 6: Container with custom tracking
    log(
      "\nTest 6: Testing container with persistent tracking (no auto-remove)...",
      "blue",
    );
    const persistentTaskPromise = simulateTask(
      "Persistent Task",
      'echo "Persistent task"',
      1000,
      { removeAfterRun: false },
    );

    await sleep(500);
    const duringPersistent = dockerOperations.getActiveContainers();
    const persistentTracked = duringPersistent.some(
      (c) => c.type === "task" && c.name.includes("persistent_task"),
    );

    if (persistentTracked) {
      log("  ✓ Persistent task container is tracked", "green");
    } else {
      log("  ✗ Persistent task container is not tracked", "red");
    }

    await persistentTaskPromise;
    await sleep(2000);

    const afterPersistent = dockerOperations.getActiveContainers();
    const persistentStillTracked = afterPersistent.some(
      (c) => c.type === "task" && c.name.includes("persistent_task"),
    );

    // For non-auto-remove containers, they should be untracked after completion
    // even though the container itself persists
    if (!persistentStillTracked) {
      log(
        "  ✓ Persistent task container was untracked after completion",
        "green",
      );
      testResults.tests.push({
        name: "Persistent container tracking",
        passed: true,
        details: "Container was properly untracked even without auto-remove",
      });
      testResults.passed++;
    } else {
      log("  ✗ Persistent task container is still tracked", "red");
      testResults.tests.push({
        name: "Persistent container tracking",
        passed: false,
        details: "Container was not untracked after completion",
      });
      testResults.failed++;
    }

    // Clean up any persistent containers
    try {
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);
      await execAsync(
        'docker rm -f $(docker ps -a --filter "name=test_task_persistent" -q) 2>/dev/null || true',
      );
    } catch (e) {
      // Ignore cleanup errors
    }
  } catch (error) {
    log(`\n✗ Test suite error: ${error.message}`, "red");
    console.error(error.stack);
    testResults.failed++;
  }

  // Print summary
  log("\n=== Test Summary ===", "yellow");
  log(`Total tests: ${testResults.tests.length}`, "blue");
  log(`Passed: ${testResults.passed}`, "green");
  log(
    `Failed: ${testResults.failed}`,
    testResults.failed > 0 ? "red" : "green",
  );

  log("\nDetailed Results:", "yellow");
  testResults.tests.forEach((test, index) => {
    const icon = test.passed ? "✓" : "✗";
    const color = test.passed ? "green" : "red";
    log(`  ${index + 1}. ${icon} ${test.name}`, color);
    log(`     ${test.details}`, "gray");
  });

  // Final verdict
  if (testResults.failed === 0) {
    log(
      "\n✓ All tests passed! Task container tracking is working correctly.",
      "green",
    );
  } else {
    log(
      "\n✗ Some tests failed. Task container tracking needs attention.",
      "red",
    );
  }

  // Return exit code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the tests
log("Starting Task Container Tracking Tests...", "yellow");
log(
  "This test will create and track Docker containers to verify the tracking system.\n",
  "gray",
);

// Check if Docker is available
const { exec } = require("child_process");
exec("docker --version", (error) => {
  if (error) {
    log(
      "✗ Docker is not available. Please ensure Docker is installed and running.",
      "red",
    );
    process.exit(1);
  } else {
    // Pull the test image if needed
    log("Ensuring test image is available...", "gray");
    exec(`docker pull ${TEST_IMAGE}`, (pullError) => {
      if (pullError) {
        log(
          `Warning: Could not pull ${TEST_IMAGE}, will try to use local image`,
          "yellow",
        );
      }
      // Run the tests
      runTaskTrackingTests();
    });
  }
});
