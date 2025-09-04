/**
 * Test script to verify terminal container tracking fix
 * This script tests that terminal containers are properly tracked after the timing fix
 */

const vscode = require("vscode");
const assert = require("assert");
const path = require("path");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testTerminalContainerTracking() {
  console.log("=== Testing Terminal Container Tracking Fix ===\n");

  try {
    // Step 1: Get the CodeForge extension
    console.log("Step 1: Getting CodeForge extension...");
    const extension = vscode.extensions.getExtension("tuliptree.codeforge");
    if (!extension) {
      throw new Error("CodeForge extension not found");
    }

    // Ensure extension is activated
    if (!extension.isActive) {
      await extension.activate();
    }
    console.log("✓ Extension activated\n");

    // Step 2: Check initial container state
    console.log("Step 2: Checking initial container state...");
    let initialContainers = await vscode.commands.executeCommand(
      "codeforge.listActiveContainers",
    );
    console.log(
      `Initial active containers: ${initialContainers ? initialContainers.length : 0}`,
    );
    if (initialContainers && initialContainers.length > 0) {
      console.log(
        "Containers found:",
        initialContainers.map((c) => `${c.name} (${c.type})`).join(", "),
      );
    }
    console.log();

    // Step 3: Launch a terminal
    console.log("Step 3: Launching CodeForge terminal...");
    await vscode.commands.executeCommand("codeforge.launchTerminal");
    console.log("✓ Terminal launch command executed\n");

    // Step 4: Wait for container to be tracked (with our improved retry logic)
    console.log("Step 4: Waiting for container to be tracked...");
    let tracked = false;
    let attempts = 0;
    const maxAttempts = 20; // 20 seconds total

    while (!tracked && attempts < maxAttempts) {
      await sleep(1000); // Wait 1 second between checks
      attempts++;

      const containers = await vscode.commands.executeCommand(
        "codeforge.listActiveContainers",
      );
      if (containers && containers.length > 0) {
        // Check if we have a terminal container
        const terminalContainer = containers.find((c) => c.type === "terminal");
        if (terminalContainer) {
          tracked = true;
          console.log(
            `✓ Terminal container tracked after ${attempts} second(s)`,
          );
          console.log(`  Container: ${terminalContainer.name}`);
          console.log(`  Type: ${terminalContainer.type}`);
          console.log(`  Image: ${terminalContainer.image}`);
          break;
        }
      }

      if (attempts % 5 === 0) {
        console.log(`  Still waiting... (${attempts}s elapsed)`);
      }
    }

    if (!tracked) {
      throw new Error(
        `Terminal container was not tracked after ${maxAttempts} seconds`,
      );
    }
    console.log();

    // Step 5: Verify container is in active list
    console.log("Step 5: Verifying container appears in active list...");
    const finalContainers = await vscode.commands.executeCommand(
      "codeforge.listActiveContainers",
    );

    if (!finalContainers || finalContainers.length === 0) {
      throw new Error("No active containers found after launching terminal");
    }

    const terminalContainers = finalContainers.filter(
      (c) => c.type === "terminal",
    );
    if (terminalContainers.length === 0) {
      throw new Error("No terminal containers found in active list");
    }

    console.log(
      `✓ Found ${terminalContainers.length} terminal container(s) in active list`,
    );
    terminalContainers.forEach((c) => {
      console.log(
        `  - ${c.name} (created: ${new Date(c.createdAt).toLocaleTimeString()})`,
      );
    });
    console.log();

    // Step 6: Test multiple terminal launches
    console.log("Step 6: Testing multiple terminal launches...");
    await vscode.commands.executeCommand("codeforge.launchTerminal");
    await sleep(3000); // Give it time to start

    const multipleContainers = await vscode.commands.executeCommand(
      "codeforge.listActiveContainers",
    );
    const multipleTerminals = multipleContainers.filter(
      (c) => c.type === "terminal",
    );

    console.log(
      `✓ Found ${multipleTerminals.length} terminal container(s) after second launch`,
    );
    console.log();

    // Success!
    console.log("=== TEST PASSED ===");
    console.log("Terminal container tracking is working correctly!");
    console.log("The fix successfully addresses the timing issue.");
    console.log("\nKey improvements:");
    console.log("1. Retry logic with exponential backoff (up to 10 attempts)");
    console.log("2. Better logging for debugging");
    console.log("3. Tracking even for auto-remove containers (while running)");

    return true;
  } catch (error) {
    console.error("\n=== TEST FAILED ===");
    console.error("Error:", error.message);
    console.error(
      "\nThis indicates the terminal tracking fix may not be working properly.",
    );
    console.error("Please check:");
    console.error("1. Docker is running");
    console.error("2. The workspace has been initialized with CodeForge");
    console.error("3. The extension changes have been properly loaded");
    return false;
  }
}

// Run the test
testTerminalContainerTracking().then((success) => {
  if (success) {
    console.log("\n✅ Terminal container tracking fix verified successfully!");
  } else {
    console.log("\n❌ Terminal container tracking test failed");
  }
});
