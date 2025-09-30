/**
 * Utility functions for fuzzer operations
 */

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
  formatFuzzerDisplayName,
};
