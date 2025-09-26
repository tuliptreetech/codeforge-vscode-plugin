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
 * Builds fuzz targets for a specific preset
 * @deprecated This function is deprecated. Use buildFuzzTestsWithScript from fuzzingOperations.js instead.
 * @param {string} workspacePath - Path to the workspace
 * @param {string} containerName - Docker container name
 * @param {string} preset - CMake preset name
 * @param {string[]} targets - Array of target names to build
 * @param {string} buildDir - Build directory path
 * @param {Object} terminal - Terminal instance for logging
 * @returns {Promise<Object>} Build results object
 */
async function buildFuzzTargets(
  workspacePath,
  containerName,
  preset,
  targets,
  buildDir,
  terminal,
) {
  console.warn(
    "buildFuzzTargets is deprecated. Use buildFuzzTestsWithScript from fuzzingOperations.js instead.",
  );

  // Return empty results to maintain compatibility
  return {
    builtTargets: [],
    buildErrors: [
      {
        target: "deprecated",
        error:
          "This function is deprecated. Use buildFuzzTestsWithScript instead.",
        buildContext: {
          deprecated: true,
          timestamp: new Date().toISOString(),
        },
      },
    ],
  };
}

/**
 * Builds a single fuzz target
 * @deprecated This function is deprecated. Use buildFuzzTestsWithScript instead.
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
  console.warn(
    "buildSingleTarget is deprecated. Use buildFuzzTestsWithScript instead.",
  );
  throw new Error(
    "This function is deprecated. Use buildFuzzTestsWithScript instead.",
  );
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
  buildFuzzTargets,
  buildSingleTarget,
  generateTroubleshootingHint,
};
