/**
 * Verification script to test if the CodeForge extension loads and registers properly
 * Run this after launching the Extension Development Host
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

  // 6. Test the test command
  try {
    console.log("\nExecuting test command...");
    await vscode.commands.executeCommand("codeforge.testActivation");
    console.log("✅ Test command executed successfully");
  } catch (error) {
    console.error("❌ Failed to execute test command:", error);
  }

  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION COMPLETE");
  console.log("=".repeat(60));
}

// Run verification
verifyExtension().catch(console.error);
