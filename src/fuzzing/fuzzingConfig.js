const vscode = require("vscode");

/**
 * Configuration service for managing fuzzer settings from VSCode's configuration system.
 * Provides centralized access to fuzzing configuration with validation and default values.
 */

/**
 * Default configuration values that match the schema defined in package.json
 */
const DEFAULT_CONFIG = {
  libfuzzer: {
    runs: 16,
    jobs: 8,
    maxTotalTime: 300,
    maxLen: 4096,
  },
  ignoreCrashes: true,
  exitOnCrash: false,
  minimizeCrashes: true,
  memoryLimit: 2048,
  timeoutPerRun: 25,
  outputDirectory: ".codeforge/fuzzing",
  preserveCorpus: true,
};

/**
 * Configuration validation rules
 */
const VALIDATION_RULES = {
  "fuzzing.libfuzzer.runs": { min: 1, max: 1000 },
  "fuzzing.libfuzzer.jobs": { min: 1, max: 64 },
  "fuzzing.libfuzzer.maxTotalTime": { min: 0 },
  "fuzzing.libfuzzer.maxLen": { min: 1, max: 1048576 },
  "fuzzing.memoryLimit": { min: 128, max: 16384 },
  "fuzzing.timeoutPerRun": { min: 1, max: 300 },
};

/**
 * Gets the complete fuzzing configuration from VSCode settings with defaults and validation.
 * Prefers workspace settings when available, falls back to global settings.
 *
 * @returns {Object} Complete fuzzing configuration object
 * @throws {Error} If configuration validation fails
 */
function getFuzzingConfig() {
  const config = vscode.workspace.getConfiguration("codeforge");

  // Build configuration object with defaults
  const fuzzingConfig = {
    libfuzzer: {
      runs: config.get("fuzzing.libfuzzer.runs", DEFAULT_CONFIG.libfuzzer.runs),
      jobs: config.get("fuzzing.libfuzzer.jobs", DEFAULT_CONFIG.libfuzzer.jobs),
      maxTotalTime: config.get(
        "fuzzing.libfuzzer.maxTotalTime",
        DEFAULT_CONFIG.libfuzzer.maxTotalTime,
      ),
      maxLen: config.get(
        "fuzzing.libfuzzer.maxLen",
        DEFAULT_CONFIG.libfuzzer.maxLen,
      ),
    },
    ignoreCrashes: config.get(
      "fuzzing.ignoreCrashes",
      DEFAULT_CONFIG.ignoreCrashes,
    ),
    exitOnCrash: config.get("fuzzing.exitOnCrash", DEFAULT_CONFIG.exitOnCrash),
    minimizeCrashes: config.get(
      "fuzzing.minimizeCrashes",
      DEFAULT_CONFIG.minimizeCrashes,
    ),
    memoryLimit: config.get("fuzzing.memoryLimit", DEFAULT_CONFIG.memoryLimit),
    timeoutPerRun: config.get(
      "fuzzing.timeoutPerRun",
      DEFAULT_CONFIG.timeoutPerRun,
    ),
    outputDirectory: config.get(
      "fuzzing.outputDirectory",
      DEFAULT_CONFIG.outputDirectory,
    ),
    preserveCorpus: config.get(
      "fuzzing.preserveCorpus",
      DEFAULT_CONFIG.preserveCorpus,
    ),
  };

  // Validate configuration
  validateConfig(fuzzingConfig);

  return fuzzingConfig;
}

/**
 * Gets LibFuzzer-specific options in the format expected by the existing fuzzRunner.js code.
 * This provides compatibility with the existing DEFAULT_LIBFUZZER_OPTIONS structure.
 *
 * @returns {Object} LibFuzzer options object compatible with existing code
 * @throws {Error} If configuration validation fails
 */
function getLibFuzzerOptions() {
  const config = getFuzzingConfig();

  // Convert to format expected by existing fuzzRunner.js
  const libfuzzerOptions = {
    fork: 1, // Always use fork mode for parallel execution
    ignore_crashes: config.ignoreCrashes ? 1 : 0,
    jobs: config.libfuzzer.jobs,
    runs: config.libfuzzer.runs,
    create_missing_dirs: 1, // Always create missing directories
    max_total_time:
      config.libfuzzer.maxTotalTime > 0
        ? config.libfuzzer.maxTotalTime
        : undefined,
    max_len: config.libfuzzer.maxLen,
    timeout: config.timeoutPerRun,
    rss_limit_mb: config.memoryLimit,
  };

  // Remove undefined values to avoid passing them to LibFuzzer
  Object.keys(libfuzzerOptions).forEach((key) => {
    if (libfuzzerOptions[key] === undefined) {
      delete libfuzzerOptions[key];
    }
  });

  // Handle exit on crash behavior
  if (config.exitOnCrash) {
    libfuzzerOptions.ignore_crashes = 0;
    libfuzzerOptions.exit_on_first_crash = 1;
  }

  return libfuzzerOptions;
}

/**
 * Validates configuration values to ensure they're within acceptable ranges.
 *
 * @param {Object} config - Configuration object to validate
 * @throws {Error} If any configuration value is invalid
 */
function validateConfig(config) {
  const errors = [];

  // Validate LibFuzzer options
  if (config.libfuzzer) {
    const { runs, jobs, maxTotalTime, maxLen } = config.libfuzzer;

    if (!validateRange(runs, VALIDATION_RULES["fuzzing.libfuzzer.runs"])) {
      errors.push(
        `LibFuzzer runs must be between ${VALIDATION_RULES["fuzzing.libfuzzer.runs"].min} and ${VALIDATION_RULES["fuzzing.libfuzzer.runs"].max}, got: ${runs}`,
      );
    }

    if (!validateRange(jobs, VALIDATION_RULES["fuzzing.libfuzzer.jobs"])) {
      errors.push(
        `LibFuzzer jobs must be between ${VALIDATION_RULES["fuzzing.libfuzzer.jobs"].min} and ${VALIDATION_RULES["fuzzing.libfuzzer.jobs"].max}, got: ${jobs}`,
      );
    }

    if (
      !validateRange(
        maxTotalTime,
        VALIDATION_RULES["fuzzing.libfuzzer.maxTotalTime"],
      )
    ) {
      errors.push(
        `LibFuzzer maxTotalTime must be >= ${VALIDATION_RULES["fuzzing.libfuzzer.maxTotalTime"].min}, got: ${maxTotalTime}`,
      );
    }

    if (!validateRange(maxLen, VALIDATION_RULES["fuzzing.libfuzzer.maxLen"])) {
      errors.push(
        `LibFuzzer maxLen must be between ${VALIDATION_RULES["fuzzing.libfuzzer.maxLen"].min} and ${VALIDATION_RULES["fuzzing.libfuzzer.maxLen"].max}, got: ${maxLen}`,
      );
    }
  }

  // Validate resource limits
  if (
    !validateRange(config.memoryLimit, VALIDATION_RULES["fuzzing.memoryLimit"])
  ) {
    errors.push(
      `Memory limit must be between ${VALIDATION_RULES["fuzzing.memoryLimit"].min} and ${VALIDATION_RULES["fuzzing.memoryLimit"].max} MB, got: ${config.memoryLimit}`,
    );
  }

  if (
    !validateRange(
      config.timeoutPerRun,
      VALIDATION_RULES["fuzzing.timeoutPerRun"],
    )
  ) {
    errors.push(
      `Timeout per run must be between ${VALIDATION_RULES["fuzzing.timeoutPerRun"].min} and ${VALIDATION_RULES["fuzzing.timeoutPerRun"].max} seconds, got: ${config.timeoutPerRun}`,
    );
  }

  // Validate boolean values
  if (typeof config.ignoreCrashes !== "boolean") {
    errors.push(
      `ignoreCrashes must be a boolean, got: ${typeof config.ignoreCrashes}`,
    );
  }

  if (typeof config.exitOnCrash !== "boolean") {
    errors.push(
      `exitOnCrash must be a boolean, got: ${typeof config.exitOnCrash}`,
    );
  }

  if (typeof config.minimizeCrashes !== "boolean") {
    errors.push(
      `minimizeCrashes must be a boolean, got: ${typeof config.minimizeCrashes}`,
    );
  }

  if (typeof config.preserveCorpus !== "boolean") {
    errors.push(
      `preserveCorpus must be a boolean, got: ${typeof config.preserveCorpus}`,
    );
  }

  // Validate output directory
  if (
    typeof config.outputDirectory !== "string" ||
    config.outputDirectory.trim() === ""
  ) {
    errors.push(
      `outputDirectory must be a non-empty string, got: ${config.outputDirectory}`,
    );
  }

  // Check for conflicting settings
  if (config.ignoreCrashes && config.exitOnCrash) {
    errors.push(
      "Cannot have both ignoreCrashes and exitOnCrash enabled simultaneously",
    );
  }

  if (errors.length > 0) {
    throw new Error(`Invalid fuzzing configuration:\n${errors.join("\n")}`);
  }
}

/**
 * Validates that a numeric value is within the specified range.
 *
 * @param {number} value - Value to validate
 * @param {Object} rule - Validation rule with min/max properties
 * @returns {boolean} True if value is valid, false otherwise
 */
function validateRange(value, rule) {
  if (typeof value !== "number" || isNaN(value)) {
    return false;
  }

  if (rule.min !== undefined && value < rule.min) {
    return false;
  }

  if (rule.max !== undefined && value > rule.max) {
    return false;
  }

  return true;
}

/**
 * Gets the fuzzing output directory path, ensuring it's properly formatted.
 *
 * @returns {string} The output directory path
 */
function getOutputDirectory() {
  const config = getFuzzingConfig();
  return config.outputDirectory;
}

/**
 * Checks if crash minimization is enabled.
 *
 * @returns {boolean} True if crash minimization is enabled
 */
function shouldMinimizeCrashes() {
  const config = getFuzzingConfig();
  return config.minimizeCrashes;
}

/**
 * Checks if corpus should be preserved between fuzzing sessions.
 *
 * @returns {boolean} True if corpus should be preserved
 */
function shouldPreserveCorpus() {
  const config = getFuzzingConfig();
  return config.preserveCorpus;
}

/**
 * Gets the current configuration as a human-readable summary for logging/debugging.
 *
 * @returns {string} Configuration summary
 */
function getConfigSummary() {
  try {
    const config = getFuzzingConfig();
    return `Fuzzing Configuration:
  LibFuzzer: ${config.libfuzzer.runs} runs, ${config.libfuzzer.jobs} jobs, ${config.libfuzzer.maxTotalTime}s max time, ${config.libfuzzer.maxLen} max length
  Crashes: ignore=${config.ignoreCrashes}, exit=${config.exitOnCrash}, minimize=${config.minimizeCrashes}
  Resources: ${config.memoryLimit}MB memory, ${config.timeoutPerRun}s timeout
  Output: ${config.outputDirectory}, preserve corpus=${config.preserveCorpus}`;
  } catch (error) {
    return `Configuration Error: ${error.message}`;
  }
}

module.exports = {
  getFuzzingConfig,
  getLibFuzzerOptions,
  validateConfig,
  getOutputDirectory,
  shouldMinimizeCrashes,
  shouldPreserveCorpus,
  getConfigSummary,
  DEFAULT_CONFIG,
};
