#!/usr/bin/env node

/**
 * Test script to verify that CodeForge task containers are properly tracked
 * This script tests that containers created by tasks appear in the active containers list
 */

const vscode = require("vscode");
const path = require("path");
const fs = require("fs").promises;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testTaskContainerTracking() {
  console.log("=== Testing Task Container Tracking ===\n");

  try {
    // Get the workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder found");
    }

    // Step 1: Create a test task configuration
    console.log("Step 1: Creating test task configuration...");
    const tasksJsonPath = path.join(
      workspaceFolder.uri.fsPath,
      ".vscode",
      "tasks.json",
    );
    const tasksConfig = {
      version: "2.0.0",
      tasks: [
        {
          type: "codeforge",
          label: "Test Container Tracking",
          command: "echo 'Testing container tracking' && sleep 5",
          problemMatcher: [],
        },
        {
          type: "codeforge",
          label: "Long Running Task",
          command: "echo 'Long running task' && sleep 30",
          problemMatcher: [],
        },
      ],
    };

    // Ensure .vscode directory exists
    const vscodeDir = path.dirname(tasksJsonPath);
    await fs.mkdir(vscodeDir, { recursive: true });
    await fs.writeFile(tasksJsonPath, JSON.stringify(tasksConfig, null, 4));
    console.log("✓ Task configuration created\n");

    // Step 2: Get initial container count
    console.log("Step 2: Getting initial container count...");
    const initialContainers = await vscode.commands.executeCommand(
      "codeforge.listActiveContainers",
    );
    const initialCount = initialContainers ? initialContainers.length : 0;
    console.log(`Initial active containers: ${initialCount}`);
    if (initialContainers && initialContainers.length > 0) {
      initialContainers.forEach((c) => {
        console.log(`  - ${c.name} (${c.type})`);
      });
    }
    console.log();

    // Step 3: Execute a task
    console.log("Step 3: Executing test task...");
    const tasks = await vscode.tasks.fetchTasks({ type: "codeforge" });
    const testTask = tasks.find((t) => t.name === "Test Container Tracking");

    if (!testTask) {
      throw new Error(
        "Test task not found. Make sure the task provider is registered.",
      );
    }

    const execution = await vscode.tasks.executeTask(testTask);
    console.log("✓ Task started\n");

    // Wait a moment for the container to start
    await sleep(2000);

    // Step 4: Check if container is tracked
    console.log("Step 4: Checking if task container is tracked...");
    const activeContainers = await vscode.commands.executeCommand(
      "codeforge.listActiveContainers",
    );
    const activeCount = activeContainers ? activeContainers.length : 0;

    console.log(`Active containers after task start: ${activeCount}`);
    if (activeContainers && activeContainers.length > 0) {
      activeContainers.forEach((c) => {
        console.log(`  - ${c.name} (${c.type})`);
      });
    }

    // Check if we have a new task container
    const taskContainers = activeContainers
      ? activeContainers.filter((c) => c.type === "task")
      : [];
    if (taskContainers.length > 0) {
      console.log(`✓ Found ${taskContainers.length} task container(s)\n`);
    } else {
      console.log("✗ No task containers found\n");
    }

    // Step 5: Start a long-running task
    console.log("Step 5: Starting long-running task...");
    const longTask = tasks.find((t) => t.name === "Long Running Task");
    if (longTask) {
      const longExecution = await vscode.tasks.executeTask(longTask);
      console.log("✓ Long-running task started\n");

      await sleep(2000);

      const updatedContainers = await vscode.commands.executeCommand(
        "codeforge.listActiveContainers",
      );
      const updatedCount = updatedContainers ? updatedContainers.length : 0;
      console.log(`Active containers with both tasks: ${updatedCount}`);
      if (updatedContainers && updatedContainers.length > 0) {
        updatedContainers.forEach((c) => {
          console.log(`  - ${c.name} (${c.type})`);
        });
      }
    }

    // Step 6: Wait for first task to complete
    console.log("\nStep 6: Waiting for first task to complete...");
    await sleep(6000);

    const finalContainers = await vscode.commands.executeCommand(
      "codeforge.listActiveContainers",
    );
    const finalCount = finalContainers ? finalContainers.length : 0;
    console.log(`Active containers after first task completion: ${finalCount}`);
    if (finalContainers && finalContainers.length > 0) {
      finalContainers.forEach((c) => {
        console.log(`  - ${c.name} (${c.type})`);
      });
    }

    // Summary
    console.log("\n=== Test Summary ===");
    console.log(`Initial containers: ${initialCount}`);
    console.log(
      `Max containers during test: ${Math.max(activeCount, updatedCount || 0)}`,
    );
    console.log(`Final containers: ${finalCount}`);
    console.log(
      `Task containers tracked: ${taskContainers.length > 0 ? "YES" : "NO"}`,
    );

    if (taskContainers.length > 0) {
      console.log("\n✓ Task container tracking is working!");
    } else {
      console.log("\n✗ Task container tracking needs attention");
    }
  } catch (error) {
    console.error("Test failed:", error.message);
    console.error(error.stack);
  }
}

// Run the test if this is the main module
if (require.main === module) {
  // This script should be run from within VS Code extension context
  console.log(
    "This test should be run from within VS Code using the extension development host.",
  );
  console.log(
    "Use: node test/utils/test-task-tracking.js from the VS Code terminal",
  );
} else {
  // Export for use in extension
  module.exports = { testTaskContainerTracking };
}

// If running in VS Code context, execute the test
if (typeof vscode !== "undefined" && vscode.window) {
  testTaskContainerTracking()
    .then(() => {
      console.log("\nTest completed");
    })
    .catch((error) => {
      console.error("Test error:", error);
    });
}
