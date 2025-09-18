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
      buildErrors.push({
        target: target,
        error: error.message,
      });
      // Continue with other targets even if one fails
    }
  }

  if (buildErrors.length > 0) {
    safeFuzzingLog(
      terminal,
      `Build completed with ${buildErrors.length} error(s) out of ${targets.length} target(s)`,
    );
  }

  if (builtTargets.length === 0) {
    throw new Error(`No targets were successfully built for preset ${preset}`);
  }

  return builtTargets;
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
      stdout += data.toString();
    });

    buildProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    buildProcess.on("close", (code) => {
      if (code !== 0) {
        const error = new Error(
          `Build failed with exit code ${code}: ${stderr}`,
        );
        reject(error);
        return;
      }

      safeFuzzingLog(
        terminal,
        `Build output for ${target}: ${stdout.slice(-200)}`,
      ); // Log last 200 chars
      resolve();
    });

    buildProcess.on("error", (error) => {
      const wrappedError = new Error(
        `Failed to execute build command: ${error.message}`,
      );
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

module.exports = {
  createTemporaryBuildDirectory,
  buildFuzzTargets,
  buildSingleTarget,
  copyFuzzExecutables,
  copyExecutable,
  cleanupBuildDirectories,
};
