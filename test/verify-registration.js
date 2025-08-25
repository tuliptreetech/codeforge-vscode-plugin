#!/usr/bin/env node

/**
 * Verification script for CodeForge task provider registration
 * This checks all the critical components needed for proper registration
 */

const fs = require("fs");
const path = require("path");

console.log("=== CodeForge Task Provider Registration Verification ===\n");

const issues = [];
const fixes = [];

// 1. Check package.json configuration
console.log("1. Checking package.json configuration...");
const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

// Check activation event
if (!packageJson.activationEvents?.includes("onTaskType:codeforge")) {
  issues.push(
    'Missing activation event "onTaskType:codeforge" in package.json',
  );
  fixes.push(
    'Add "onTaskType:codeforge" to activationEvents array in package.json',
  );
} else {
  console.log('   ✅ Activation event "onTaskType:codeforge" is present');
}

// Check task definition
const taskDef = packageJson.contributes?.taskDefinitions?.find(
  (def) => def.type === "codeforge",
);
if (!taskDef) {
  issues.push('Missing task definition for type "codeforge" in package.json');
  fixes.push(
    'Add task definition with type "codeforge" to contributes.taskDefinitions in package.json',
  );
} else {
  console.log('   ✅ Task definition for "codeforge" is present');
  if (!taskDef.required?.includes("command")) {
    issues.push('Task definition missing required "command" property');
    fixes.push('Add "command" to required array in task definition');
  } else {
    console.log('   ✅ Required "command" property is defined');
  }
}

// 2. Check extension.js
console.log("\n2. Checking extension.js...");
const extensionPath = path.join(__dirname, "..", "extension.js");
const extensionContent = fs.readFileSync(extensionPath, "utf8");

// Check for task provider import
if (!extensionContent.includes("CodeForgeTaskProvider")) {
  issues.push("CodeForgeTaskProvider not imported in extension.js");
  fixes.push("Import CodeForgeTaskProvider from ./taskProvider.js");
} else {
  console.log("   ✅ CodeForgeTaskProvider is imported");
}

// Check for synchronous registration
if (!extensionContent.includes("vscode.tasks.registerTaskProvider")) {
  issues.push("Task provider registration not found in extension.js");
  fixes.push(
    "Add vscode.tasks.registerTaskProvider() call in activate function",
  );
} else {
  console.log("   ✅ Task provider registration call found");

  // Check if registration is in activate function
  const activateMatch = extensionContent.match(
    /function\s+activate\s*\([^)]*\)\s*{([\s\S]*?)^}/m,
  );
  if (activateMatch) {
    const activateBody = activateMatch[1];
    if (activateBody.includes("registerTaskProvider")) {
      console.log("   ✅ Registration happens in activate function");

      // Check if it's added to subscriptions
      if (activateBody.includes("context.subscriptions.push")) {
        console.log("   ✅ Registration added to context.subscriptions");
      } else {
        issues.push(
          "Task provider registration not added to context.subscriptions",
        );
        fixes.push(
          "Add the disposable from registerTaskProvider to context.subscriptions",
        );
      }
    } else {
      issues.push("Task provider registration not in activate function");
      fixes.push("Move registerTaskProvider call to activate function");
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
const taskProviderPath = path.join(__dirname, "..", "taskProvider.js");
const taskProviderContent = fs.readFileSync(taskProviderPath, "utf8");

// Check for required methods
if (!taskProviderContent.includes("provideTasks")) {
  issues.push("provideTasks method not found in CodeForgeTaskProvider");
  fixes.push("Implement provideTasks() method in CodeForgeTaskProvider class");
} else {
  console.log("   ✅ provideTasks method present");
}

if (!taskProviderContent.includes("resolveTask")) {
  issues.push("resolveTask method not found in CodeForgeTaskProvider");
  fixes.push("Implement resolveTask() method in CodeForgeTaskProvider class");
} else {
  console.log("   ✅ resolveTask method present");
}

// Check if provideTasks returns something
if (
  taskProviderContent.includes("return [") ||
  taskProviderContent.includes("return []")
) {
  console.log("   ✅ provideTasks returns an array");
} else {
  issues.push("provideTasks might not return an array");
  fixes.push("Ensure provideTasks returns an array of tasks");
}

// 4. Check .vscode/tasks.json
console.log("\n4. Checking .vscode/tasks.json...");
const tasksJsonPath = path.join(__dirname, "..", ".vscode", "tasks.json");
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

if (issues.length === 0) {
  console.log(
    "\n✅ All checks passed! The task provider should work correctly.\n",
  );
  console.log("The extension should:");
  console.log('1. Activate when VSCode queries for "codeforge" tasks');
  console.log("2. Register the CodeForgeTaskProvider synchronously");
  console.log("3. Provide sample tasks via provideTasks()");
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
