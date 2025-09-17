const vscode = require("vscode");
const dockerOperations = require("../../dockerOperations");
const path = require("path");
const fs = require("fs").promises;

/**
 * Safe wrapper for fuzzing output channel operations
 * Following the pattern from extension.js
 */
function safeFuzzingLog(outputChannel, message, show = false) {
  try {
    if (outputChannel) {
      outputChannel.appendLine(`[Fuzzing] ${message}`);
      if (show) {
        outputChannel.show();
      }
    }
  } catch (error) {
    // Silently ignore if output channel is disposed
    console.log(`CodeForge Fuzzing: ${message}`);
  }
}

/**
 * Handles fuzzing errors with user-friendly messages and recovery options
 * @param {Error} error - The error that occurred
 * @param {string} context - Context where the error occurred
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @returns {Promise<string|undefined>} User's choice for error recovery
 */
async function handleFuzzingError(error, context, outputChannel) {
  const errorMessage = `Fuzzing ${context} failed: ${error.message}`;
  safeFuzzingLog(outputChannel, errorMessage, true);

  // Show user-friendly error with actionable suggestions
  const action = await vscode.window.showErrorMessage(
    `CodeForge: ${errorMessage}`,
    "View Output",
    "Retry",
    "Cancel",
  );

  if (action === "View Output") {
    outputChannel.show();
  }
  return action;
}

/**
 * Creates the fuzzing directory structure
 * @param {string} workspacePath - Path to the workspace
 * @returns {Promise<string>} Path to the fuzzing directory
 */
async function createFuzzingDirectory(workspacePath) {
  const fuzzingDir = path.join(workspacePath, ".codeforge", "fuzzing");

  try {
    await fs.access(fuzzingDir);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(fuzzingDir, { recursive: true });
  }

  return fuzzingDir;
}

/**
 * Main orchestrator for the fuzzing workflow
 * Coordinates preset discovery, target building, and fuzzer execution
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @param {Function} progressCallback - Progress reporting callback
 * @param {Object} options - Fuzzing options
 * @returns {Promise<Object>} Fuzzing results summary
 */
async function orchestrateFuzzingWorkflow(
  workspacePath,
  containerName,
  outputChannel,
  progressCallback,
  options = {},
) {
  // Lazy load modules to avoid circular dependencies
  const cmakePresetDiscovery = require("./cmakePresetDiscovery");
  const fuzzTargetBuilder = require("./fuzzTargetBuilder");
  const fuzzRunner = require("./fuzzRunner");
  const results = {
    totalPresets: 0,
    processedPresets: 0,
    totalTargets: 0,
    builtTargets: 0,
    executedFuzzers: 0,
    errors: [],
    crashes: [],
  };

  try {
    // Create fuzzing directory
    safeFuzzingLog(outputChannel, "Creating fuzzing directory structure...");
    const fuzzingDir = await createFuzzingDirectory(workspacePath);
    progressCallback("Creating fuzzing directory", 5);

    // Discover CMake presets
    safeFuzzingLog(outputChannel, "Discovering CMake presets...");
    progressCallback("Discovering CMake presets", 10);

    const presets = await cmakePresetDiscovery.discoverCMakePresets(
      workspacePath,
      containerName,
      outputChannel,
    );

    results.totalPresets = presets.length;
    safeFuzzingLog(
      outputChannel,
      `Found ${presets.length} CMake preset(s): ${presets.join(", ")}`,
    );

    if (presets.length === 0) {
      throw new Error(
        "No CMake presets found. Ensure your project has CMakePresets.json or CMakeUserPresets.json",
      );
    }

    const allFuzzers = new Map(); // Map to store fuzzer paths

    // Process each preset
    for (let i = 0; i < presets.length; i++) {
      const preset = presets[i];
      const presetProgress = 20 + (i / presets.length) * 60; // 20-80% for preset processing

      try {
        safeFuzzingLog(outputChannel, `Processing preset: ${preset}`);
        progressCallback(`Processing preset: ${preset}`, presetProgress);

        // Create temporary build directory
        const buildDir = await fuzzTargetBuilder.createTemporaryBuildDirectory(
          fuzzingDir,
          preset,
        );

        // Discover fuzz targets for this preset
        const targets = await cmakePresetDiscovery.discoverFuzzTargets(
          workspacePath,
          containerName,
          preset,
          buildDir,
          outputChannel,
        );

        if (targets.length === 0) {
          safeFuzzingLog(
            outputChannel,
            `No fuzz targets found for preset ${preset} - skipping`,
          );
          continue;
        }

        results.totalTargets += targets.length;
        safeFuzzingLog(
          outputChannel,
          `Found ${targets.length} fuzz target(s) for preset ${preset}: ${targets.join(", ")}`,
        );

        // Build fuzz targets
        const builtTargets = await fuzzTargetBuilder.buildFuzzTargets(
          workspacePath,
          containerName,
          preset,
          targets,
          buildDir,
          outputChannel,
        );

        results.builtTargets += builtTargets.length;

        // Copy executables to central location
        const copiedFuzzers = await fuzzTargetBuilder.copyFuzzExecutables(
          workspacePath,
          containerName,
          buildDir,
          builtTargets,
          fuzzingDir,
          outputChannel,
        );

        // Add to fuzzer collection
        copiedFuzzers.forEach((fuzzer) => {
          allFuzzers.set(fuzzer.name, fuzzer.path);
        });

        results.processedPresets++;
      } catch (error) {
        safeFuzzingLog(
          outputChannel,
          `Error processing preset ${preset}: ${error.message}`,
        );
        results.errors.push({
          preset: preset,
          error: error.message,
          type: "preset_processing",
        });
        // Continue with next preset
      }
    }

    // Execute fuzzers
    if (allFuzzers.size > 0) {
      safeFuzzingLog(outputChannel, `Running ${allFuzzers.size} fuzzer(s)...`);
      progressCallback("Running fuzzers", 85);

      const fuzzingResults = await fuzzRunner.runAllFuzzers(
        workspacePath,
        containerName,
        allFuzzers,
        fuzzingDir,
        outputChannel,
        options.fuzzingOptions || {},
      );

      results.executedFuzzers = fuzzingResults.executed;
      results.crashes = fuzzingResults.crashes;
      results.errors.push(...fuzzingResults.errors);
    }

    progressCallback("Generating reports", 95);

    // Generate summary report
    const summary = generateFuzzingSummary(results);
    safeFuzzingLog(outputChannel, summary, true);

    progressCallback("Fuzzing complete", 100);
    return results;
  } catch (error) {
    results.errors.push({
      type: "workflow",
      error: error.message,
    });
    throw error;
  }
}

/**
 * Generates a human-readable summary of fuzzing results
 * @param {Object} results - Fuzzing results object
 * @returns {string} Formatted summary
 */
function generateFuzzingSummary(results) {
  const lines = [
    "=== Fuzzing Results Summary ===",
    `Presets processed: ${results.processedPresets}/${results.totalPresets}`,
    `Targets built: ${results.builtTargets}/${results.totalTargets}`,
    `Fuzzers executed: ${results.executedFuzzers}`,
    `Crashes found: ${results.crashes.length}`,
    `Errors encountered: ${results.errors.length}`,
  ];

  if (results.crashes.length > 0) {
    lines.push("", "Crashes found:");
    results.crashes.forEach((crash) => {
      lines.push(`  - ${crash.fuzzer}: ${crash.file}`);
    });
  }

  if (results.errors.length > 0) {
    lines.push("", "Errors:");
    results.errors.forEach((error) => {
      lines.push(`  - ${error.type}: ${error.error}`);
    });
  }

  return lines.join("\n");
}

/**
 * Main entry point for running fuzzing tests
 * Called from the VSCode command
 * @param {string} workspacePath - Path to the workspace
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @param {Function} progressCallback - Progress reporting callback
 * @param {Object} options - Fuzzing options
 * @returns {Promise<Object>} Fuzzing results
 */
async function runFuzzingTests(
  workspacePath,
  outputChannel,
  progressCallback,
  options = {},
) {
  try {
    safeFuzzingLog(outputChannel, "Starting fuzzing workflow...", true);

    // Generate container name using existing pattern
    const containerName = dockerOperations.generateContainerName(workspacePath);

    // Run the orchestrated workflow
    const results = await orchestrateFuzzingWorkflow(
      workspacePath,
      containerName,
      outputChannel,
      progressCallback,
      options,
    );

    // Show completion message
    const message =
      results.crashes.length > 0
        ? `Fuzzing completed with ${results.crashes.length} crash(es) found!`
        : `Fuzzing completed successfully. ${results.executedFuzzers} fuzzer(s) executed.`;

    vscode.window.showInformationMessage(`CodeForge: ${message}`);

    return results;
  } catch (error) {
    const action = await handleFuzzingError(error, "workflow", outputChannel);
    if (action === "Retry") {
      return runFuzzingTests(
        workspacePath,
        outputChannel,
        progressCallback,
        options,
      );
    }
    throw error;
  }
}

module.exports = {
  runFuzzingTests,
  orchestrateFuzzingWorkflow,
  createFuzzingDirectory,
  safeFuzzingLog,
  handleFuzzingError,
  generateFuzzingSummary,
};
