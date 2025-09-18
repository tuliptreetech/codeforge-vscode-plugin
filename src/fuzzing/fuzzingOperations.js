const vscode = require("vscode");
const dockerOperations = require("../core/dockerOperations");
const path = require("path");
const fs = require("fs").promises;

/**
 * Safe wrapper for fuzzing terminal operations
 * Works with both output channels and terminal instances
 */
function safeFuzzingLog(terminal, message, show = false) {
  try {
    if (terminal) {
      if (typeof terminal.appendLine === "function") {
        // Terminal instance
        terminal.appendLine(`[Fuzzing] ${message}`);
        if (show && typeof terminal.show === "function") {
          terminal.show();
        }
      } else if (typeof terminal.writeRaw === "function") {
        // Custom terminal with writeRaw method
        terminal.writeRaw(`[Fuzzing] ${message}\n`, "\x1b[36m"); // Cyan color for fuzzing messages
      } else {
        // Fallback for output channel
        terminal.appendLine(`[Fuzzing] ${message}`);
        if (show) {
          terminal.show();
        }
      }
    }
  } catch (error) {
    // Silently ignore if terminal is disposed
    console.log(`CodeForge Fuzzing: ${message}`);
  }
}

/**
 * Handles fuzzing errors with user-friendly messages and recovery options
 * @param {Error} error - The error that occurred
 * @param {string} context - Context where the error occurred
 * @param {Object} terminal - Terminal instance for logging
 * @returns {Promise<string|undefined>} User's choice for error recovery
 */
async function handleFuzzingError(error, context, terminal) {
  const errorMessage = `Fuzzing ${context} failed: ${error.message}`;
  safeFuzzingLog(terminal, errorMessage, true);

  // Show user-friendly error with actionable suggestions
  const action = await vscode.window.showErrorMessage(
    `CodeForge: ${errorMessage}`,
    "View Terminal",
    "Retry",
    "Cancel",
  );

  if (action === "View Terminal" && typeof terminal.show === "function") {
    terminal.show();
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
 * @param {Object} terminal - Terminal instance for logging
 * @param {Function} progressCallback - Progress reporting callback
 * @param {Object} options - Fuzzing options
 * @returns {Promise<Object>} Fuzzing results summary
 */
async function orchestrateFuzzingWorkflow(
  workspacePath,
  containerName,
  terminal,
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
    safeFuzzingLog(terminal, "Creating fuzzing directory structure...");
    const fuzzingDir = await createFuzzingDirectory(workspacePath);
    progressCallback("Creating fuzzing directory", 5);

    // Discover CMake presets
    safeFuzzingLog(terminal, "Discovering CMake presets...");
    progressCallback("Discovering CMake presets", 10);

    const presets = await cmakePresetDiscovery.discoverCMakePresets(
      workspacePath,
      containerName,
      terminal,
    );

    results.totalPresets = presets.length;
    safeFuzzingLog(
      terminal,
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
        safeFuzzingLog(terminal, `Processing preset: ${preset}`);
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
          terminal,
        );

        if (targets.length === 0) {
          safeFuzzingLog(
            terminal,
            `No fuzz targets found for preset ${preset} - skipping`,
          );
          continue;
        }

        results.totalTargets += targets.length;
        safeFuzzingLog(
          terminal,
          `Found ${targets.length} fuzz target(s) for preset ${preset}: ${targets.join(", ")}`,
        );

        // Build fuzz targets
        const builtTargets = await fuzzTargetBuilder.buildFuzzTargets(
          workspacePath,
          containerName,
          preset,
          targets,
          buildDir,
          terminal,
        );

        results.builtTargets += builtTargets.length;

        // Copy executables to central location
        const copiedFuzzers = await fuzzTargetBuilder.copyFuzzExecutables(
          workspacePath,
          containerName,
          buildDir,
          builtTargets,
          fuzzingDir,
          terminal,
        );

        // Add to fuzzer collection
        copiedFuzzers.forEach((fuzzer) => {
          allFuzzers.set(fuzzer.name, fuzzer.path);
        });

        results.processedPresets++;
      } catch (error) {
        safeFuzzingLog(
          terminal,
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
      safeFuzzingLog(terminal, `Running ${allFuzzers.size} fuzzer(s)...`);
      progressCallback("Running fuzzers", 85);

      const fuzzingResults = await fuzzRunner.runAllFuzzers(
        workspacePath,
        containerName,
        allFuzzers,
        fuzzingDir,
        terminal,
        options.fuzzingOptions || {},
      );

      results.executedFuzzers = fuzzingResults.executed;
      results.crashes = fuzzingResults.crashes;
      results.errors.push(...fuzzingResults.errors);
    }

    progressCallback("Generating reports", 95);

    // Generate summary report
    const summary = generateFuzzingSummary(results);
    safeFuzzingLog(terminal, summary, true);

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
 * @param {Object} terminal - Terminal instance for logging
 * @param {Function} progressCallback - Progress reporting callback
 * @param {Object} options - Fuzzing options
 * @returns {Promise<Object>} Fuzzing results
 */
async function runFuzzingTests(
  workspacePath,
  terminal,
  progressCallback,
  options = {},
) {
  try {
    safeFuzzingLog(terminal, "Starting fuzzing workflow...", true);

    // Generate container name using existing pattern
    const containerName = dockerOperations.generateContainerName(workspacePath);

    // Run the orchestrated workflow
    const results = await orchestrateFuzzingWorkflow(
      workspacePath,
      containerName,
      terminal,
      progressCallback,
      options,
    );

    // Show completion message
    const message =
      results.crashes.length > 0
        ? `Fuzzing completed with ${results.crashes.length} crash(es) found!`
        : `Fuzzing completed successfully. ${results.executedFuzzers} fuzzer(s) executed.`;

    vscode.window.showInformationMessage(`CodeForge: ${message}`, {
      modal: false,
    });

    return results;
  } catch (error) {
    const action = await handleFuzzingError(error, "workflow", terminal);
    if (action === "Retry") {
      return runFuzzingTests(
        workspacePath,
        terminal,
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
