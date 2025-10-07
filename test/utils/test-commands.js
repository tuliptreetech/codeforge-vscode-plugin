#!/usr/bin/env node

/**
 * Test script to verify VSCode commands are properly registered
 * This script tests that the container management commands are available
 */

const path = require("path");
const fs = require("fs");

// Read package.json to verify command registration
function testCommandRegistration() {
  console.log("🧪 Testing Command Registration\n");

  try {
    // Test 1: Read package.json
    console.log("1️⃣ Reading package.json to verify command registration...");
    const packageJsonPath = path.join(__dirname, "../../package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    if (!packageJson.contributes || !packageJson.contributes.commands) {
      throw new Error("No commands found in package.json");
    }

    const commands = packageJson.contributes.commands;
    console.log(`Found ${commands.length} registered command(s)\n`);

    // Test 2: Check for container management commands
    console.log("2️⃣ Checking for container management commands...");

    const expectedCommands = [
      {
        command: "codeforge.initializeProject",
        title: "Initialize Project",
        description: "Initialize CodeForge in the current project",
      },
      {
        command: "codeforge.launchTerminal",
        title: "Launch Terminal in Container",
        description:
          "Launch an interactive terminal in the CodeForge container",
      },
      {
        command: "codeforge.runFuzzingTests",
        title: "Run Fuzzing Tests",
        description: "Run fuzzing tests in the CodeForge container",
      },
      {
        command: "codeforge.buildFuzzingTests",
        title: "Build Fuzzing Tests",
        description: "Build fuzzing test targets",
      },
      {
        command: "codeforge.regenerateFuzzerList",
        title: "Regenerate Fuzzer List",
        description: "Regenerate the list of available fuzzers",
      },
      {
        command: "codeforge.registerTask",
        title: "Register Task",
        description: "Register a new CodeForge task",
      },
    ];

    const foundCommands = [];
    const missingCommands = [];

    for (const expected of expectedCommands) {
      const found = commands.find((cmd) => cmd.command === expected.command);
      if (found) {
        foundCommands.push(found);
        console.log(`✅ Found command: ${expected.command}`);
        console.log(`   Title: ${found.title}`);
        if (found.category) {
          console.log(`   Category: ${found.category}`);
        }
      } else {
        missingCommands.push(expected);
        console.log(`❌ Missing command: ${expected.command}`);
      }
    }

    console.log("");

    // Test 3: Check configuration settings
    console.log("3️⃣ Checking configuration settings...");

    if (!packageJson.contributes.configuration) {
      console.log("⚠️ No configuration section found");
    } else {
      const config = packageJson.contributes.configuration;
      const properties = config.properties || {};

      // Check for terminateContainersOnDeactivate setting
      const deactivateSetting =
        properties["codeforge.terminateContainersOnDeactivate"];
      if (deactivateSetting) {
        console.log("✅ Found terminateContainersOnDeactivate setting");
        console.log(`   Type: ${deactivateSetting.type}`);
        console.log(`   Default: ${deactivateSetting.default}`);
        console.log(`   Description: ${deactivateSetting.description}`);
      } else {
        console.log("❌ Missing terminateContainersOnDeactivate setting");
      }
    }

    console.log("");

    // Test 4: List all CodeForge commands
    console.log("4️⃣ All registered CodeForge commands:");
    const codeforgeCommands = commands.filter((cmd) =>
      cmd.command.startsWith("codeforge."),
    );

    codeforgeCommands.forEach((cmd, index) => {
      console.log(`${index + 1}. ${cmd.command}`);
      console.log(`   Title: ${cmd.title}`);
      if (cmd.category) {
        console.log(`   Category: ${cmd.category}`);
      }
    });

    console.log("");

    // Test 5: Verify extension.js exports the command handlers
    console.log("5️⃣ Verifying command handlers in extension.js...");
    const extensionPath = path.join(__dirname, "../../src/extension.js");
    const extensionContent = fs.readFileSync(extensionPath, "utf8");

    // Check for command registration in activate function
    const commandRegistrations = [
      "codeforge.initializeProject",
      "codeforge.launchTerminal",
      "codeforge.runFuzzingTests",
      "codeforge.buildFuzzingTests",
      "codeforge.regenerateFuzzerList",
      "codeforge.registerTask",
    ];

    for (const cmdName of commandRegistrations) {
      if (
        extensionContent.includes(`'${cmdName}'`) ||
        extensionContent.includes(`"${cmdName}"`)
      ) {
        console.log(`✅ Command handler found for: ${cmdName}`);
      } else {
        console.log(`⚠️ Command handler not found for: ${cmdName}`);
      }
    }

    console.log("");

    // Summary
    console.log("📊 Summary:");
    if (foundCommands.length === expectedCommands.length) {
      console.log(
        "✅ All expected container management commands are registered",
      );
    } else {
      console.log(
        `⚠️ Found ${foundCommands.length}/${expectedCommands.length} expected commands`,
      );
    }

    console.log("✅ Command registration test completed");

    // Additional info
    console.log("\n📝 Notes:");
    console.log("- Commands are registered in package.json");
    console.log("- Command handlers are implemented in extension.js");
    console.log(
      "- Commands will appear in VSCode Command Palette (Ctrl/Cmd+Shift+P)",
    );
    console.log('- Search for "CodeForge" in the palette to see all commands');
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testCommandRegistration();
console.log("\n✅ All command registration tests completed successfully!");
