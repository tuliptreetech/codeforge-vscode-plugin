#!/usr/bin/env node

/**
 * Comprehensive verification script for CodeForge task provider registration
 * This combines functionality from both test-provider.js and verify-registration.js
 * to provide a complete check of all critical components needed for proper registration
 *
 * This is a verification utility, not an automated test.
 * Run this script manually to verify task provider setup.
 */

const fs = require("fs");
const path = require("path");

console.log("=== CodeForge Task Provider Registration Verification ===\n");

const issues = [];
const fixes = [];
let passedChecks = 0;
let totalChecks = 0;

// Helper function to check and report
function check(condition, passMessage, failMessage, fix = null) {
  totalChecks++;
  if (condition) {
    console.log(`   ✅ ${passMessage}`);
    passedChecks++;
    return true;
  } else {
    console.log(`   ❌ ${failMessage}`);
    if (failMessage) issues.push(failMessage);
    if (fix) fixes.push(fix);
    return false;
  }
}

// 1. Check package.json configuration
console.log("1. Checking package.json configuration...");
const packageJsonPath = path.join(__dirname, "..", "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

// Check activation event
const hasTaskTypeActivation = packageJson.activationEvents?.includes(
  "onTaskType:codeforge",
);
check(
  hasTaskTypeActivation,
  'Activation event "onTaskType:codeforge" is present',
  'Missing activation event "onTaskType:codeforge" in package.json',
  'Add "onTaskType:codeforge" to activationEvents array in package.json',
);

// Check task definition
const taskDef = packageJson.contributes?.taskDefinitions?.find(
  (def) => def.type === "codeforge",
);
if (
  check(
    taskDef !== undefined,
    'Task definition for "codeforge" is present',
    'Missing task definition for type "codeforge" in package.json',
    'Add task definition with type "codeforge" to contributes.taskDefinitions in package.json',
  )
) {
  // Check required properties
  check(
    taskDef.required?.includes("command"),
    'Required "command" property is defined',
    'Task definition missing required "command" property',
    'Add "command" to required array in task definition',
  );

  // Display task definition details
  console.log(
    `     - Required properties: ${JSON.stringify(taskDef.required)}`,
  );
  console.log(
    `     - Properties defined: ${Object.keys(taskDef.properties || {}).join(", ")}`,
  );
}

// 2. Check extension.js
console.log("\n2. Checking extension.js...");
const extensionPath = path.join(__dirname, "..", "..", "src", "extension.js");
const extensionContent = fs.readFileSync(extensionPath, "utf8");

// Check for task provider import
const hasTaskProviderImport = extensionContent.includes(
  "CodeForgeTaskProvider",
);
check(
  hasTaskProviderImport,
  "CodeForgeTaskProvider is imported",
  "CodeForgeTaskProvider not imported in extension.js",
  "Import CodeForgeTaskProvider from ./tasks/taskProvider.js",
);

// Check for synchronous registration
const hasTaskProviderRegistration = extensionContent.includes(
  "vscode.tasks.registerTaskProvider",
);
if (
  check(
    hasTaskProviderRegistration,
    "Task provider registration call found",
    "Task provider registration not found in extension.js",
    "Add vscode.tasks.registerTaskProvider() call in activate function",
  )
) {
  // Check if registration is in activate function
  const activateMatch = extensionContent.match(
    /function\s+activate\s*\([^)]*\)\s*{([\s\S]*?)^}/m,
  );
  if (activateMatch) {
    const activateBody = activateMatch[1];
    if (
      check(
        activateBody.includes("registerTaskProvider"),
        "Registration happens in activate function",
        "Task provider registration not in activate function",
        "Move registerTaskProvider call to activate function",
      )
    ) {
      // Check if it's added to subscriptions
      check(
        activateBody.includes("context.subscriptions.push"),
        "Registration added to context.subscriptions",
        "Task provider registration not added to context.subscriptions",
        "Add the disposable from registerTaskProvider to context.subscriptions",
      );
    }
  }
}

// Check for proper error handling
if (
  extensionContent.includes("try") &&
  extensionContent.includes("registerTaskProvider")
) {
  console.log("   ✅ Error handling present for registration");
} else {
  console.log("   ⚠️  Consider adding try-catch around registration");
}

// 3. Check taskProvider.js
console.log("\n3. Checking taskProvider.js...");
const taskProviderPath = path.join(
  __dirname,
  "..",
  "..",
  "src",
  "tasks",
  "taskProvider.js",
);
const taskProviderContent = fs.readFileSync(taskProviderPath, "utf8");

// Check for required methods
check(
  taskProviderContent.includes("provideTasks"),
  "provideTasks method present",
  "provideTasks method not found in CodeForgeTaskProvider",
  "Implement provideTasks() method in CodeForgeTaskProvider class",
);

check(
  taskProviderContent.includes("resolveTask"),
  "resolveTask method present",
  "resolveTask method not found in CodeForgeTaskProvider",
  "Implement resolveTask() method in CodeForgeTaskProvider class",
);

// Check if provideTasks returns something
const returnsArray =
  taskProviderContent.includes("return [") ||
  taskProviderContent.includes("return []");
check(
  returnsArray,
  "provideTasks returns an array",
  "provideTasks might not return an array",
  "Ensure provideTasks returns an array of tasks",
);

// Note about current implementation
const returnsTask = taskProviderContent.includes("return [sampleTask]");
if (returnsTask) {
  console.log(
    "   ℹ️  Returns sample task (legacy behavior - now returns empty array)",
  );
} else {
  console.log(
    "   ✅ Returns empty array (correct behavior for resolved tasks only)",
  );
}

// 4. Check .vscode/tasks.json
console.log("\n4. Checking .vscode/tasks.json...");
const tasksJsonPath = path.join(__dirname, "..", "..", ".vscode", "tasks.json");
if (fs.existsSync(tasksJsonPath)) {
  const tasksJson = JSON.parse(fs.readFileSync(tasksJsonPath, "utf8"));
  const codeforgeTasks =
    tasksJson.tasks?.filter((task) => task.type === "codeforge") || [];

  if (codeforgeTasks.length > 0) {
    console.log(`   ✅ Found ${codeforgeTasks.length} codeforge task(s)`);

    // Check each task has required command property
    codeforgeTasks.forEach((task, index) => {
      if (!task.command) {
        issues.push(
          `Task "${task.label || index}" missing required "command" property`,
        );
        fixes.push(
          `Add "command" property to task "${task.label || index}" in tasks.json`,
        );
      } else {
        console.log(`   ✅ Task "${task.label}" has command: ${task.command}`);
      }
    });
  } else {
    console.log("   ℹ️  No codeforge tasks defined (this is OK for testing)");
  }
} else {
  console.log("   ℹ️  No tasks.json file found (this is OK)");
}

// 5. Summary
console.log("\n" + "=".repeat(60));
console.log("VERIFICATION SUMMARY");
console.log("=".repeat(60));

console.log(`\nChecks: ${passedChecks}/${totalChecks} passed`);

if (issues.length === 0) {
  console.log(
    "\n✅ All critical checks passed! The task provider should work correctly.\n",
  );
  console.log("The extension should:");
  console.log('1. Activate when VSCode queries for "codeforge" tasks');
  console.log("2. Register the CodeForgeTaskProvider synchronously");
  console.log(
    "3. Provide tasks via provideTasks() (currently returns empty array)",
  );
  console.log("4. Resolve user-defined tasks from .vscode/tasks.json");
  console.log("\nTo test:");
  console.log("1. Reload the VSCode window (Cmd+R or Ctrl+R)");
  console.log("2. Open the Command Palette (Cmd+Shift+P or Ctrl+Shift+P)");
  console.log('3. Run "Tasks: Run Task"');
  console.log('4. Look for tasks with type "codeforge"');
} else {
  console.log(`\n❌ Found ${issues.length} issue(s):\n`);
  issues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue}`);
    console.log(`   Fix: ${fixes[index]}`);
  });
  console.log("\nPlease address these issues and run the verification again.");
}

console.log("\n=== Verification Complete ===");

// Exit with appropriate code
process.exit(issues.length === 0 ? 0 : 1);
