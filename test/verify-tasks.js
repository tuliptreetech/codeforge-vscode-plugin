#!/usr/bin/env node

/**
 * Test script to verify CodeForge task configuration and execution
 * This script validates the task configuration structure and simulates task execution
 */

const fs = require("fs");
const path = require("path");

// ANSI color codes for output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
  gray: "\x1b[90m",
};

// VSCode Task 2.0.0 schema validation
const validateTaskSchema = (task) => {
  const errors = [];
  const warnings = [];

  // Required properties for CodeForge tasks
  if (!task.type) {
    errors.push("Missing required property: type");
  } else if (task.type !== "codeforge") {
    warnings.push(
      `Task type is "${task.type}", expected "codeforge" for CodeForge tasks`,
    );
  }

  if (!task.label) {
    errors.push("Missing required property: label");
  }

  // CodeForge specific requirement
  if (task.type === "codeforge" && !task.command) {
    errors.push('CodeForge tasks require a "command" property');
  }

  // Optional but recommended properties
  if (!task.problemMatcher) {
    warnings.push("Consider adding a problemMatcher property");
  }

  // Validate presentation options if present
  if (task.presentation) {
    const validPresentationKeys = [
      "echo",
      "reveal",
      "focus",
      "panel",
      "showReuseMessage",
      "clear",
      "group",
    ];
    const invalidKeys = Object.keys(task.presentation).filter(
      (key) => !validPresentationKeys.includes(key),
    );
    if (invalidKeys.length > 0) {
      warnings.push(
        `Unknown presentation properties: ${invalidKeys.join(", ")}`,
      );
    }

    if (
      task.presentation.reveal &&
      !["always", "never", "silent"].includes(task.presentation.reveal)
    ) {
      errors.push(
        `Invalid presentation.reveal value: ${task.presentation.reveal}`,
      );
    }

    if (
      task.presentation.panel &&
      !["shared", "dedicated", "new"].includes(task.presentation.panel)
    ) {
      errors.push(
        `Invalid presentation.panel value: ${task.presentation.panel}`,
      );
    }
  }

  // Validate group options if present
  if (task.group) {
    if (typeof task.group === "string") {
      if (!["build", "test", "none"].includes(task.group)) {
        warnings.push(`Unknown group value: ${task.group}`);
      }
    } else if (typeof task.group === "object") {
      if (
        task.group.kind &&
        !["build", "test", "none"].includes(task.group.kind)
      ) {
        warnings.push(`Unknown group.kind value: ${task.group.kind}`);
      }
    }
  }

  return { errors, warnings };
};

// Load and validate tasks.json
const loadAndValidateTasks = (tasksPath) => {
  console.log(`${colors.blue}Loading tasks from: ${tasksPath}${colors.reset}`);

  try {
    const tasksContent = fs.readFileSync(tasksPath, "utf8");
    const tasksConfig = JSON.parse(tasksContent);

    // Validate version
    if (!tasksConfig.version) {
      console.log(`${colors.red}✗ Missing version property${colors.reset}`);
      return false;
    }

    if (tasksConfig.version !== "2.0.0") {
      console.log(
        `${colors.yellow}⚠ Version is ${tasksConfig.version}, expected 2.0.0${colors.reset}`,
      );
    }

    // Validate tasks array
    if (!Array.isArray(tasksConfig.tasks)) {
      console.log(
        `${colors.red}✗ Tasks property must be an array${colors.reset}`,
      );
      return false;
    }

    console.log(
      `${colors.gray}Found ${tasksConfig.tasks.length} task(s)${colors.reset}\n`,
    );

    let hasErrors = false;

    // Validate each task
    tasksConfig.tasks.forEach((task, index) => {
      console.log(
        `${colors.blue}Task ${index + 1}: ${task.label || "Unnamed"}${colors.reset}`,
      );

      const { errors, warnings } = validateTaskSchema(task);

      if (errors.length > 0) {
        hasErrors = true;
        errors.forEach((error) => {
          console.log(`  ${colors.red}✗ ${error}${colors.reset}`);
        });
      }

      if (warnings.length > 0) {
        warnings.forEach((warning) => {
          console.log(`  ${colors.yellow}⚠ ${warning}${colors.reset}`);
        });
      }

      if (errors.length === 0 && warnings.length === 0) {
        console.log(
          `  ${colors.green}✓ Valid task configuration${colors.reset}`,
        );
      }

      // Display task details
      if (task.type === "codeforge") {
        console.log(`  ${colors.gray}Command: ${task.command}${colors.reset}`);
        if (task.containerName) {
          console.log(
            `  ${colors.gray}Container: ${task.containerName}${colors.reset}`,
          );
        }
      }

      console.log();
    });

    return !hasErrors;
  } catch (error) {
    console.log(
      `${colors.red}✗ Error loading tasks.json: ${error.message}${colors.reset}`,
    );
    return false;
  }
};

// Simulate task execution (dry run)
const simulateTaskExecution = (tasksPath) => {
  console.log(
    `${colors.blue}=== Simulating Task Execution ===${colors.reset}\n`,
  );

  try {
    const tasksContent = fs.readFileSync(tasksPath, "utf8");
    const tasksConfig = JSON.parse(tasksContent);

    const codeforgeTask = tasksConfig.tasks.find(
      (task) => task.type === "codeforge",
    );

    if (!codeforgeTask) {
      console.log(
        `${colors.yellow}No CodeForge tasks found to simulate${colors.reset}`,
      );
      return;
    }

    console.log(
      `${colors.blue}Simulating: ${codeforgeTask.label}${colors.reset}`,
    );
    console.log(
      `${colors.gray}Command: ${codeforgeTask.command}${colors.reset}`,
    );

    // Check for Docker
    const { execSync } = require("child_process");
    try {
      execSync("docker --version", { stdio: "pipe" });
      console.log(`${colors.green}✓ Docker is available${colors.reset}`);
    } catch {
      console.log(
        `${colors.yellow}⚠ Docker not found - tasks will fail at runtime${colors.reset}`,
      );
    }

    // Check for .codeforge directory
    const workspaceRoot = path.dirname(path.dirname(tasksPath));
    const codeforgeDir = path.join(workspaceRoot, ".codeforge");
    const dockerfilePath = path.join(codeforgeDir, "Dockerfile");

    if (fs.existsSync(dockerfilePath)) {
      console.log(
        `${colors.green}✓ Dockerfile found at ${dockerfilePath}${colors.reset}`,
      );
    } else {
      console.log(
        `${colors.yellow}⚠ Dockerfile not found - run "CodeForge: Initialize" first${colors.reset}`,
      );
    }

    console.log(
      `\n${colors.green}Task configuration is ready for execution${colors.reset}`,
    );
  } catch (error) {
    console.log(
      `${colors.red}✗ Simulation failed: ${error.message}${colors.reset}`,
    );
  }
};

// Main execution
const main = () => {
  console.log(
    `${colors.blue}=== CodeForge Task Configuration Validator ===${colors.reset}\n`,
  );

  // Check for tasks.json in .vscode directory
  const tasksPath = path.join(process.cwd(), ".vscode", "tasks.json");

  if (!fs.existsSync(tasksPath)) {
    console.log(
      `${colors.red}✗ No tasks.json found at ${tasksPath}${colors.reset}`,
    );
    console.log(
      `${colors.gray}Create a .vscode/tasks.json file with CodeForge task configurations${colors.reset}`,
    );
    process.exit(1);
  }

  // Validate task configuration
  const isValid = loadAndValidateTasks(tasksPath);

  if (isValid) {
    console.log(
      `${colors.green}=== All task configurations are valid ===${colors.reset}\n`,
    );

    // Simulate execution
    simulateTaskExecution(tasksPath);

    console.log(`\n${colors.green}✓ Task verification complete${colors.reset}`);
    process.exit(0);
  } else {
    console.log(
      `${colors.red}=== Task configuration has errors ===${colors.reset}`,
    );
    console.log(
      `${colors.gray}Fix the errors above and run this script again${colors.reset}`,
    );
    process.exit(1);
  }
};

// Run the script
if (require.main === module) {
  main();
}

module.exports = { validateTaskSchema, loadAndValidateTasks };
