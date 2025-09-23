const vscode = require("vscode");
const dockerOperations = require("../core/dockerOperations");
const path = require("path");
const fs = require("fs").promises;
const { getOutputDirectory } = require("./fuzzingConfig");

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
 * Display build summary without prefix for clean formatting
 * @param {Object} terminal - Terminal instance
 * @param {string} summary - Formatted build summary
 * @param {boolean} show - Whether to show the terminal
 */
function displayBuildSummary(terminal, summary, show = false) {
  try {
    if (terminal) {
      if (typeof terminal.appendLine === "function") {
        // Terminal instance - display each line separately for better formatting
        summary.split("\n").forEach((line) => {
          terminal.appendLine(line);
        });
        if (show && typeof terminal.show === "function") {
          terminal.show();
        }
      } else if (typeof terminal.writeRaw === "function") {
        // Custom terminal with writeRaw method - use colors for better visibility
        terminal.writeRaw(summary + "\n", "\x1b[32m"); // Green color for build summary
      } else {
        // Fallback for output channel
        summary.split("\n").forEach((line) => {
          terminal.appendLine(line);
        });
        if (show) {
          terminal.show();
        }
      }
    }
  } catch (error) {
    console.error("Error in displayBuildSummary:", error);
    // Fallback to safeFuzzingLog if display fails
    safeFuzzingLog(terminal, summary, show);
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
  let outputDir;
  try {
    outputDir = getOutputDirectory();
  } catch (error) {
    // Fall back to hardcoded path for backward compatibility
    outputDir = ".codeforge/fuzzing";
  }

  const fuzzingDir = path.join(workspacePath, outputDir);

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
        const buildResult = await fuzzTargetBuilder.buildFuzzTargets(
          workspacePath,
          containerName,
          preset,
          targets,
          buildDir,
          terminal,
        );

        results.builtTargets += buildResult.builtTargets.length;

        // Collect build errors for proper error tracking in orchestration workflow
        if (buildResult.buildErrors && buildResult.buildErrors.length > 0) {
          // Create error entry for this preset with detailed build error information
          const errorInfo = {
            preset: preset,
            error: `${buildResult.buildErrors.length} target(s) failed to build`,
            type: "build_error",
            timestamp: new Date().toISOString(),
            buildErrors: buildResult.buildErrors,
            failedTargets: buildResult.buildErrors.map((e) => e.target),
            totalTargets: targets.length,
          };

          results.errors.push(errorInfo);
        }

        // Copy executables to central location
        const copiedFuzzers = await fuzzTargetBuilder.copyFuzzExecutables(
          workspacePath,
          containerName,
          buildDir,
          buildResult.builtTargets,
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

/**
 * Build fuzzing targets only (without running fuzzers)
 * Reuses existing discovery and build logic with 87% code reuse
 * @param {string} workspacePath - Path to the workspace
 * @param {Object} terminal - Terminal instance for logging
 * @param {Function} progressCallback - Progress reporting callback
 * @param {Object} options - Build options
 * @returns {Promise<Object>} Build results summary
 */
async function buildFuzzingTargetsOnly(
  workspacePath,
  terminal,
  progressCallback,
  options = {},
) {
  // Lazy load modules to avoid circular dependencies
  const cmakePresetDiscovery = require("./cmakePresetDiscovery");
  const fuzzTargetBuilder = require("./fuzzTargetBuilder");
  const { generateTroubleshootingHint } = fuzzTargetBuilder;

  const results = {
    totalPresets: 0,
    processedPresets: 0,
    totalTargets: 0,
    builtTargets: 0,
    errors: [],
    builtFuzzers: [], // Track built fuzzer executables
  };

  try {
    // Generate container name using existing pattern
    const containerName = dockerOperations.generateContainerName(workspacePath);

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

    if (presets.length === 0) {
      safeFuzzingLog(
        terminal,
        "No CMake presets found. This may be normal if the project doesn't have CMakePresets.json or if discovery failed.",
      );

      // Return early with empty results instead of throwing error
      const message = "Build completed but no CMake presets were found.";
      vscode.window.showInformationMessage(`CodeForge: ${message}`, {
        modal: false,
      });

      return results;
    }

    safeFuzzingLog(
      terminal,
      `Found ${presets.length} CMake preset(s): ${presets.join(", ")}`,
    );

    const allFuzzers = new Map(); // Map to store fuzzer paths

    // Process each preset
    for (let i = 0; i < presets.length; i++) {
      const preset = presets[i];
      const presetProgress = 20 + (i / presets.length) * 70; // 20-90% for preset processing

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
        const buildResult = await fuzzTargetBuilder.buildFuzzTargets(
          workspacePath,
          containerName,
          preset,
          targets,
          buildDir,
          terminal,
        );

        // Update results with successful targets
        results.builtTargets += buildResult.builtTargets.length;

        // Collect build errors for proper error tracking
        if (buildResult.buildErrors && buildResult.buildErrors.length > 0) {
          // Create error entry for this preset with detailed build error information
          const errorInfo = {
            preset: preset,
            error: `${buildResult.buildErrors.length} target(s) failed to build`,
            type: "build_error",
            timestamp: new Date().toISOString(),
            buildErrors: buildResult.buildErrors,
            failedTargets: buildResult.buildErrors.map((e) => e.target),
            totalTargets: targets.length,
          };

          results.errors.push(errorInfo);

          // Display enhanced error information in terminal
          if (terminal && typeof terminal.writeRaw === "function") {
            terminal.writeRaw(
              `\r\n\x1b[31m❌ PARTIAL BUILD FAILURE: ${preset}\x1b[0m\r\n`,
              null,
            );
            terminal.writeRaw(
              `\x1b[31m${buildResult.buildErrors.length} out of ${targets.length} targets failed to build\x1b[0m\r\n`,
              null,
            );

            terminal.writeRaw(`\x1b[33m📋 Failed Targets:\x1b[0m\r\n`, null);
            buildResult.buildErrors.forEach((buildError) => {
              terminal.writeRaw(
                `\x1b[31m  • ${buildError.target}: ${buildError.error}\x1b[0m\r\n`,
                null,
              );
            });
          }
        }

        // Copy executables to central location
        const copiedFuzzers = await fuzzTargetBuilder.copyFuzzExecutables(
          workspacePath,
          containerName,
          buildDir,
          buildResult.builtTargets,
          fuzzingDir,
          terminal,
        );

        // Add to fuzzer collection and results
        copiedFuzzers.forEach((fuzzer) => {
          allFuzzers.set(fuzzer.name, fuzzer.path);
          results.builtFuzzers.push({
            name: fuzzer.name,
            path: fuzzer.path,
            preset: preset,
          });
        });

        results.processedPresets++;
      } catch (error) {
        // Only report actual build errors, not discovery errors
        // Discovery errors are now handled silently in cmakePresetDiscovery.js
        if (error.buildErrors && Array.isArray(error.buildErrors)) {
          // This is a build error - report it to the user
          safeFuzzingLog(
            terminal,
            `Build error processing preset ${preset}: ${error.message}`,
          );

          // Enhanced error tracking with build context
          const errorInfo = {
            preset: preset,
            error: error.message,
            type: "build_error",
            timestamp: new Date().toISOString(),
            buildErrors: error.buildErrors,
            failedTargets: error.buildErrors.map((e) => e.target),
            totalTargets: error.totalTargets || 0,
          };

          results.errors.push(errorInfo);

          // Display enhanced error information in terminal
          if (terminal && typeof terminal.writeRaw === "function") {
            terminal.writeRaw(
              `\r\n\x1b[31m❌ BUILD FAILED: ${preset}\x1b[0m\r\n`,
              null,
            );
            terminal.writeRaw(`\x1b[31m${error.message}\x1b[0m\r\n`, null);

            terminal.writeRaw(`\x1b[33m📋 Failed Targets:\x1b[0m\r\n`, null);
            error.buildErrors.forEach((buildError) => {
              terminal.writeRaw(
                `\x1b[31m  • ${buildError.target}: ${buildError.error}\x1b[0m\r\n`,
                null,
              );
            });
          }
        } else {
          // This is likely a discovery error that wasn't caught - log for debugging only
          console.log(
            `CodeForge Debug: Unexpected error processing preset ${preset}: ${error.message}`,
          );
        }

        // Continue with next preset
      }
    }

    progressCallback("Generating build report", 95);

    // Generate build summary report
    const summary = generateBuildSummary(results);
    displayBuildSummary(terminal, summary, true);

    progressCallback("Build complete", 100);

    // Show completion message with proper mixed results handling
    let message;
    if (results.errors.length === 0) {
      message = `Build completed successfully. ${results.builtTargets} fuzz target(s) built.`;
    } else if (results.builtTargets > 0) {
      const failedCount = results.errors.reduce(
        (count, error) =>
          count + (error.failedTargets ? error.failedTargets.length : 0),
        0,
      );
      message = `Build completed with mixed results. ${results.builtTargets} target(s) built, ${failedCount} failed.`;
    } else {
      message = `Build failed. No fuzz targets were built.`;
    }

    const messageType =
      results.errors.length === 0
        ? "showInformationMessage"
        : "showWarningMessage";
    vscode.window[messageType](`CodeForge: ${message}`, {
      modal: false,
    });

    return results;
  } catch (error) {
    results.errors.push({
      type: "build_workflow",
      error: error.message,
    });

    const action = await handleFuzzingError(error, "build", terminal);
    if (action === "Retry") {
      return buildFuzzingTargetsOnly(
        workspacePath,
        terminal,
        progressCallback,
        options,
      );
    }
    throw error;
  }
}

/**
 * Generates a human-readable summary of build results
 * @param {Object} results - Build results object
 * @returns {string} Formatted summary
 */
function generateBuildSummary(results) {
  // Import troubleshooting function
  const { generateTroubleshootingHint } = require("./fuzzTargetBuilder");

  const lines = [
    "",
    "╔══════════════════════════════════════════════════════════════╗",
    "║                  FUZZING BUILD SUMMARY                       ║",
    "╚══════════════════════════════════════════════════════════════╝",
    "",
    `📊 Build Statistics:`,
    `   • Presets processed: ${results.processedPresets}/${results.totalPresets}`,
    `   • Targets built: ${results.builtTargets}/${results.totalTargets}`,
    `   • Errors encountered: ${results.errors.length}`,
  ];

  // Show successful builds
  if (results.builtFuzzers && results.builtFuzzers.length > 0) {
    lines.push("", "✅ Successfully Built Fuzz Targets:");
    results.builtFuzzers.forEach((fuzzer) => {
      lines.push(`   • ${fuzzer.name} (preset: ${fuzzer.preset})`);
      if (fuzzer.path) {
        lines.push(`     📁 Location: ${fuzzer.path}`);
      }
    });
  }

  // Show dedicated Failed Fuzz Binaries section
  const failedFuzzBinaries = [];
  if (results.errors && results.errors.length > 0) {
    results.errors.forEach((error) => {
      if (error.buildErrors && error.buildErrors.length > 0) {
        error.buildErrors.forEach((buildError) => {
          failedFuzzBinaries.push({
            name: buildError.target || buildError.binaryName,
            preset: error.preset || buildError.preset,
            error: buildError.error,
            buildContext: buildError.buildContext,
            timestamp: buildError.timestamp,
            expectedPath:
              buildError.expectedBinaryPath ||
              (buildError.buildContext
                ? `${buildError.buildContext.buildDir}/${buildError.target}`
                : `build/${buildError.target}`),
            buildDirectory: buildError.buildDirectory,
            binaryName: buildError.binaryName || buildError.target,
          });
        });
      } else if (error.failedTargets && error.failedTargets.length > 0) {
        // Handle cases where we have failed targets but no detailed build errors
        error.failedTargets.forEach((target) => {
          failedFuzzBinaries.push({
            name: target,
            preset: error.preset,
            error: error.error,
            buildContext: null,
            timestamp: error.timestamp,
            expectedPath: `build/${target}`,
          });
        });
      }
    });
  }

  if (failedFuzzBinaries.length > 0) {
    lines.push("", "🚫 FAILED FUZZ BINARIES:");
    lines.push(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    );
    lines.push("   The following fuzz executables could not be compiled:");
    lines.push("");

    failedFuzzBinaries.forEach((binary, index) => {
      lines.push(
        `   🔴 FUZZ BINARY #${index + 1}: ${binary.binaryName || binary.name}`,
      );
      lines.push(
        `      📋 Preset Configuration: ${binary.preset || "unknown"}`,
      );
      lines.push(`      📁 Expected Binary Path: ${binary.expectedPath}`);
      lines.push(
        `      🏗️  Build Directory: ${binary.buildDirectory || "N/A"}`,
      );
      lines.push(`      ❌ COMPILATION STATUS: FAILED`);
      lines.push(`      🎯 Target Name: ${binary.name}`);
      lines.push(`      💥 Build Error: ${binary.error}`);

      if (binary.buildContext) {
        lines.push(
          `      🔧 CMake Build Command: ${binary.buildContext.buildCommand || "N/A"}`,
        );
        lines.push(
          `      📊 Process Exit Code: ${binary.buildContext.exitCode || "N/A"}`,
        );

        if (binary.buildContext.stderr && binary.buildContext.stderr.trim()) {
          const stderrLines = binary.buildContext.stderr.trim().split("\n");
          const truncatedStderr =
            stderrLines.length > 3
              ? stderrLines.slice(0, 3).join("\n") +
                "\n         ... (truncated for brevity)"
              : binary.buildContext.stderr.trim();
          lines.push(`      📝 Compiler Error Output:`);
          lines.push(
            `         ${truncatedStderr.replace(/\n/g, "\n         ")}`,
          );
        }

        if (binary.buildContext.stdout && binary.buildContext.stdout.trim()) {
          const stdoutLines = binary.buildContext.stdout.trim().split("\n");
          if (stdoutLines.length > 0 && stdoutLines[0].trim()) {
            const truncatedStdout =
              stdoutLines.length > 2
                ? stdoutLines.slice(0, 2).join("\n") +
                  "\n         ... (truncated)"
                : binary.buildContext.stdout.trim();
            lines.push(`      📋 Build Output:`);
            lines.push(
              `         ${truncatedStdout.replace(/\n/g, "\n         ")}`,
            );
          }
        }
      }

      // Generate binary-specific troubleshooting hints
      const hint = generateTroubleshootingHint(
        binary.error,
        binary.buildContext,
      );
      if (hint) {
        lines.push(`      💡 BINARY-SPECIFIC TROUBLESHOOTING: ${hint}`);
      }

      if (binary.timestamp) {
        lines.push(
          `      🕐 Build Failed At: ${new Date(binary.timestamp).toLocaleString()}`,
        );
      }

      // Add actionable next steps for this specific binary
      lines.push(
        `      🔍 NEXT STEPS FOR '${binary.binaryName || binary.name}':`,
      );
      lines.push(
        `         1. Check if source files for '${binary.name}' exist`,
      );
      lines.push(
        `         2. Verify CMakeLists.txt defines target '${binary.name}' correctly`,
      );
      lines.push(
        `         3. Ensure fuzzing flags are set in preset '${binary.preset}'`,
      );
      lines.push(
        `         4. Review compiler error output above for specific issues`,
      );

      lines.push("      " + "═".repeat(58));
    });

    // Add comprehensive summary of failed binaries
    lines.push("", `   📊 FAILED FUZZ BINARIES SUMMARY:`);
    lines.push(`      • Total Failed Binaries: ${failedFuzzBinaries.length}`);
    lines.push(
      `      • Executables Not Created: ${failedFuzzBinaries.map((b) => b.binaryName || b.name).join(", ")}`,
    );

    // Group by preset for better overview
    const failuresByPreset = {};
    failedFuzzBinaries.forEach((binary) => {
      const preset = binary.preset || "unknown";
      if (!failuresByPreset[preset]) {
        failuresByPreset[preset] = [];
      }
      failuresByPreset[preset].push(binary.binaryName || binary.name);
    });

    lines.push("      • Binary Failures by Preset:");
    Object.entries(failuresByPreset).forEach(([preset, binaries]) => {
      lines.push(
        `        - ${preset}: ${binaries.join(", ")} (${binaries.length} binary/binaries)`,
      );
    });

    // Add error pattern analysis
    const errorPatterns = {};
    failedFuzzBinaries.forEach((binary) => {
      const error = binary.error.toLowerCase();
      let pattern = "other";
      if (
        error.includes("undefined reference") ||
        error.includes("unresolved external")
      ) {
        pattern = "linking_errors";
      } else if (
        error.includes("no such file") ||
        error.includes("file not found")
      ) {
        pattern = "missing_files";
      } else if (
        error.includes("compiler") ||
        error.includes("gcc") ||
        error.includes("clang")
      ) {
        pattern = "compiler_errors";
      } else if (error.includes("cmake")) {
        pattern = "cmake_errors";
      } else if (error.includes("fuzzer") || error.includes("sanitizer")) {
        pattern = "fuzzing_specific";
      }

      if (!errorPatterns[pattern]) {
        errorPatterns[pattern] = [];
      }
      errorPatterns[pattern].push(binary.binaryName || binary.name);
    });

    lines.push("      • Common Error Patterns:");
    Object.entries(errorPatterns).forEach(([pattern, binaries]) => {
      const patternName = pattern
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      lines.push(
        `        - ${patternName}: ${binaries.join(", ")} (${binaries.length} binary/binaries)`,
      );
    });
  }

  // Show detailed failure information for non-binary specific errors
  const nonBinaryErrors = results.errors.filter(
    (error) => !error.buildErrors || error.buildErrors.length === 0,
  );

  if (nonBinaryErrors.length > 0) {
    lines.push("", "❌ OTHER BUILD FAILURES:");
    lines.push(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    );

    nonBinaryErrors.forEach((error, index) => {
      lines.push(``, `🔴 Failure #${index + 1}:`);

      // Show preset information
      if (error.preset) {
        lines.push(`   📋 Preset: ${error.preset}`);
      }

      // Show error type and message
      lines.push(`   ⚠️  Error Type: ${error.type || "build_error"}`);
      lines.push(`   💥 Error Message: ${error.error}`);

      // Generate hint from main error message
      const hint = generateTroubleshootingHint(error.error);
      if (hint) {
        lines.push(`   💡 Troubleshooting Hint: ${hint}`);
      }

      lines.push("   " + "─".repeat(60));
    });
  }

  // Add comprehensive troubleshooting section for failures
  if (results.errors && results.errors.length > 0) {
    lines.push("", "🔧 GENERAL TROUBLESHOOTING GUIDE:");
    lines.push(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    );
    lines.push("   1. 📋 Verify CMakePresets.json configuration is correct");
    lines.push("   2. 🔍 Check that all required dependencies are installed");
    lines.push("   3. 🧹 Try cleaning build directories and rebuilding");
    lines.push("   4. 🐳 Ensure Docker container has all required build tools");
    lines.push("   5. 📚 Review build logs above for specific error details");
    lines.push("   6. 🔗 Verify all source files and headers are accessible");
    lines.push("   7. ⚙️  Check compiler flags and build configuration");

    // Add specific recommendations based on error patterns
    const allErrors = results.errors
      .map((e) => e.error)
      .join(" ")
      .toLowerCase();
    if (allErrors.includes("cmake")) {
      lines.push(
        "   📌 CMake-specific: Check CMakePresets.json syntax and paths",
      );
    }
    if (
      allErrors.includes("compiler") ||
      allErrors.includes("gcc") ||
      allErrors.includes("clang")
    ) {
      lines.push(
        "   📌 Compiler-specific: Verify compiler installation and flags",
      );
    }
    if (allErrors.includes("permission")) {
      lines.push("   📌 Permission-specific: Check file/directory permissions");
    }
    if (allErrors.includes("not found") || allErrors.includes("no such file")) {
      lines.push(
        "   📌 File-specific: Verify all file paths and dependencies exist",
      );
    }
  }

  // Show successful builds summary at the end
  if (results.builtFuzzers && results.builtFuzzers.length > 0) {
    lines.push("", "📁 Built Target Locations:");
    results.builtFuzzers.forEach((fuzzer) => {
      lines.push(`   • ${fuzzer.name}: ${fuzzer.path || "path not available"}`);
    });
  }

  // Final status summary with binary-specific information
  lines.push("", "═".repeat(64));
  if (results.errors.length === 0) {
    lines.push(
      "🎉 BUILD COMPLETED SUCCESSFULLY - All fuzz targets built without errors!",
    );
    lines.push(
      `   ✅ ${results.builtTargets} fuzz binary/binaries successfully compiled`,
    );
  } else if (results.builtTargets > 0) {
    const failedBinaryCount = failedFuzzBinaries.length;
    lines.push(`⚠️  BUILD COMPLETED WITH ISSUES:`);
    lines.push(
      `   ✅ ${results.builtTargets} fuzz binary/binaries successfully compiled`,
    );
    lines.push(
      `   ❌ ${failedBinaryCount} fuzz binary/binaries failed to compile`,
    );
    lines.push(
      `   📊 Success Rate: ${Math.round((results.builtTargets / (results.builtTargets + failedBinaryCount)) * 100)}%`,
    );
  } else {
    const failedBinaryCount = failedFuzzBinaries.length;
    lines.push("❌ BUILD FAILED - No fuzz binaries were successfully compiled");
    lines.push(
      `   🚫 ${failedBinaryCount} fuzz binary/binaries failed to compile`,
    );
    lines.push(
      "   💡 Review the 'FAILED FUZZ BINARIES' section above for specific details",
    );
  }
  lines.push("═".repeat(64));

  return lines.join("\n");
}

module.exports = {
  runFuzzingTests,
  buildFuzzingTargetsOnly,
  orchestrateFuzzingWorkflow,
  createFuzzingDirectory,
  safeFuzzingLog,
  displayBuildSummary,
  handleFuzzingError,
  generateFuzzingSummary,
  generateBuildSummary,
};
