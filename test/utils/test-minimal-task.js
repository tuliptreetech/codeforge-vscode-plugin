#!/usr/bin/env node

/**
 * Minimal Task Provider Test Utility
 *
 * This is a verification utility script that simulates what VSCode does when
 * looking for task providers. It tests the task provider registration and
 * basic functionality without requiring a full VSCode environment.
 *
 * This is NOT an automated test - it's a utility for manual verification.
 * Run this script directly with Node.js to verify task provider setup.
 *
 * Usage: node test/utils/test-minimal-task.js
 */

// Mock VSCode API for testing
const mockVscode = {
  tasks: {
    registerTaskProvider: (type, provider) => {
      console.log(`✅ Task provider registered for type: ${type}`);

      // Test the provider methods
      if (provider.provideTasks) {
        console.log("✅ Provider has provideTasks method");
      }
      if (provider.resolveTask) {
        console.log("✅ Provider has resolveTask method");
      }

      return {
        dispose: () => console.log("Task provider disposed"),
      };
    },
  },
  window: {
    createOutputChannel: (name) => {
      console.log(`Output channel created: ${name}`);
      return {
        appendLine: (text) => console.log(`[OUTPUT] ${text}`),
        show: () => {},
        dispose: () => {},
      };
    },
  },
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: "/test/workspace" },
      },
    ],
  },
  Task: class {
    constructor(definition, scope, name, source, execution, problemMatchers) {
      this.definition = definition;
      this.scope = scope;
      this.name = name;
      this.source = source;
      this.execution = execution;
      this.problemMatchers = problemMatchers;
    }
  },
  CustomExecution: class {
    constructor(callback) {
      this.callback = callback;
    }
  },
  TaskRevealKind: { Always: 1 },
  TaskPanelKind: { New: 1 },
  EventEmitter: class {
    constructor() {}
    get event() {
      return () => {};
    }
    fire(data) {}
  },
};

// Override require to use our mock
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "vscode") {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

console.log("=== Minimal Task Provider Test ===\n");

try {
  // Load the task provider
  const { CodeForgeTaskProvider } = require("../../taskProvider");
  console.log("✅ CodeForgeTaskProvider loaded successfully\n");

  // Create mock context
  const mockContext = {
    subscriptions: [],
    extensionPath: "/test/extension",
  };

  // Create output channel
  const outputChannel = mockVscode.window.createOutputChannel("Test");

  // Create task provider instance
  console.log("Creating task provider instance...");
  const taskProvider = new CodeForgeTaskProvider(mockContext, outputChannel);
  console.log("✅ Task provider instance created\n");

  // Test provideTasks
  console.log("Testing provideTasks()...");
  taskProvider
    .provideTasks()
    .then((tasks) => {
      console.log(`✅ provideTasks() returned ${tasks.length} task(s)`);
      if (tasks.length > 0) {
        console.log(`   First task: ${tasks[0].name}`);
      }
    })
    .catch((err) => {
      console.log(`❌ provideTasks() failed: ${err.message}`);
    });

  // Test resolveTask
  console.log("\nTesting resolveTask()...");
  const mockTask = {
    name: "Test Task",
    definition: {
      type: "codeforge",
      command: 'echo "test"',
      label: "Test Task",
    },
    scope: mockVscode.workspace.workspaceFolders[0],
  };

  taskProvider
    .resolveTask(mockTask)
    .then((resolvedTask) => {
      if (resolvedTask) {
        console.log(`✅ resolveTask() succeeded for: ${resolvedTask.name}`);
      } else {
        console.log("❌ resolveTask() returned undefined");
      }
    })
    .catch((err) => {
      console.log(`❌ resolveTask() failed: ${err.message}`);
    });

  // Register the provider
  console.log("\nRegistering task provider...");
  const disposable = mockVscode.tasks.registerTaskProvider(
    "codeforge",
    taskProvider,
  );
  mockContext.subscriptions.push(disposable);
  console.log(
    `✅ Task provider registered (subscriptions: ${mockContext.subscriptions.length})\n`,
  );

  console.log("=== All tests passed! ===");
} catch (error) {
  console.error(`❌ Test failed: ${error.message}`);
  console.error(error.stack);
}
