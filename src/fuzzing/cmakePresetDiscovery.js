const dockerOperations = require("../../dockerOperations");

/**
 * Safe wrapper for fuzzing output channel operations
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
    console.log(`CodeForge Fuzzing: ${message}`);
  }
}

/**
 * Discovers CMake presets in the workspace
 * Replicates the functionality of: cmake . --list-presets | tail +2 | awk -F'"' '{print $2}'
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @returns {Promise<string[]>} Array of preset names
 */
async function discoverCMakePresets(
  workspacePath,
  containerName,
  outputChannel,
) {
  return new Promise((resolve, reject) => {
    safeFuzzingLog(
      outputChannel,
      "Executing cmake --list-presets in container...",
    );

    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    const dockerProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      "cmake . --list-presets",
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
        const error = new Error(
          `CMake preset discovery failed with exit code ${code}: ${stderr}`,
        );
        safeFuzzingLog(
          outputChannel,
          `CMake preset discovery error: ${error.message}`,
        );
        reject(error);
        return;
      }

      try {
        // Parse the output to extract preset names
        // Skip the first line (header) and extract quoted preset names
        const lines = stdout.trim().split("\n");
        const presets = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          // Look for quoted preset names using regex
          const match = line.match(/"([^"]+)"/);
          if (match && match[1]) {
            presets.push(match[1]);
          }
        }

        safeFuzzingLog(
          outputChannel,
          `Discovered ${presets.length} preset(s): ${presets.join(", ")}`,
        );
        resolve(presets);
      } catch (parseError) {
        const error = new Error(
          `Failed to parse CMake preset output: ${parseError.message}`,
        );
        safeFuzzingLog(outputChannel, `Parse error: ${error.message}`);
        reject(error);
      }
    });

    dockerProcess.on("error", (error) => {
      const wrappedError = new Error(
        `Failed to execute CMake preset discovery: ${error.message}`,
      );
      safeFuzzingLog(
        outputChannel,
        `Docker execution error: ${wrappedError.message}`,
      );
      reject(wrappedError);
    });
  });
}

/**
 * Detects the CMake generator used in the build directory
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} buildDir - Build directory path
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @returns {Promise<string>} Generator type ('ninja' or 'make')
 */
async function detectCMakeGenerator(
  workspacePath,
  containerName,
  buildDir,
  outputChannel,
) {
  return new Promise((resolve, reject) => {
    safeFuzzingLog(
      outputChannel,
      `Detecting CMake generator in ${buildDir}...`,
    );

    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    // Check for Ninja build files first
    const checkCommand = `if [ -f "${buildDir}/build.ninja" ]; then echo "ninja"; elif [ -f "${buildDir}/Makefile" ]; then echo "make"; else echo "unknown"; fi`;

    const checkProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      checkCommand,
      "/bin/bash",
      options,
    );

    let stdout = "";
    let stderr = "";

    checkProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    checkProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    checkProcess.on("close", (code) => {
      if (code !== 0) {
        const error = new Error(`Generator detection failed: ${stderr}`);
        safeFuzzingLog(
          outputChannel,
          `Generator detection error: ${error.message}`,
        );
        reject(error);
        return;
      }

      const generator = stdout.trim().toLowerCase();
      safeFuzzingLog(outputChannel, `Detected generator: ${generator}`);
      resolve(generator);
    });

    checkProcess.on("error", (error) => {
      const wrappedError = new Error(
        `Failed to detect generator: ${error.message}`,
      );
      safeFuzzingLog(
        outputChannel,
        `Generator detection error: ${wrappedError.message}`,
      );
      reject(wrappedError);
    });
  });
}

/**
 * Discovers fuzz targets using Make generator
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} buildDir - Build directory path
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @returns {Promise<string[]>} Array of fuzz target names
 */
async function discoverFuzzTargetsMake(
  workspacePath,
  containerName,
  buildDir,
  outputChannel,
) {
  return new Promise((resolve, reject) => {
    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    const helpCommand = `cmake --build "${buildDir}" --target help`;

    const helpProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      helpCommand,
      "/bin/bash",
      options,
    );

    let helpStdout = "";
    let helpStderr = "";

    helpProcess.stdout.on("data", (data) => {
      helpStdout += data.toString();
    });

    helpProcess.stderr.on("data", (data) => {
      helpStderr += data.toString();
    });

    helpProcess.on("close", (helpCode) => {
      if (helpCode !== 0) {
        const error = new Error(`CMake help failed: ${helpStderr}`);
        safeFuzzingLog(
          outputChannel,
          `Make help command error: ${error.message}`,
        );
        reject(error);
        return;
      }

      try {
        // Parse the help output to find fuzz targets (Make format)
        const lines = helpStdout.split("\n");
        const fuzzTargets = [];

        for (const line of lines) {
          // Look for lines containing ": phony" (indicating a target)
          if (line.includes(": phony")) {
            // Extract the target name (everything before the first colon)
            const targetMatch = line.match(/^([^:]+):/);
            if (targetMatch && targetMatch[1]) {
              const targetName = targetMatch[1].trim();
              // Check if it matches the fuzz target pattern
              if (/^codeforge-.*-fuzz$/.test(targetName)) {
                fuzzTargets.push(targetName);
              }
            }
          }
        }

        safeFuzzingLog(
          outputChannel,
          `Found ${fuzzTargets.length} fuzz target(s) using Make: ${fuzzTargets.join(", ")}`,
        );
        resolve(fuzzTargets);
      } catch (parseError) {
        const error = new Error(
          `Failed to parse Make help output: ${parseError.message}`,
        );
        safeFuzzingLog(outputChannel, `Make parse error: ${error.message}`);
        reject(error);
      }
    });

    helpProcess.on("error", (error) => {
      const wrappedError = new Error(
        `Failed to execute Make help: ${error.message}`,
      );
      safeFuzzingLog(
        outputChannel,
        `Make execution error: ${wrappedError.message}`,
      );
      reject(wrappedError);
    });
  });
}

/**
 * Discovers fuzz targets using Ninja generator
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} buildDir - Build directory path
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @returns {Promise<string[]>} Array of fuzz target names
 */
async function discoverFuzzTargetsNinja(
  workspacePath,
  containerName,
  buildDir,
  outputChannel,
) {
  return new Promise((resolve, reject) => {
    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    const ninjaCommand = `ninja -C "${buildDir}" -t targets all`;

    const ninjaProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      ninjaCommand,
      "/bin/bash",
      options,
    );

    let ninjaStdout = "";
    let ninjaStderr = "";

    ninjaProcess.stdout.on("data", (data) => {
      ninjaStdout += data.toString();
    });

    ninjaProcess.stderr.on("data", (data) => {
      ninjaStderr += data.toString();
    });

    ninjaProcess.on("close", (ninjaCode) => {
      if (ninjaCode !== 0) {
        const error = new Error(`Ninja targets failed: ${ninjaStderr}`);
        safeFuzzingLog(
          outputChannel,
          `Ninja targets command error: ${error.message}`,
        );
        reject(error);
        return;
      }

      try {
        // Parse the ninja output to find fuzz targets (Ninja format)
        const lines = ninjaStdout.split("\n");
        const fuzzTargets = [];

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            // Ninja output format: "target: rule"
            // We want just the target name before the colon
            const targetMatch = trimmedLine.match(/^([^:]+):/);
            if (targetMatch && targetMatch[1]) {
              const targetName = targetMatch[1].trim();
              // Check if it matches the fuzz target pattern
              if (/^codeforge-.*-fuzz$/.test(targetName)) {
                fuzzTargets.push(targetName);
              }
            }
          }
        }

        safeFuzzingLog(
          outputChannel,
          `Found ${fuzzTargets.length} fuzz target(s) using Ninja: ${fuzzTargets.join(", ")}`,
        );
        resolve(fuzzTargets);
      } catch (parseError) {
        const error = new Error(
          `Failed to parse Ninja targets output: ${parseError.message}`,
        );
        safeFuzzingLog(outputChannel, `Ninja parse error: ${error.message}`);
        reject(error);
      }
    });

    ninjaProcess.on("error", (error) => {
      const wrappedError = new Error(
        `Failed to execute Ninja targets: ${error.message}`,
      );
      safeFuzzingLog(
        outputChannel,
        `Ninja execution error: ${wrappedError.message}`,
      );
      reject(wrappedError);
    });
  });
}

/**
 * Discovers fuzz targets for a specific preset
 * Supports both Make and Ninja generators
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} preset - CMake preset name
 * @param {string} buildDir - Build directory path
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @returns {Promise<string[]>} Array of fuzz target names
 */
async function discoverFuzzTargets(
  workspacePath,
  containerName,
  preset,
  buildDir,
  outputChannel,
) {
  try {
    safeFuzzingLog(
      outputChannel,
      `Discovering fuzz targets for preset ${preset}...`,
    );

    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    // First configure the preset
    const configureCommand = `cmake --preset "${preset}" -S . -B "${buildDir}"`;

    await new Promise((resolve, reject) => {
      const configureProcess = dockerOperations.runDockerCommandWithOutput(
        workspacePath,
        containerName,
        configureCommand,
        "/bin/bash",
        options,
      );

      let configureStderr = "";

      configureProcess.stderr.on("data", (data) => {
        configureStderr += data.toString();
      });

      configureProcess.on("close", (configureCode) => {
        if (configureCode !== 0) {
          const error = new Error(
            `CMake configure failed for preset ${preset}: ${configureStderr}`,
          );
          safeFuzzingLog(outputChannel, `Configure error: ${error.message}`);
          reject(error);
          return;
        }

        safeFuzzingLog(
          outputChannel,
          `Successfully configured preset ${preset}`,
        );
        resolve();
      });

      configureProcess.on("error", (error) => {
        const wrappedError = new Error(
          `Failed to execute CMake configure: ${error.message}`,
        );
        safeFuzzingLog(
          outputChannel,
          `Docker execution error: ${wrappedError.message}`,
        );
        reject(wrappedError);
      });
    });

    // Detect the generator type
    const generator = await detectCMakeGenerator(
      workspacePath,
      containerName,
      buildDir,
      outputChannel,
    );

    // Use the appropriate discovery method based on generator
    let fuzzTargets;
    if (generator === "ninja") {
      fuzzTargets = await discoverFuzzTargetsNinja(
        workspacePath,
        containerName,
        buildDir,
        outputChannel,
      );
    } else if (generator === "make") {
      fuzzTargets = await discoverFuzzTargetsMake(
        workspacePath,
        containerName,
        buildDir,
        outputChannel,
      );
    } else {
      // Fallback to Make method for unknown generators
      safeFuzzingLog(
        outputChannel,
        `Unknown generator '${generator}', falling back to Make method`,
      );
      fuzzTargets = await discoverFuzzTargetsMake(
        workspacePath,
        containerName,
        buildDir,
        outputChannel,
      );
    }

    safeFuzzingLog(
      outputChannel,
      `Total fuzz targets found for preset ${preset}: ${fuzzTargets.length}`,
    );
    return fuzzTargets;
  } catch (error) {
    safeFuzzingLog(
      outputChannel,
      `Error discovering fuzz targets: ${error.message}`,
    );
    throw error;
  }
}

/**
 * Validates that a preset configuration is valid
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} preset - CMake preset name
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @returns {Promise<boolean>} True if preset is valid
 */
async function validatePresetConfiguration(
  workspacePath,
  containerName,
  preset,
  outputChannel,
) {
  return new Promise((resolve) => {
    safeFuzzingLog(outputChannel, `Validating preset configuration: ${preset}`);

    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    // Create a temporary directory for validation
    const tempBuildDir = `/tmp/validate-${preset}-${Date.now()}`;
    const validateCommand = `mkdir -p "${tempBuildDir}" && cmake --preset "${preset}" -S . -B "${tempBuildDir}"`;

    const validateProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      validateCommand,
      "/bin/bash",
      options,
    );

    validateProcess.on("close", (code) => {
      const isValid = code === 0;
      safeFuzzingLog(
        outputChannel,
        `Preset ${preset} validation: ${isValid ? "PASSED" : "FAILED"}`,
      );
      resolve(isValid);
    });

    validateProcess.on("error", (error) => {
      safeFuzzingLog(
        outputChannel,
        `Preset ${preset} validation error: ${error.message}`,
      );
      resolve(false);
    });
  });
}

module.exports = {
  discoverCMakePresets,
  discoverFuzzTargets,
  validatePresetConfiguration,
};
