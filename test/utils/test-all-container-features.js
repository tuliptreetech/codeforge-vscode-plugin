#!/usr/bin/env node

/**
 * Comprehensive test suite for all container tracking and termination features
 * This script runs all tests to ensure the container management system is fully functional
 */

const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const path = require("path");

async function runTest(testFile, testName) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Running: ${testName}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    const { stdout, stderr } = await execAsync(`node ${testFile}`, {
      cwd: path.join(__dirname, "../.."),
    });

    if (stdout) {
      console.log(stdout);
    }

    if (stderr) {
      console.error("Warnings/Errors:", stderr);
    }

    return { success: true, testName };
  } catch (error) {
    console.error(`❌ Test failed: ${testName}`);
    console.error(error.message);
    if (error.stdout) {
      console.log("Output:", error.stdout);
    }
    if (error.stderr) {
      console.error("Error output:", error.stderr);
    }
    return { success: false, testName, error: error.message };
  }
}

async function runAllTests() {
  console.log("🚀 CodeForge Container Management - Comprehensive Test Suite");
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const tests = [
    {
      file: "test/utils/test-container-tracking.js",
      name: "Container Tracking Functions",
    },
    {
      file: "test/utils/test-container-termination.js",
      name: "Container Termination and Cleanup",
    },
    {
      file: "test/utils/test-commands.js",
      name: "Command Registration",
    },
  ];

  const results = [];

  for (const test of tests) {
    const result = await runTest(test.file, test.name);
    results.push(result);
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 FINAL TEST SUMMARY");
  console.log(`${"=".repeat(60)}\n`);

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log("Test Results:");
  results.forEach((result) => {
    const icon = result.success ? "✅" : "❌";
    console.log(`  ${icon} ${result.testName}`);
    if (!result.success && result.error) {
      console.log(`     Error: ${result.error}`);
    }
  });

  console.log(
    `\nTotal: ${passed} passed, ${failed} failed out of ${results.length} tests`,
  );

  if (failed === 0) {
    console.log("\n🎉 SUCCESS: All tests passed!");
    console.log("\n✨ Container Management Features Verified:");
    console.log("  ✅ Container tracking and metadata management");
    console.log("  ✅ Container name generation from workspace paths");
    console.log("  ✅ Active container status monitoring");
    console.log("  ✅ Container termination (stop, kill, remove)");
    console.log("  ✅ Cleanup on extension deactivation");
    console.log("  ✅ Orphaned container cleanup");
    console.log("  ✅ VSCode command registration");
    console.log("  ✅ Configuration settings");

    console.log("\n📝 Available Commands in VSCode:");
    console.log("  • CodeForge: List Active Containers");
    console.log("  • CodeForge: Terminate All Containers");
    console.log("  • CodeForge: Cleanup Orphaned Containers");

    console.log("\n⚙️ Configuration Options:");
    console.log(
      "  • codeforge.terminateContainersOnDeactivate (default: false)",
    );
    console.log(
      "    Set to true to automatically cleanup containers when VSCode closes",
    );

    console.log("\n💡 Usage Tips:");
    console.log("  1. Use Ctrl/Cmd+Shift+P to open the Command Palette");
    console.log('  2. Type "CodeForge" to see all available commands');
    console.log("  3. Enable auto-cleanup in settings if desired");
    console.log("  4. Check container status regularly during development");

    process.exit(0);
  } else {
    console.log("\n⚠️ PARTIAL SUCCESS: Some tests failed");
    console.log("Please review the errors above and fix any issues.");
    process.exit(1);
  }
}

// Run all tests
runAllTests().catch((error) => {
  console.error("\n❌ Test suite execution failed:", error);
  process.exit(1);
});
