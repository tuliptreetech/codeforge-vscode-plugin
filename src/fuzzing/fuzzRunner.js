const dockerOperations = require("../../dockerOperations");
const path = require("path");

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
 * Default LibFuzzer options matching the shell script
 * -fork=1 -ignore_crashes=1 -jobs=8 -runs=16 -create_missing_dirs=1
 */
const DEFAULT_LIBFUZZER_OPTIONS = {
  fork: 1,
  ignore_crashes: 1,
  jobs: 8,
  runs: 16,
  create_missing_dirs: 1,
};

/**
 * Runs all fuzzers in the collection
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {Map<string, string>} fuzzers - Map of fuzzer names to paths
 * @param {string} fuzzingDir - Base fuzzing directory
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @param {Object} options - Fuzzing options
 * @returns {Promise<Object>} Execution results
 */
async function runAllFuzzers(
  workspacePath,
  containerName,
  fuzzers,
  fuzzingDir,
  outputChannel,
  options = {},
) {
  const results = {
    executed: 0,
    crashes: [],
    errors: [],
  };

  const fuzzerArray = Array.from(fuzzers.entries());
  safeFuzzingLog(
    outputChannel,
    `Starting execution of ${fuzzerArray.length} fuzzer(s)...`,
  );

  for (const [fuzzerName, fuzzerPath] of fuzzerArray) {
    try {
      const fuzzerResults = await runSingleFuzzer(
        workspacePath,
        containerName,
        fuzzerName,
        fuzzerPath,
        fuzzingDir,
        outputChannel,
        options,
      );

      results.executed++;
      results.crashes.push(...fuzzerResults.crashes);

      safeFuzzingLog(
        outputChannel,
        `Completed fuzzer: ${fuzzerName} (${fuzzerResults.crashes.length} crashes found)`,
      );
    } catch (error) {
      safeFuzzingLog(
        outputChannel,
        `Error running fuzzer ${fuzzerName}: ${error.message}`,
      );
      results.errors.push({
        fuzzer: fuzzerName,
        error: error.message,
        type: "execution",
      });
      // Continue with other fuzzers
    }
  }

  safeFuzzingLog(
    outputChannel,
    `Fuzzer execution complete: ${results.executed}/${fuzzerArray.length} executed, ${results.crashes.length} total crashes found`,
  );
  return results;
}

/**
 * Runs a single fuzzer
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} fuzzerName - Name of the fuzzer
 * @param {string} fuzzerPath - Path to the fuzzer executable
 * @param {string} fuzzingDir - Base fuzzing directory
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @param {Object} options - Fuzzing options
 * @returns {Promise<Object>} Single fuzzer results
 */
async function runSingleFuzzer(
  workspacePath,
  containerName,
  fuzzerName,
  fuzzerPath,
  fuzzingDir,
  outputChannel,
  options = {},
) {
  const fuzzerOutputDir = path.join(fuzzingDir, `${fuzzerName}-output`);
  const corpusDir = path.join(fuzzerOutputDir, "corpus");

  safeFuzzingLog(outputChannel, `Running fuzzer: ${fuzzerName}`);
  safeFuzzingLog(outputChannel, `Output directory: ${fuzzerOutputDir}`);

  // Create output directory
  await createFuzzerOutputDirectory(
    workspacePath,
    containerName,
    fuzzerOutputDir,
    outputChannel,
  );

  // Run the fuzzer
  const fuzzerResults = await executeFuzzer(
    workspacePath,
    containerName,
    fuzzerName,
    fuzzerPath,
    fuzzerOutputDir,
    corpusDir,
    outputChannel,
    options,
  );

  // Detect crashes
  const crashes = await detectCrashes(
    workspacePath,
    containerName,
    fuzzerName,
    corpusDir,
    outputChannel,
  );

  return {
    fuzzer: fuzzerName,
    crashes: crashes,
    outputDir: fuzzerOutputDir,
  };
}

/**
 * Creates the output directory for a fuzzer
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} outputDir - Output directory path
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @returns {Promise<void>}
 */
async function createFuzzerOutputDirectory(
  workspacePath,
  containerName,
  outputDir,
  outputChannel,
) {
  return new Promise((resolve, reject) => {
    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    const createDirCommand = `mkdir -p "${outputDir}"`;

    const createProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      createDirCommand,
      "/bin/bash",
      options,
    );

    createProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to create output directory: ${outputDir}`));
        return;
      }
      resolve();
    });

    createProcess.on("error", (error) => {
      reject(new Error(`Failed to create output directory: ${error.message}`));
    });
  });
}

/**
 * Executes a fuzzer with LibFuzzer parameters
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} fuzzerName - Name of the fuzzer
 * @param {string} fuzzerPath - Path to the fuzzer executable
 * @param {string} outputDir - Output directory
 * @param {string} corpusDir - Corpus directory
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @param {Object} options - Fuzzing options
 * @returns {Promise<Object>} Execution results
 */
async function executeFuzzer(
  workspacePath,
  containerName,
  fuzzerName,
  fuzzerPath,
  outputDir,
  corpusDir,
  outputChannel,
  options = {},
) {
  return new Promise((resolve, reject) => {
    const libfuzzerOptions = {
      ...DEFAULT_LIBFUZZER_OPTIONS,
      ...options.libfuzzer,
    };

    // Build LibFuzzer command line arguments
    const libfuzzerArgs = Object.entries(libfuzzerOptions)
      .map(([key, value]) => `-${key}=${value}`)
      .join(" ");

    // Set up environment for coverage data collection
    const profileFile = path.join(outputDir, `${fuzzerName}.profraw`);
    const envVars = `LLVM_PROFILE_FILE="${profileFile}"`;

    // Change to output directory and run fuzzer
    const fuzzerCommand = `cd "${outputDir}" && ${envVars} "${fuzzerPath}" ${libfuzzerArgs} corpus`;

    safeFuzzingLog(outputChannel, `Executing: ${fuzzerCommand}`);

    const dockerOptions = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    const fuzzerProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      fuzzerCommand,
      "/bin/bash",
      dockerOptions,
    );

    let stdout = "";
    let stderr = "";

    fuzzerProcess.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;
      // Log fuzzer output in real-time (last few lines)
      const lines = output.trim().split("\n");
      lines.forEach((line) => {
        if (line.trim()) {
          safeFuzzingLog(outputChannel, `[${fuzzerName}] ${line}`);
        }
      });
    });

    fuzzerProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    fuzzerProcess.on("close", (code) => {
      // LibFuzzer may exit with non-zero code when finding crashes, which is expected
      safeFuzzingLog(
        outputChannel,
        `Fuzzer ${fuzzerName} completed with exit code: ${code}`,
      );

      if (code !== 0 && stderr) {
        safeFuzzingLog(outputChannel, `Fuzzer ${fuzzerName} stderr: ${stderr}`);
      }

      resolve({
        exitCode: code,
        stdout: stdout,
        stderr: stderr,
        profileFile: profileFile,
      });
    });

    fuzzerProcess.on("error", (error) => {
      reject(
        new Error(`Failed to execute fuzzer ${fuzzerName}: ${error.message}`),
      );
    });
  });
}

/**
 * Detects crashes in the corpus directory
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} fuzzerName - Name of the fuzzer
 * @param {string} corpusDir - Corpus directory path
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @returns {Promise<Object[]>} Array of crash information
 */
async function detectCrashes(
  workspacePath,
  containerName,
  fuzzerName,
  corpusDir,
  outputChannel,
) {
  return new Promise((resolve) => {
    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    // Look for crash files in the corpus directory
    const findCrashesCommand = `find "${corpusDir}" -name "crash-*" -type f 2>/dev/null || true`;

    const findProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      findCrashesCommand,
      "/bin/bash",
      options,
    );

    let stdout = "";

    findProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    findProcess.on("close", (code) => {
      const crashFiles = stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());
      const crashes = [];

      if (crashFiles.length > 0 && crashFiles[0]) {
        safeFuzzingLog(
          outputChannel,
          `Found ${crashFiles.length} crash file(s) for ${fuzzerName}`,
        );

        crashFiles.forEach((crashFile) => {
          crashes.push({
            fuzzer: fuzzerName,
            file: crashFile,
            relativePath: path.relative(corpusDir, crashFile),
          });
          safeFuzzingLog(outputChannel, `Crash found: ${crashFile}`);
        });
      } else {
        safeFuzzingLog(outputChannel, `No crashes found for ${fuzzerName}`);
      }

      resolve(crashes);
    });

    findProcess.on("error", (error) => {
      safeFuzzingLog(
        outputChannel,
        `Warning: Could not check for crashes in ${fuzzerName}: ${error.message}`,
      );
      resolve([]); // Return empty array on error, don't fail the entire process
    });
  });
}

/**
 * Generates coverage data from profile files
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} fuzzerName - Name of the fuzzer
 * @param {string} fuzzerPath - Path to the fuzzer executable
 * @param {string} profileFile - Path to the profile file
 * @param {string} outputDir - Output directory
 * @param {vscode.OutputChannel} outputChannel - Output channel for logging
 * @returns {Promise<string>} Path to coverage report
 */
async function generateCoverageReport(
  workspacePath,
  containerName,
  fuzzerName,
  fuzzerPath,
  profileFile,
  outputDir,
  outputChannel,
) {
  return new Promise((resolve, reject) => {
    const coverageReportPath = path.join(
      outputDir,
      `${fuzzerName}-coverage.html`,
    );

    // Generate coverage report using llvm-profdata and llvm-cov
    const coverageCommand = `
      cd "${outputDir}" && 
      llvm-profdata merge -sparse "${profileFile}" -o "${fuzzerName}.profdata" 2>/dev/null &&
      llvm-cov show "${fuzzerPath}" -instr-profile="${fuzzerName}.profdata" -format=html > "${coverageReportPath}" 2>/dev/null
    `;

    const options = {
      removeAfterRun: true,
      mountWorkspace: true,
      dockerCommand: "docker",
    };

    const coverageProcess = dockerOperations.runDockerCommandWithOutput(
      workspacePath,
      containerName,
      coverageCommand,
      "/bin/bash",
      options,
    );

    coverageProcess.on("close", (code) => {
      if (code === 0) {
        safeFuzzingLog(
          outputChannel,
          `Coverage report generated: ${coverageReportPath}`,
        );
        resolve(coverageReportPath);
      } else {
        safeFuzzingLog(
          outputChannel,
          `Warning: Could not generate coverage report for ${fuzzerName}`,
        );
        resolve(null); // Return null but don't fail
      }
    });

    coverageProcess.on("error", (error) => {
      safeFuzzingLog(
        outputChannel,
        `Warning: Coverage generation error for ${fuzzerName}: ${error.message}`,
      );
      resolve(null); // Return null but don't fail
    });
  });
}

module.exports = {
  runAllFuzzers,
  runSingleFuzzer,
  executeFuzzer,
  detectCrashes,
  generateCoverageReport,
  createFuzzerOutputDirectory,
  DEFAULT_LIBFUZZER_OPTIONS,
};
