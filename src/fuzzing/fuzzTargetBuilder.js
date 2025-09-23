const dockerOperations = require("../core/dockerOperations");
const path = require("path");

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
    console.log(`CodeForge Fuzzing: ${message}`);
  }
}

/**
 * Creates a temporary build directory for a preset
 * @param {string} fuzzingDir - Base fuzzing directory
 * @param {string} preset - CMake preset name
 * @returns {Promise<string>} Path to the build directory
 */
async function createTemporaryBuildDirectory(fuzzingDir, preset) {
  const buildDir = path.join(fuzzingDir, `build-${preset}`);
  return buildDir;
}

/**
 * Builds fuzz targets for a specific preset
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} preset - CMake preset name
 * @param {string[]} targets - Array of target names to build
 * @param {string} buildDir - Build directory path
 * @param {Object} terminal - Terminal instance for logging
 * @returns {Promise<string[]>} Array of successfully built target names
 */
async function buildFuzzTargets(
  workspacePath,
  containerName,
  preset,
  targets,
  buildDir,
  terminal,
) {
  const builtTargets = [];
  const buildErrors = [];

  safeFuzzingLog(
    terminal,
    `Building ${targets.length} fuzz target(s) for preset ${preset}...`,
  );

  // Display build header in terminal
  if (terminal && typeof terminal.writeRaw === "function") {
    terminal.writeRaw(
      `\r\n\x1b[36m╭─ BUILDING PRESET: ${preset} ─╮\x1b[0m\r\n`,
      null,
    );
    terminal.writeRaw(
      `\x1b[36m│ Targets: ${targets.join(", ")}\x1b[0m\r\n`,
      null,
    );
    terminal.writeRaw(`\x1b[36m│ Build Dir: ${buildDir}\x1b[0m\r\n`, null);
    terminal.writeRaw(
      `\x1b[36m╰─────────────────────────────╯\x1b[0m\r\n\r\n`,
      null,
    );
  }

  for (const target of targets) {
    try {
      await buildSingleTarget(
        workspacePath,
        containerName,
        target,
        buildDir,
        terminal,
      );
      builtTargets.push(target);
      safeFuzzingLog(terminal, `Successfully built target: ${target}`);
    } catch (error) {
      const errorMsg = `Failed to build target ${target}: ${error.message}`;
      safeFuzzingLog(terminal, errorMsg);

      // Enhanced error tracking with build context and binary information
      const expectedBinaryPath = `${buildDir}/${target}`;
      const errorInfo = {
        target: target,
        preset: preset,
        error: error.message,
        buildContext: error.buildContext || null,
        timestamp: new Date().toISOString(),
        expectedBinaryPath: expectedBinaryPath,
        binaryName: target,
        buildDirectory: buildDir,
      };

      buildErrors.push(errorInfo);

      // Display error summary in terminal
      if (terminal && typeof terminal.writeRaw === "function") {
        terminal.writeRaw(
          `\r\n\x1b[31m❌ Target ${target} failed to build\x1b[0m\r\n`,
          null,
        );

        // Add troubleshooting hints based on common error patterns
        const troubleshootingHint = generateTroubleshootingHint(
          error.message,
          error.buildContext,
        );
        if (troubleshootingHint) {
          terminal.writeRaw(
            `\x1b[33m💡 Hint: ${troubleshootingHint}\x1b[0m\r\n`,
            null,
          );
        }
      }

      // Continue with other targets even if one fails
    }
  }

  // Display build summary
  if (terminal && typeof terminal.writeRaw === "function") {
    terminal.writeRaw(
      `\r\n\x1b[36m╭─ BUILD SUMMARY: ${preset} ─╮\x1b[0m\r\n`,
      null,
    );
    terminal.writeRaw(
      `\x1b[36m│ Success: ${builtTargets.length}/${targets.length} targets\x1b[0m\r\n`,
      null,
    );
    terminal.writeRaw(
      `\x1b[36m│ Errors: ${buildErrors.length}\x1b[0m\r\n`,
      null,
    );
    terminal.writeRaw(
      `\x1b[36m╰─────────────────────────────╯\x1b[0m\r\n`,
      null,
    );
  }

  if (buildErrors.length > 0) {
    safeFuzzingLog(
      terminal,
      `Build completed with ${buildErrors.length} error(s) out of ${targets.length} target(s)`,
    );
  }

  if (builtTargets.length === 0) {
    // Create enhanced error with detailed failure information
    const error = new Error(
      `No targets were successfully built for preset ${preset}`,
    );
    error.buildErrors = buildErrors;
    error.preset = preset;
    error.totalTargets = targets.length;
    throw error;
  }

  // Return both successful targets and build errors for proper error propagation
  return {
    builtTargets: builtTargets,
    buildErrors: buildErrors,
  };
}

/**
 * Builds a single fuzz target
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} target - Target name to build
 * @param {string} buildDir - Build directory path
 * @param {Object} terminal - Terminal instance for logging
 * @returns {Promise<void>}
 */
async function buildSingleTarget(
  workspacePath,
  containerName,
  target,
  buildDir,
  terminal,
) {
  return new Promise((resolve, reject) => {
    safeFuzzingLog(terminal, `Building target: ${target}`);

    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    const buildCommand = `cmake --build "${buildDir}" --target "${target}"`;

    const buildProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      buildCommand,
      "/bin/bash",
      options,
    );

    let stdout = "";
    let stderr = "";

    buildProcess.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      // Stream build output to terminal in real-time for better user feedback
      if (terminal && typeof terminal.writeRaw === "function") {
        terminal.writeRaw(chunk, "\x1b[37m"); // Light gray for build output
      }
    });

    buildProcess.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      // Stream error output to terminal in real-time with error formatting
      if (terminal && typeof terminal.writeRaw === "function") {
        terminal.writeRaw(chunk, "\x1b[31m"); // Red for error output
      }
    });

    buildProcess.on("close", (code) => {
      if (code !== 0) {
        // Create enhanced error with complete build context
        const error = new Error(
          `Build failed with exit code ${code}: ${stderr}`,
        );

        // Add detailed error context for better debugging
        error.buildContext = {
          target: target,
          buildDir: buildDir,
          exitCode: code,
          stdout: stdout,
          stderr: stderr,
          buildCommand: buildCommand,
          timestamp: new Date().toISOString(),
        };

        // Display formatted error in terminal
        if (terminal && typeof terminal.writeRaw === "function") {
          terminal.writeRaw(
            `\r\n\x1b[31m╭─ BUILD FAILED: ${target} ─╮\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(`\x1b[31m│ Exit Code: ${code}\x1b[0m\r\n`, null);
          terminal.writeRaw(
            `\x1b[31m│ Command: ${buildCommand}\x1b[0m\r\n`,
            null,
          );
          terminal.writeRaw(
            `\x1b[31m╰─────────────────────────────╯\x1b[0m\r\n`,
            null,
          );

          if (stderr.trim()) {
            terminal.writeRaw(`\r\n\x1b[33m📋 Error Output:\x1b[0m\r\n`, null);
            terminal.writeRaw(`\x1b[31m${stderr}\x1b[0m\r\n`, null);
          }

          if (stdout.trim()) {
            terminal.writeRaw(`\r\n\x1b[33m📋 Build Output:\x1b[0m\r\n`, null);
            terminal.writeRaw(`\x1b[37m${stdout}\x1b[0m\r\n`, null);
          }
        }

        reject(error);
        return;
      }

      // Success case - show completion with summary
      if (terminal && typeof terminal.writeRaw === "function") {
        terminal.writeRaw(
          `\r\n\x1b[32m✅ Successfully built: ${target}\x1b[0m\r\n`,
          null,
        );
      }

      safeFuzzingLog(terminal, `Build completed successfully for ${target}`);
      resolve();
    });

    buildProcess.on("error", (error) => {
      const wrappedError = new Error(
        `Failed to execute build command: ${error.message}`,
      );

      // Add context for process execution errors
      wrappedError.buildContext = {
        target: target,
        buildDir: buildDir,
        buildCommand: buildCommand,
        processError: error.message,
        timestamp: new Date().toISOString(),
      };

      // Display formatted process error in terminal
      if (terminal && typeof terminal.writeRaw === "function") {
        terminal.writeRaw(
          `\r\n\x1b[31m❌ PROCESS ERROR: ${target}\x1b[0m\r\n`,
          null,
        );
        terminal.writeRaw(`\x1b[31m${error.message}\x1b[0m\r\n`, null);
      }

      reject(wrappedError);
    });
  });
}

/**
 * Copies built fuzz executables to the central fuzzing directory
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} buildDir - Build directory path
 * @param {string[]} targets - Array of built target names
 * @param {string} fuzzingDir - Central fuzzing directory
 * @param {Object} terminal - Terminal instance for logging
 * @returns {Promise<Object[]>} Array of copied fuzzer info objects
 */
async function copyFuzzExecutables(
  workspacePath,
  containerName,
  buildDir,
  targets,
  fuzzingDir,
  terminal,
) {
  const copiedFuzzers = [];

  safeFuzzingLog(
    terminal,
    `Copying ${targets.length} executable(s) to central location...`,
  );

  for (const target of targets) {
    try {
      const fuzzerInfo = await copyExecutable(
        workspacePath,
        containerName,
        buildDir,
        target,
        fuzzingDir,
        terminal,
      );
      copiedFuzzers.push(fuzzerInfo);
      safeFuzzingLog(
        terminal,
        `Copied executable: ${target} -> ${fuzzerInfo.path}`,
      );
    } catch (error) {
      safeFuzzingLog(
        terminal,
        `Failed to copy executable for ${target}: ${error.message}`,
      );
      // Continue with other executables
    }
  }

  return copiedFuzzers;
}

/**
 * Copies a single executable to the fuzzing directory
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} buildDir - Build directory path
 * @param {string} target - Target name
 * @param {string} fuzzingDir - Central fuzzing directory
 * @param {Object} terminal - Terminal instance for logging
 * @returns {Promise<Object>} Fuzzer info object
 */
async function copyExecutable(
  workspacePath,
  containerName,
  buildDir,
  target,
  fuzzingDir,
  terminal,
) {
  return new Promise((resolve, reject) => {
    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    // Find the executable in the build directory
    const findCommand = `find "${buildDir}" -name "${target}" -type f -executable 2>/dev/null | head -1`;

    const findProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      findCommand,
      "/bin/bash",
      options,
    );

    let stdout = "";
    let stderr = "";

    findProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    findProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    findProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to find executable for ${target}: ${stderr}`));
        return;
      }

      const executablePath = stdout.trim();
      if (!executablePath) {
        reject(new Error(`No executable found for target ${target}`));
        return;
      }

      // Copy the executable to the fuzzing directory
      const destinationPath = path.join(fuzzingDir, target);
      const copyCommand = `cp -p "${executablePath}" "${destinationPath}" && chmod +x "${destinationPath}"`;

      const copyProcess = dockerOperations.runDockerCommandWithOutput(
        workspacePath,
        containerName,
        copyCommand,
        "/bin/bash",
        options,
      );

      copyProcess.on("close", (copyCode) => {
        if (copyCode !== 0) {
          reject(new Error(`Failed to copy executable for ${target}`));
          return;
        }

        resolve({
          name: target,
          path: destinationPath,
          originalPath: executablePath,
        });
      });

      copyProcess.on("error", (error) => {
        reject(new Error(`Failed to execute copy command: ${error.message}`));
      });
    });

    findProcess.on("error", (error) => {
      reject(new Error(`Failed to execute find command: ${error.message}`));
    });
  });
}

/**
 * Cleans up temporary build directories
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string[]} buildDirs - Array of build directory paths to clean
 * @param {Object} terminal - Terminal instance for logging
 * @returns {Promise<void>}
 */
async function cleanupBuildDirectories(
  workspacePath,
  containerName,
  buildDirs,
  terminal,
) {
  if (buildDirs.length === 0) return;

  safeFuzzingLog(
    terminal,
    `Cleaning up ${buildDirs.length} build director(ies)...`,
  );

  const options = {
    removeAfterRun: true,
    mountWorkspace: true,
    dockerCommand: "docker",
  };

  const cleanupCommand = `rm -rf ${buildDirs.map((dir) => `"${dir}"`).join(" ")}`;

  return new Promise((resolve) => {
    const cleanupProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      cleanupCommand,
      "/bin/bash",
      options,
    );

    cleanupProcess.on("close", (code) => {
      if (code === 0) {
        safeFuzzingLog(terminal, "Build directories cleaned up successfully");
      } else {
        safeFuzzingLog(
          terminal,
          "Warning: Some build directories may not have been cleaned up properly",
        );
      }
      resolve();
    });

    cleanupProcess.on("error", (error) => {
      safeFuzzingLog(terminal, `Warning: Cleanup error: ${error.message}`);
      resolve(); // Don't fail the entire process for cleanup errors
    });
  });
}

/**
 * Generates troubleshooting hints based on error patterns
 * @param {string} errorMessage - The error message from build failure
 * @param {Object} buildContext - Additional build context if available
 * @returns {string|null} Troubleshooting hint or null if no specific hint available
 */
function generateTroubleshootingHint(errorMessage, buildContext) {
  if (!errorMessage) return null;

  const message = errorMessage.toLowerCase();

  // Binary-specific error patterns for fuzz targets
  if (message.includes("libfuzzer") || message.includes("fuzzer")) {
    if (message.includes("not found") || message.includes("undefined")) {
      return "LibFuzzer not available - ensure fuzzing flags (-fsanitize=fuzzer) are set in CMakePresets.json";
    }
    return "Fuzzer-specific build issue - verify fuzzing compiler flags and LibFuzzer availability";
  }

  if (
    message.includes("sanitizer") ||
    message.includes("asan") ||
    message.includes("msan") ||
    message.includes("ubsan")
  ) {
    return "Sanitizer build issue - check if sanitizer flags are properly configured in preset";
  }

  // Binary executable specific errors
  if (
    message.includes("cannot execute binary file") ||
    message.includes("exec format error")
  ) {
    return "Binary architecture mismatch - ensure target architecture matches container environment";
  }

  if (
    message.includes("shared library") ||
    message.includes("libstdc++") ||
    message.includes("libc++")
  ) {
    return "Missing runtime libraries - verify all required shared libraries are available in container";
  }

  // Common CMake/build error patterns with binary context
  if (
    message.includes("no such file or directory") ||
    message.includes("file not found")
  ) {
    if (buildContext && buildContext.target) {
      return `Source files missing for target '${buildContext.target}' - check CMakeLists.txt target definition`;
    }
    return "Check if all source files exist and paths are correct in CMakeLists.txt";
  }

  if (
    message.includes("undefined reference") ||
    message.includes("unresolved external")
  ) {
    if (buildContext && buildContext.target) {
      return `Linking error for binary '${buildContext.target}' - missing library dependencies or incorrect linking`;
    }
    return "Missing library dependencies or incorrect linking configuration";
  }

  if (message.includes("permission denied")) {
    if (buildContext && buildContext.buildDir) {
      return `Permission issue in build directory '${buildContext.buildDir}' - try cleaning build directory`;
    }
    return "Build directory permissions issue - try cleaning build directory";
  }

  if (message.includes("cmake") && message.includes("not found")) {
    return "CMake configuration issue - verify CMakePresets.json and dependencies";
  }

  if (
    message.includes("compiler") ||
    message.includes("gcc") ||
    message.includes("clang")
  ) {
    if (buildContext && buildContext.target) {
      return `Compiler issue building '${buildContext.target}' - check compiler availability and flags`;
    }
    return "Compiler issue - check if required compiler and flags are available";
  }

  if (
    message.includes("make") &&
    (message.includes("error") || message.includes("failed"))
  ) {
    if (buildContext && buildContext.exitCode) {
      return `Build system error (exit code ${buildContext.exitCode}) - try cleaning build directory and rebuilding`;
    }
    return "Build system error - try cleaning build directory and rebuilding";
  }

  if (message.includes("target") && message.includes("does not exist")) {
    if (buildContext && buildContext.target) {
      return `Target '${buildContext.target}' not defined in CMakeLists.txt - verify target name and configuration`;
    }
    return "Target not defined in CMakeLists.txt - verify target name and configuration";
  }

  // Binary-specific final fallback
  if (buildContext && buildContext.target) {
    return `Binary '${buildContext.target}' failed to compile - check build logs and target configuration`;
  }

  return "Check build logs above for specific error details";
}

module.exports = {
  createTemporaryBuildDirectory,
  buildFuzzTargets,
  buildSingleTarget,
  copyFuzzExecutables,
  copyExecutable,
  cleanupBuildDirectories,
  generateTroubleshootingHint,
};
