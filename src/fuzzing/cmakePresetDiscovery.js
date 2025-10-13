const dockerOperations = require("../core/dockerOperations");

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
 * Discovers fuzz tests using the find-fuzz-tests.sh script
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {Object} terminal - Terminal instance for logging
 * @param {boolean} cleanCache - Whether to clean the cache (-c flag)
 * @returns {Promise<Array>} Array of objects with {preset, fuzzer} properties
 */
async function discoverFuzzTestsWithScript(
  workspacePath,
  containerName,
  terminal,
  cleanCache = false,
  resourceManager = null,
) {
  return new Promise((resolve, reject) => {
    safeFuzzingLog(terminal, "Discovering fuzz tests...");

    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
      resourceManager: resourceManager,
    };

    // Build the script command with appropriate flags
    const flags = ["-q"]; // Always use quiet mode for cleaner output
    if (cleanCache) {
      flags.push("-c");
    }
    const scriptCommand = `.codeforge/scripts/find-fuzz-tests.sh ${flags.join(" ")}`;

    const dockerProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      scriptCommand,
      "/bin/bash",
      options,
    );

    let stdout = "";
    let stderr = "";

    dockerProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    dockerProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    dockerProcess.on("close", (code) => {
      if (code !== 0) {
        // Display formatted error in terminal with full context
        if (terminal && typeof terminal.writeRaw === "function") {
          terminal.writeRaw(
            `\r\n\x1b[31m╭─ SCRIPT DISCOVERY FAILED ─╮\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(`\x1b[31m│ Exit Code: ${code}\x1b[0m\r\n`, null);
          terminal.writeRaw(
            `\x1b[31m│ Command: ${scriptCommand}\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(
            `\x1b[31m╰─────────────────────────────╯\x1b[0m\r\n`,
            null,
          );

          // Display script output if available
          if (stdout.trim()) {
            terminal.writeRaw(`\r\n\x1b[33m📋 Script Output:\x1b[0m\r\n`, null);
            terminal.writeRaw(`\x1b[37m${stdout}\x1b[0m\r\n`, null);
          }

          if (stderr.trim()) {
            terminal.writeRaw(`\r\n\x1b[33m📋 Error Output:\x1b[0m\r\n`, null);
            terminal.writeRaw(`\x1b[31m${stderr}\x1b[0m\r\n`, null);
          }

          // Provide troubleshooting guidance
          terminal.writeRaw(`\r\n\x1b[93m💡 Troubleshooting:\x1b[0m\r\n`, null);
          terminal.writeRaw(
            `\x1b[93m• Check CMake configuration and presets\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(
            `\x1b[93m• Verify build environment setup\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(
            `\x1b[93m• Ensure script permissions and availability\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(
            `\x1b[93m• Review project structure and dependencies\x1b[0m\r\n`,
            null,
          );
        }

        // Also use safeFuzzingLog for compatibility with different terminal types
        safeFuzzingLog(
          terminal,
          `❌ Script execution failed: ${scriptCommand}`,
          true,
        );
        safeFuzzingLog(terminal, `Exit code: ${code}`);

        if (stderr.trim()) {
          safeFuzzingLog(terminal, `Error output: ${stderr.trim()}`);
        }

        safeFuzzingLog(
          terminal,
          "This error occurred during fuzz test discovery. Please check CMake configuration, build environment, and script availability.",
        );

        const error = new Error(
          `Fuzz test discovery script failed with exit code ${code}: ${stderr}`,
        );

        // Log for debugging but don't fail the entire workflow
        console.log(
          `CodeForge Debug: Fuzz test discovery script failed: ${error.message}`,
        );
        resolve([]); // Return empty array instead of rejecting
        return;
      }

      try {
        // Parse the script output format: "preset:fuzzer_name" (one per line)
        const lines = stdout
          .trim()
          .split("\n")
          .filter((line) => line.trim());
        const fuzzTests = [];

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine && trimmedLine.includes(":")) {
            const [preset, fuzzer] = trimmedLine.split(":", 2);
            if (preset && fuzzer) {
              fuzzTests.push({
                preset: preset.trim(),
                fuzzer: fuzzer.trim(),
              });
            }
          }
        }

        safeFuzzingLog(terminal, `Discovered ${fuzzTests.length} fuzz test(s)`);

        // Log the discovered tests for debugging
        if (fuzzTests.length > 0) {
          const summary = fuzzTests
            .map((ft) => `${ft.preset}:${ft.fuzzer}`)
            .join(", ");
          safeFuzzingLog(terminal, `Found: ${summary}`);
        }

        resolve(fuzzTests);
      } catch (parseError) {
        // Display formatted parse error in terminal
        if (terminal && typeof terminal.writeRaw === "function") {
          terminal.writeRaw(
            `\r\n\x1b[31m╭─ SCRIPT OUTPUT PARSE ERROR ─╮\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(
            `\x1b[31m│ Failed to parse script output\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(
            `\x1b[31m│ Command: ${scriptCommand}\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(
            `\x1b[31m╰─────────────────────────────────╯\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(`\r\n\x1b[31m❌ Parse Error:\x1b[0m\r\n`, null);
          terminal.writeRaw(`\x1b[31m${parseError.message}\x1b[0m\r\n`, null);

          // Show the raw output that failed to parse
          if (stdout.trim()) {
            terminal.writeRaw(
              `\r\n\x1b[33m📋 Raw Script Output:\x1b[0m\r\n`,
              null,
            );
            terminal.writeRaw(`\x1b[37m${stdout}\x1b[0m\r\n`, null);
          }

          // Provide troubleshooting guidance for parse errors
          terminal.writeRaw(`\r\n\x1b[93m💡 Troubleshooting:\x1b[0m\r\n`, null);
          terminal.writeRaw(
            `\x1b[93m• Check script output format (expected: preset:fuzzer)\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(
            `\x1b[93m• Verify script is producing valid output\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(
            `\x1b[93m• Review script execution and dependencies\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(
            `\x1b[93m• Check for unexpected characters or formatting\x1b[0m\r\n`,
            null,
          );
        }

        // Also use safeFuzzingLog for compatibility
        safeFuzzingLog(
          terminal,
          `❌ Failed to parse script output: ${parseError.message}`,
          true,
        );
        safeFuzzingLog(
          terminal,
          "This error occurred while parsing script output. Please check script output format and execution.",
        );

        const error = new Error(
          `Failed to parse script output: ${parseError.message}`,
        );
        reject(error);
      }
    });

    dockerProcess.on("error", (error) => {
      // Display formatted process error in terminal
      if (terminal && typeof terminal.writeRaw === "function") {
        terminal.writeRaw(
          `\r\n\x1b[31m╭─ SCRIPT PROCESS ERROR ─╮\x1b[0m\r\n`,
          null,
        );
        terminal.writeRaw(
          `\x1b[31m│ Failed to execute discovery script\x1b[0m\r\n`,
          null,
        );
        terminal.writeRaw(
          `\x1b[31m│ Command: ${scriptCommand}\x1b[0m\r\n`,
          null,
        );
        terminal.writeRaw(
          `\x1b[31m╰─────────────────────────────╯\x1b[0m\r\n`,
          null,
        );
        terminal.writeRaw(`\r\n\x1b[31m❌ Process Error:\x1b[0m\r\n`, null);
        terminal.writeRaw(`\x1b[31m${error.message}\x1b[0m\r\n`, null);

        // Provide troubleshooting guidance for process errors
        terminal.writeRaw(`\r\n\x1b[93m💡 Troubleshooting:\x1b[0m\r\n`, null);
        terminal.writeRaw(
          `\x1b[93m• Check Docker daemon is running\x1b[0m\r\n`,
          null,
        );
        terminal.writeRaw(
          `\x1b[93m• Verify container and image availability\x1b[0m\r\n`,
          null,
        );
        terminal.writeRaw(
          `\x1b[93m• Ensure script file exists and is executable\x1b[0m\r\n`,
          null,
        );
        terminal.writeRaw(
          `\x1b[93m• Review Docker permissions and configuration\x1b[0m\r\n`,
          null,
        );
      }

      // Also use safeFuzzingLog for compatibility
      safeFuzzingLog(
        terminal,
        `❌ Failed to execute discovery script: ${error.message}`,
        true,
      );
      safeFuzzingLog(
        terminal,
        "This error occurred during script execution. Please check Docker daemon, container availability, and script permissions.",
      );

      const wrappedError = new Error(
        `Failed to execute fuzz test discovery script: ${error.message}`,
      );

      // Log for debugging but don't fail the entire workflow
      console.log(
        `CodeForge Debug: Docker execution error during script discovery: ${wrappedError.message}`,
      );
      resolve([]); // Return empty array instead of rejecting
    });
  });
}

/**
 * Legacy function for backward compatibility
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {Object} terminal - Terminal instance for logging
 * @returns {Promise<string[]>} Array of preset names
 */
async function discoverCMakePresets(workspacePath, containerName, terminal) {
  const fuzzTests = await discoverFuzzTestsWithScript(
    workspacePath,
    containerName,
    terminal,
  );

  // Extract unique presets for backward compatibility
  const presets = [...new Set(fuzzTests.map((ft) => ft.preset))];

  safeFuzzingLog(
    terminal,
    `Extracted ${presets.length} unique preset(s): ${presets.join(", ")}`,
  );

  return presets;
}

/**
 * Legacy function for backward compatibility
 * Returns fuzz targets for a specific preset by filtering results
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} preset - CMake preset name
 * @param {string} buildDir - Build directory path (unused)
 * @param {Object} terminal - Terminal instance for logging
 * @returns {Promise<string[]>} Array of fuzz target names
 */
async function discoverFuzzTargets(
  workspacePath,
  containerName,
  preset,
  buildDir,
  terminal,
) {
  try {
    safeFuzzingLog(
      terminal,
      `Discovering fuzz targets for preset ${preset}...`,
    );

    // Use discovery script
    const fuzzTests = await discoverFuzzTestsWithScript(
      workspacePath,
      containerName,
      terminal,
    );

    // Filter results for the specific preset
    const targetsForPreset = fuzzTests
      .filter((ft) => ft.preset === preset)
      .map((ft) => ft.fuzzer);

    safeFuzzingLog(
      terminal,
      `Found ${targetsForPreset.length} fuzz target(s) for preset ${preset}: ${targetsForPreset.join(", ")}`,
    );

    return targetsForPreset;
  } catch (error) {
    // Log for debugging but don't fail the entire workflow
    console.log(
      `CodeForge Debug: Target discovery failed for preset ${preset}: ${error.message}`,
    );
    return []; // Return empty array instead of throwing
  }
}

/**
 * Legacy function for backward compatibility - simplified validation
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} preset - CMake preset name
 * @param {Object} terminal - Terminal instance for logging
 * @returns {Promise<boolean>} True if preset is valid
 */
async function validatePresetConfiguration(
  workspacePath,
  containerName,
  preset,
  terminal,
) {
  safeFuzzingLog(terminal, `Validating preset configuration: ${preset}`);

  // If the preset appears in discovery output, it's considered valid
  try {
    const fuzzTests = await discoverFuzzTestsWithScript(
      workspacePath,
      containerName,
      terminal,
    );
    const isValid = fuzzTests.some((ft) => ft.preset === preset);

    safeFuzzingLog(
      terminal,
      `Preset ${preset} validation: ${isValid ? "PASSED" : "FAILED"}`,
    );

    return isValid;
  } catch (error) {
    safeFuzzingLog(
      terminal,
      `Preset ${preset} validation error: ${error.message}`,
    );
    return false;
  }
}

module.exports = {
  discoverCMakePresets,
  discoverFuzzTargets,
  discoverFuzzTestsWithScript,
  validatePresetConfiguration,
};
