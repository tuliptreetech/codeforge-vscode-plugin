/**
 * Utility functions for fuzzer operations
 */

/**
 * Validates that a fuzzer name is safe for use in shell commands
 * Prevents shell injection by ensuring the name only contains allowed characters
 *
 * @param {string} fuzzerName - The fuzzer name to validate
 * @returns {{valid: boolean, error?: string}} Validation result with error message if invalid
 *
 * @example
 * validateFuzzerName("my-fuzzer") // returns { valid: true }
 * validateFuzzerName("my_fuzzer") // returns { valid: true }
 * validateFuzzerName("fuzzer123") // returns { valid: true }
 * validateFuzzerName('fuzzer"; rm -rf /') // returns { valid: false, error: "..." }
 * validateFuzzerName("") // returns { valid: false, error: "..." }
 */
function validateFuzzerName(fuzzerName) {
  // Check if fuzzerName is provided and is a string
  if (!fuzzerName || typeof fuzzerName !== "string") {
    return {
      valid: false,
      error: "Fuzzer name must be a non-empty string",
    };
  }

  // Check if fuzzerName is not empty after trimming
  if (fuzzerName.trim().length === 0) {
    return {
      valid: false,
      error: "Fuzzer name cannot be empty or whitespace only",
    };
  }

  // Only allow alphanumeric characters, hyphens, underscores, dots, and forward slashes
  // Forward slashes are allowed for preset:fuzzer format (e.g., "debug:my-fuzzer")
  // Colons are allowed for preset:fuzzer format (e.g., "debug:my-fuzzer")
  const allowedPattern = /^[a-zA-Z0-9_.\-/:]+$/;

  if (!allowedPattern.test(fuzzerName)) {
    return {
      valid: false,
      error: `Invalid fuzzer name: "${fuzzerName}". Only alphanumeric characters, hyphens, underscores, dots, colons, and forward slashes are allowed.`,
    };
  }

  // Additional safety check: prevent path traversal attempts
  if (fuzzerName.includes("..")) {
    return {
      valid: false,
      error: `Invalid fuzzer name: "${fuzzerName}". Path traversal sequences (..) are not allowed.`,
    };
  }

  // Prevent fuzzer names that start with a hyphen (could be interpreted as command flags)
  if (fuzzerName.startsWith("-")) {
    return {
      valid: false,
      error: `Invalid fuzzer name: "${fuzzerName}". Fuzzer names cannot start with a hyphen.`,
    };
  }

  // Check length to prevent extremely long names
  if (fuzzerName.length > 256) {
    return {
      valid: false,
      error: `Invalid fuzzer name: too long (max 256 characters)`,
    };
  }

  return { valid: true };
}

/**
 * Sanitizes a fuzzer name by removing or replacing unsafe characters
 * This is a fallback for when validation is not possible, but validation is preferred
 *
 * @param {string} fuzzerName - The fuzzer name to sanitize
 * @returns {string} The sanitized fuzzer name
 *
 * @example
 * sanitizeFuzzerName("my-fuzzer") // returns "my-fuzzer"
 * sanitizeFuzzerName('fuzzer"; rm -rf /') // returns "fuzzer_rm-rf_"
 */
function sanitizeFuzzerName(fuzzerName) {
  if (!fuzzerName || typeof fuzzerName !== "string") {
    return "";
  }

  // Replace any character that's not alphanumeric, hyphen, underscore, dot, colon, or slash with underscore
  return fuzzerName.replace(/[^a-zA-Z0-9_.\-/:]/g, "_").substring(0, 256);
}

/**
 * Formats a fuzzer name for display by removing CodeForge-specific prefixes and suffixes
 * Removes "codeforge-" from the beginning and "-fuzz" from the end
 *
 * @param {string} fuzzerName - The full fuzzer name (e.g., "codeforge-example-fuzz")
 * @returns {string} The formatted display name (e.g., "example")
 *
 * @example
 * formatFuzzerDisplayName("codeforge-example-fuzz") // returns "example"
 * formatFuzzerDisplayName("codeforge-my-test-fuzz") // returns "my-test"
 * formatFuzzerDisplayName("example-fuzz") // returns "example"
 * formatFuzzerDisplayName("example") // returns "example"
 */
function formatFuzzerDisplayName(fuzzerName) {
  if (!fuzzerName || typeof fuzzerName !== "string") {
    return fuzzerName || "";
  }

  let displayName = fuzzerName;

  // Remove "codeforge-" prefix if present
  if (displayName.startsWith("codeforge-")) {
    displayName = displayName.substring("codeforge-".length);
  }

  // Remove "-fuzz" suffix if present
  if (displayName.endsWith("-fuzz")) {
    displayName = displayName.substring(0, displayName.length - "-fuzz".length);
  }

  return displayName;
}

module.exports = {
  validateFuzzerName,
  sanitizeFuzzerName,
  formatFuzzerDisplayName,
};
