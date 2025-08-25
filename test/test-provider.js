#!/usr/bin/env node

/**
 * Test script to verify the CodeForge task provider registration
 */

const path = require("path");
const fs = require("fs");

console.log("=== CodeForge Task Provider Test ===\n");

// Check package.json for task provider registration
const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

console.log("1. Checking package.json configuration:");

// Check activation events
const hasTaskTypeActivation = packageJson.activationEvents?.includes(
  "onTaskType:codeforge",
);
console.log(
  `   ✓ Activation event "onTaskType:codeforge": ${hasTaskTypeActivation ? "✅ Present" : "❌ Missing"}`,
);

// Check task definitions
const taskDef = packageJson.contributes?.taskDefinitions?.find(
  (def) => def.type === "codeforge",
);
console.log(
  `   ✓ Task definition for "codeforge": ${taskDef ? "✅ Present" : "❌ Missing"}`,
);

if (taskDef) {
  console.log(
    `     - Required properties: ${JSON.stringify(taskDef.required)}`,
  );
  console.log(
    `     - Properties defined: ${Object.keys(taskDef.properties || {}).join(", ")}`,
  );
}

console.log("\n2. Checking extension.js:");
const extensionPath = path.join(__dirname, "..", "extension.js");
const extensionContent = fs.readFileSync(extensionPath, "utf8");

const hasTaskProviderImport = extensionContent.includes(
  "CodeForgeTaskProvider",
);
const hasTaskProviderRegistration = extensionContent.includes(
  "registerTaskProvider",
);

console.log(
  `   ✓ CodeForgeTaskProvider import: ${hasTaskProviderImport ? "✅ Present" : "❌ Missing"}`,
);
console.log(
  `   ✓ Task provider registration: ${hasTaskProviderRegistration ? "✅ Present" : "❌ Missing"}`,
);

console.log("\n3. Checking taskProvider.js:");
const taskProviderPath = path.join(__dirname, "..", "taskProvider.js");
const taskProviderContent = fs.readFileSync(taskProviderPath, "utf8");

const hasProvideTasks = taskProviderContent.includes("provideTasks");
const hasResolveTask = taskProviderContent.includes("resolveTask");
const returnsTask = taskProviderContent.includes("return [sampleTask]");

console.log(
  `   ✓ provideTasks method: ${hasProvideTasks ? "✅ Present" : "❌ Missing"}`,
);
console.log(
  `   ✓ resolveTask method: ${hasResolveTask ? "✅ Present" : "❌ Missing"}`,
);
console.log(`   ✓ Returns sample task: ${returnsTask ? "✅ Yes" : "❌ No"}`);

console.log("\n4. Summary:");
const allChecks = [
  hasTaskTypeActivation,
  taskDef !== undefined,
  hasTaskProviderImport,
  hasTaskProviderRegistration,
  hasProvideTasks,
  hasResolveTask,
  returnsTask,
];

const passedChecks = allChecks.filter((check) => check).length;
const totalChecks = allChecks.length;

if (passedChecks === totalChecks) {
  console.log(
    `   ✅ All ${totalChecks} checks passed! The task provider should work correctly.`,
  );
  console.log("\n   The extension will:");
  console.log('   1. Activate when VSCode queries for "codeforge" tasks');
  console.log("   2. Register the CodeForgeTaskProvider");
  console.log("   3. Return a sample task from provideTasks()");
  console.log("   4. Resolve user-defined tasks from .vscode/tasks.json");
} else {
  console.log(
    `   ⚠️  ${passedChecks}/${totalChecks} checks passed. Some issues may remain.`,
  );
}

console.log("\n=== Test Complete ===");
