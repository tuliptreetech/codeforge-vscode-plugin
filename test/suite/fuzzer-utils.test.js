const assert = require("assert");
const { formatFuzzerDisplayName } = require("../../src/fuzzing/fuzzerUtils");

suite("FuzzerUtils Tests", function () {
  suite("formatFuzzerDisplayName", function () {
    test("should remove codeforge- prefix and -fuzz suffix", function () {
      const result = formatFuzzerDisplayName("codeforge-example-fuzz");
      assert.strictEqual(result, "example");
    });

    test("should handle multi-part fuzzer names", function () {
      const result = formatFuzzerDisplayName("codeforge-my-test-fuzzer-fuzz");
      assert.strictEqual(result, "my-test-fuzzer");
    });

    test("should remove only -fuzz suffix when prefix is missing", function () {
      const result = formatFuzzerDisplayName("example-fuzz");
      assert.strictEqual(result, "example");
    });

    test("should remove only codeforge- prefix when suffix is missing", function () {
      const result = formatFuzzerDisplayName("codeforge-example");
      assert.strictEqual(result, "example");
    });

    test("should handle name with neither prefix nor suffix", function () {
      const result = formatFuzzerDisplayName("example");
      assert.strictEqual(result, "example");
    });

    test("should handle hyphenated names correctly", function () {
      const result = formatFuzzerDisplayName("codeforge-my-fuzzer-test-fuzz");
      assert.strictEqual(result, "my-fuzzer-test");
    });

    test("should handle empty string", function () {
      const result = formatFuzzerDisplayName("");
      assert.strictEqual(result, "");
    });

    test("should handle null input", function () {
      const result = formatFuzzerDisplayName(null);
      assert.strictEqual(result, "");
    });

    test("should handle undefined input", function () {
      const result = formatFuzzerDisplayName(undefined);
      assert.strictEqual(result, "");
    });

    test("should handle non-string input", function () {
      const result = formatFuzzerDisplayName(123);
      assert.strictEqual(result, 123);
    });

    test("should handle name that is only 'codeforge-fuzz'", function () {
      const result = formatFuzzerDisplayName("codeforge-fuzz");
      assert.strictEqual(result, "fuzz");
    });

    test("should handle name that is only 'codeforge--fuzz'", function () {
      const result = formatFuzzerDisplayName("codeforge--fuzz");
      assert.strictEqual(result, "");
    });

    test("should handle name with multiple 'fuzz' occurrences", function () {
      const result = formatFuzzerDisplayName("codeforge-fuzz-test-fuzz");
      assert.strictEqual(result, "fuzz-test");
    });

    test("should handle name with 'codeforge' in the middle", function () {
      const result = formatFuzzerDisplayName("codeforge-test-codeforge-fuzz");
      assert.strictEqual(result, "test-codeforge");
    });

    test("should be case-sensitive for prefix and suffix", function () {
      const result = formatFuzzerDisplayName("CodeForge-example-Fuzz");
      assert.strictEqual(
        result,
        "CodeForge-example-Fuzz",
        "Should not remove different case prefix/suffix",
      );
    });
  });
});
