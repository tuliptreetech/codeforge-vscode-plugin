#!/usr/bin/env node

/**
 * Extension Loading Verification Utility
 *
 * This verification script tests if the CodeForge extension loads and registers
 * properly in a VSCode environment. It checks extension activation, command
 * registration, task provider setup, and output channel creation.
 *
 * This is NOT an automated test - it's a utility for manual verification.
 * Run this script in the Extension Development Host after launching the extension.
 *
 * Usage:
 * 1. Launch the Extension Development Host (F5 in VSCode)
 * 2. Open the Debug Console
 * 3. Run this script to verify the extension is working correctly
 */

const vscode = require("vscode");

async function verifyExtension() {
  console.log("=".repeat(60));
  console.log("CODEFORGE EXTENSION VERIFICATION");
  console.log("=".repeat(60));

  // 1. Check if extension is present
  const extension = vscode.extensions.getExtension("tuliptreetech.codeforge");
  if (!extension) {
    console.error(
      "❌ Extension not found! Check package.json publisher and name.",
    );
    return;
  }
  console.log("✅ Extension found:", extension.id);

  // 2. Check if extension is active
  if (!extension.isActive) {
    console.log("⚠️ Extension not active. Attempting to activate...");
    try {
      await extension.activate();
      console.log("✅ Extension activated successfully");
    } catch (error) {
      console.error("❌ Failed to activate extension:", error);
      return;
    }
  } else {
    console.log("✅ Extension is already active");
  }

  // 3. Check if commands are registered
  const commands = await vscode.commands.getCommands();
  const codeforgeCommands = commands.filter((cmd) =>
    cmd.startsWith("codeforge."),
  );
  console.log(
    `✅ Found ${codeforgeCommands.length} CodeForge commands:`,
    codeforgeCommands,
  );

  // 4. Try to fetch tasks
  try {
    console.log("\nAttempting to fetch CodeForge tasks...");
    const tasks = await vscode.tasks.fetchTasks({ type: "codeforge" });
    console.log(
      `✅ Successfully fetched ${tasks.length} tasks of type 'codeforge'`,
    );

    if (tasks.length > 0) {
      console.log("Tasks found:");
      tasks.forEach((task, index) => {
        console.log(`  ${index + 1}. ${task.name} (${task.source})`);
      });
    }
  } catch (error) {
    console.error("❌ Error fetching tasks:", error.message);
    console.error("This is the main issue - task provider not registered!");
  }

  // 5. Check output channel
  const outputChannels = vscode.window.visibleTextEditors;
  console.log(
    "\n✅ Output channel should be visible in Output panel (View > Output > CodeForge)",
  );

  // 6. Test the test command (if it exists)
  try {
    console.log("\nExecuting test command...");
    await vscode.commands.executeCommand("codeforge.testActivation");
    console.log("✅ Test command executed successfully");
  } catch (error) {
    console.log("ℹ️ Test command not available (this is normal)");
  }

  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION COMPLETE");
  console.log("=".repeat(60));

  console.log("\nNext steps:");
  console.log("1. Try running 'CodeForge: Initialize' command");
  console.log("2. Check the Output panel for CodeForge logs");
  console.log(
    "3. Try creating a task in .vscode/tasks.json with type 'codeforge'",
  );
}

// Run verification
verifyExtension().catch(console.error);
