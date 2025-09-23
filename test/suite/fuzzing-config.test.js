/**
 * Fuzzing Configuration Test Suite
 *
 * This file contains comprehensive tests for the fuzzing configuration service.
 * Tests cover configuration retrieval, validation, VSCode integration, and
 * compatibility with existing fuzzing code.
 */

const assert = require("assert");
const vscode = require("vscode");
const sinon = require("sinon");

// Import the fuzzing configuration module
const fuzzingConfig = require("../../src/fuzzing/fuzzingConfig");

suite("Fuzzing Configuration Test Suite", () => {
  let sandbox;
  let mockConfiguration;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Create a mock configuration object that mimics VSCode's configuration API
    mockConfiguration = {
      get: sandbox.stub(),
    };

    // Mock vscode.workspace.getConfiguration to return our mock
    sandbox
      .stub(vscode.workspace, "getConfiguration")
      .returns(mockConfiguration);
  });

  teardown(() => {
    sandbox.restore();
  });

  suite("getFuzzingConfig() Function", () => {
    test("should return default configuration when no settings are provided", () => {
      // Configure mock to return undefined for all settings (use defaults)
      mockConfiguration.get.callsFake((key, defaultValue) => defaultValue);

      const config = fuzzingConfig.getFuzzingConfig();

      // Verify default values match DEFAULT_CONFIG
      assert.strictEqual(config.libfuzzer.runs, 16);
      assert.strictEqual(config.libfuzzer.jobs, 8);
      assert.strictEqual(config.libfuzzer.maxTotalTime, 300);
      assert.strictEqual(config.libfuzzer.maxLen, 4096);
      assert.strictEqual(config.ignoreCrashes, true);
      assert.strictEqual(config.exitOnCrash, false);
      assert.strictEqual(config.minimizeCrashes, true);
      assert.strictEqual(config.memoryLimit, 2048);
      assert.strictEqual(config.timeoutPerRun, 25);
      assert.strictEqual(config.outputDirectory, ".codeforge/fuzzing");
      assert.strictEqual(config.preserveCorpus, true);
    });

    test("should use workspace settings when provided", () => {
      // Configure mock to return custom values
      mockConfiguration.get.callsFake((key, defaultValue) => {
        const customValues = {
          "fuzzing.libfuzzer.runs": 32,
          "fuzzing.libfuzzer.jobs": 4,
          "fuzzing.libfuzzer.maxTotalTime": 600,
          "fuzzing.libfuzzer.maxLen": 8192,
          "fuzzing.ignoreCrashes": false,
          "fuzzing.exitOnCrash": true,
          "fuzzing.minimizeCrashes": false,
          "fuzzing.memoryLimit": 4096,
          "fuzzing.timeoutPerRun": 30,
          "fuzzing.outputDirectory": "custom/fuzzing",
          "fuzzing.preserveCorpus": false,
        };
        return customValues[key] !== undefined
          ? customValues[key]
          : defaultValue;
      });

      const config = fuzzingConfig.getFuzzingConfig();

      // Verify custom values are used
      assert.strictEqual(config.libfuzzer.runs, 32);
      assert.strictEqual(config.libfuzzer.jobs, 4);
      assert.strictEqual(config.libfuzzer.maxTotalTime, 600);
      assert.strictEqual(config.libfuzzer.maxLen, 8192);
      assert.strictEqual(config.ignoreCrashes, false);
      assert.strictEqual(config.exitOnCrash, true);
      assert.strictEqual(config.minimizeCrashes, false);
      assert.strictEqual(config.memoryLimit, 4096);
      assert.strictEqual(config.timeoutPerRun, 30);
      assert.strictEqual(config.outputDirectory, "custom/fuzzing");
      assert.strictEqual(config.preserveCorpus, false);
    });

    test("should call vscode.workspace.getConfiguration with correct scope", () => {
      mockConfiguration.get.callsFake((key, defaultValue) => defaultValue);

      fuzzingConfig.getFuzzingConfig();

      assert(vscode.workspace.getConfiguration.calledWith("codeforge"));
    });

    test("should validate configuration and throw on invalid values", () => {
      // Configure mock to return invalid values
      mockConfiguration.get.callsFake((key, defaultValue) => {
        if (key === "fuzzing.libfuzzer.runs") return -1; // Invalid: below minimum
        return defaultValue;
      });

      assert.throws(() => {
        fuzzingConfig.getFuzzingConfig();
      }, /Invalid fuzzing configuration/);
    });
  });

  suite("getLibFuzzerOptions() Function", () => {
    test("should return options compatible with existing fuzzRunner.js format", () => {
      // Use default configuration
      mockConfiguration.get.callsFake((key, defaultValue) => defaultValue);

      const options = fuzzingConfig.getLibFuzzerOptions();

      // Verify format matches expected structure for fuzzRunner.js
      assert.strictEqual(typeof options, "object");
      assert.strictEqual(options.fork, 1);
      assert.strictEqual(options.ignore_crashes, 1); // true -> 1
      assert.strictEqual(options.jobs, 8);
      assert.strictEqual(options.runs, 16);
      assert.strictEqual(options.create_missing_dirs, 1);
      assert.strictEqual(options.max_total_time, 300);
      assert.strictEqual(options.max_len, 4096);
      assert.strictEqual(options.timeout, 25);
      assert.strictEqual(options.rss_limit_mb, 2048);
    });

    test("should handle exitOnCrash configuration correctly", () => {
      // Configure exitOnCrash = true
      mockConfiguration.get.callsFake((key, defaultValue) => {
        if (key === "fuzzing.exitOnCrash") return true;
        if (key === "fuzzing.ignoreCrashes") return false; // Must be false when exitOnCrash is true
        return defaultValue;
      });

      const options = fuzzingConfig.getLibFuzzerOptions();

      assert.strictEqual(options.ignore_crashes, 0);
      assert.strictEqual(options.exit_on_first_crash, 1);
    });

    test("should omit max_total_time when set to 0 (unlimited)", () => {
      // Configure maxTotalTime = 0
      mockConfiguration.get.callsFake((key, defaultValue) => {
        if (key === "fuzzing.libfuzzer.maxTotalTime") return 0;
        return defaultValue;
      });

      const options = fuzzingConfig.getLibFuzzerOptions();

      assert.strictEqual(options.max_total_time, undefined);
      assert(!options.hasOwnProperty("max_total_time"));
    });

    test("should convert boolean values to numeric format", () => {
      // Test various boolean configurations
      mockConfiguration.get.callsFake((key, defaultValue) => {
        const booleanValues = {
          "fuzzing.ignoreCrashes": false,
          "fuzzing.exitOnCrash": false,
        };
        return booleanValues[key] !== undefined
          ? booleanValues[key]
          : defaultValue;
      });

      const options = fuzzingConfig.getLibFuzzerOptions();

      assert.strictEqual(options.ignore_crashes, 0); // false -> 0
      assert.strictEqual(options.fork, 1); // Always 1
      assert.strictEqual(options.create_missing_dirs, 1); // Always 1
    });
  });

  suite("validateConfig() Function", () => {
    test("should validate LibFuzzer runs within acceptable range", () => {
      const validConfig = {
        libfuzzer: { runs: 50, jobs: 4, maxTotalTime: 300, maxLen: 1024 },
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 30,
        outputDirectory: ".codeforge/fuzzing",
      };

      // Should not throw
      assert.doesNotThrow(() => {
        fuzzingConfig.validateConfig(validConfig);
      });
    });

    test("should reject runs outside valid range", () => {
      const invalidConfig = {
        libfuzzer: { runs: 0, jobs: 4, maxTotalTime: 300, maxLen: 1024 }, // runs too low
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 30,
        outputDirectory: ".codeforge/fuzzing",
      };

      assert.throws(() => {
        fuzzingConfig.validateConfig(invalidConfig);
      }, /LibFuzzer runs must be between 1 and 1000/);
    });

    test("should reject jobs outside valid range", () => {
      const invalidConfig = {
        libfuzzer: { runs: 16, jobs: 0, maxTotalTime: 300, maxLen: 1024 }, // jobs too low
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 30,
        outputDirectory: ".codeforge/fuzzing",
      };

      assert.throws(() => {
        fuzzingConfig.validateConfig(invalidConfig);
      }, /LibFuzzer jobs must be between 1 and 64/);
    });

    test("should reject negative maxTotalTime", () => {
      const invalidConfig = {
        libfuzzer: { runs: 16, jobs: 4, maxTotalTime: -1, maxLen: 1024 }, // negative time
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 30,
        outputDirectory: ".codeforge/fuzzing",
      };

      assert.throws(() => {
        fuzzingConfig.validateConfig(invalidConfig);
      }, /LibFuzzer maxTotalTime must be >= 0/);
    });

    test("should reject maxLen outside valid range", () => {
      const invalidConfig = {
        libfuzzer: { runs: 16, jobs: 4, maxTotalTime: 300, maxLen: 0 }, // maxLen too low
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 30,
        outputDirectory: ".codeforge/fuzzing",
      };

      assert.throws(() => {
        fuzzingConfig.validateConfig(invalidConfig);
      }, /LibFuzzer maxLen must be between 1 and 1048576/);
    });

    test("should reject memory limit outside valid range", () => {
      const invalidConfig = {
        libfuzzer: { runs: 16, jobs: 4, maxTotalTime: 300, maxLen: 1024 },
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 64, // too low
        timeoutPerRun: 30,
        outputDirectory: ".codeforge/fuzzing",
      };

      assert.throws(() => {
        fuzzingConfig.validateConfig(invalidConfig);
      }, /Memory limit must be between 128 and 16384 MB/);
    });

    test("should reject timeout outside valid range", () => {
      const invalidConfig = {
        libfuzzer: { runs: 16, jobs: 4, maxTotalTime: 300, maxLen: 1024 },
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 0, // too low
        outputDirectory: ".codeforge/fuzzing",
      };

      assert.throws(() => {
        fuzzingConfig.validateConfig(invalidConfig);
      }, /Timeout per run must be between 1 and 300 seconds/);
    });

    test("should reject non-boolean values for boolean settings", () => {
      const invalidConfig = {
        libfuzzer: { runs: 16, jobs: 4, maxTotalTime: 300, maxLen: 1024 },
        ignoreCrashes: "true", // should be boolean
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 30,
        outputDirectory: ".codeforge/fuzzing",
      };

      assert.throws(() => {
        fuzzingConfig.validateConfig(invalidConfig);
      }, /ignoreCrashes must be a boolean/);
    });

    test("should reject empty output directory", () => {
      const invalidConfig = {
        libfuzzer: { runs: 16, jobs: 4, maxTotalTime: 300, maxLen: 1024 },
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 30,
        outputDirectory: "", // empty string
      };

      assert.throws(() => {
        fuzzingConfig.validateConfig(invalidConfig);
      }, /outputDirectory must be a non-empty string/);
    });

    test("should reject conflicting ignoreCrashes and exitOnCrash settings", () => {
      const invalidConfig = {
        libfuzzer: { runs: 16, jobs: 4, maxTotalTime: 300, maxLen: 1024 },
        ignoreCrashes: true,
        exitOnCrash: true, // Conflict: can't ignore and exit on crash
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 30,
        outputDirectory: ".codeforge/fuzzing",
      };

      assert.throws(() => {
        fuzzingConfig.validateConfig(invalidConfig);
      }, /Cannot have both ignoreCrashes and exitOnCrash enabled simultaneously/);
    });

    test("should collect and report multiple validation errors", () => {
      const invalidConfig = {
        libfuzzer: { runs: 0, jobs: 0, maxTotalTime: -1, maxLen: 0 }, // Multiple invalid values
        ignoreCrashes: "not-boolean",
        exitOnCrash: "not-boolean",
        minimizeCrashes: "not-boolean",
        preserveCorpus: "not-boolean",
        memoryLimit: 0,
        timeoutPerRun: 0,
        outputDirectory: "",
      };

      let errorMessage;
      try {
        fuzzingConfig.validateConfig(invalidConfig);
        assert.fail("Should have thrown validation error");
      } catch (error) {
        errorMessage = error.message;
      }

      // Verify multiple errors are reported
      assert(errorMessage.includes("LibFuzzer runs must be between"));
      assert(errorMessage.includes("LibFuzzer jobs must be between"));
      assert(errorMessage.includes("LibFuzzer maxTotalTime must be"));
      assert(errorMessage.includes("LibFuzzer maxLen must be between"));
      assert(errorMessage.includes("Memory limit must be between"));
      assert(errorMessage.includes("Timeout per run must be between"));
      assert(errorMessage.includes("ignoreCrashes must be a boolean"));
      assert(
        errorMessage.includes("outputDirectory must be a non-empty string"),
      );
    });
  });

  suite("Utility Functions", () => {
    test("getOutputDirectory() should return configured output directory", () => {
      mockConfiguration.get.callsFake((key, defaultValue) => {
        if (key === "fuzzing.outputDirectory") return "custom/output";
        return defaultValue;
      });

      const outputDir = fuzzingConfig.getOutputDirectory();
      assert.strictEqual(outputDir, "custom/output");
    });

    test("shouldMinimizeCrashes() should return minimize crashes setting", () => {
      mockConfiguration.get.callsFake((key, defaultValue) => {
        if (key === "fuzzing.minimizeCrashes") return false;
        return defaultValue;
      });

      const shouldMinimize = fuzzingConfig.shouldMinimizeCrashes();
      assert.strictEqual(shouldMinimize, false);
    });

    test("shouldPreserveCorpus() should return preserve corpus setting", () => {
      mockConfiguration.get.callsFake((key, defaultValue) => {
        if (key === "fuzzing.preserveCorpus") return false;
        return defaultValue;
      });

      const shouldPreserve = fuzzingConfig.shouldPreserveCorpus();
      assert.strictEqual(shouldPreserve, false);
    });
  });

  suite("getConfigSummary() Function", () => {
    test("should generate readable configuration summary", () => {
      mockConfiguration.get.callsFake((key, defaultValue) => defaultValue);

      const summary = fuzzingConfig.getConfigSummary();

      assert(typeof summary === "string");
      assert(summary.includes("Fuzzing Configuration:"));
      assert(summary.includes("LibFuzzer: 16 runs, 8 jobs"));
      assert(summary.includes("300s max time"));
      assert(summary.includes("4096 max length"));
      assert(summary.includes("ignore=true"));
      assert(summary.includes("exit=false"));
      assert(summary.includes("minimize=true"));
      assert(summary.includes("2048MB memory"));
      assert(summary.includes("25s timeout"));
      assert(summary.includes(".codeforge/fuzzing"));
      assert(summary.includes("preserve corpus=true"));
    });

    test("should handle configuration errors gracefully", () => {
      // Mock configuration to throw an error
      mockConfiguration.get.callsFake((key, defaultValue) => {
        if (key === "fuzzing.libfuzzer.runs") return -1; // Invalid value
        return defaultValue;
      });

      const summary = fuzzingConfig.getConfigSummary();

      assert(typeof summary === "string");
      assert(summary.includes("Configuration Error:"));
      assert(summary.includes("Invalid fuzzing configuration"));
    });
  });

  suite("VSCode Configuration Integration", () => {
    test("should handle missing configuration values gracefully", () => {
      // Mock configuration to return undefined for all values, but the get method
      // should still return the defaultValue parameter when the setting is undefined
      mockConfiguration.get.callsFake((key, defaultValue) => {
        // This simulates VSCode's behavior: when a setting is not configured,
        // getConfiguration().get(key, defaultValue) returns the defaultValue
        return defaultValue;
      });

      // Should use defaults when configuration returns undefined
      const config = fuzzingConfig.getFuzzingConfig();

      assert.strictEqual(config.libfuzzer.runs, 16); // Default value
      assert.strictEqual(config.libfuzzer.jobs, 8); // Default value
    });

    test("should prefer workspace settings over global settings", () => {
      // This is handled by VSCode's getConfiguration API
      // We verify that we're calling it correctly
      mockConfiguration.get.callsFake((key, defaultValue) => defaultValue);

      fuzzingConfig.getFuzzingConfig();

      // Verify we're requesting configuration from the correct scope
      assert(vscode.workspace.getConfiguration.calledWith("codeforge"));
    });

    test("should handle configuration updates", () => {
      // First call returns default values
      mockConfiguration.get.callsFake((key, defaultValue) => defaultValue);
      const config1 = fuzzingConfig.getFuzzingConfig();
      assert.strictEqual(config1.libfuzzer.runs, 16);

      // Second call returns updated values
      mockConfiguration.get.callsFake((key, defaultValue) => {
        if (key === "fuzzing.libfuzzer.runs") return 32;
        return defaultValue;
      });
      const config2 = fuzzingConfig.getFuzzingConfig();
      assert.strictEqual(config2.libfuzzer.runs, 32);
    });
  });

  suite("Integration with Existing Fuzzing Code", () => {
    test("getLibFuzzerOptions() should be compatible with fuzzRunner.js expectations", () => {
      mockConfiguration.get.callsFake((key, defaultValue) => defaultValue);

      const options = fuzzingConfig.getLibFuzzerOptions();

      // Verify all expected properties exist with correct types
      assert.strictEqual(typeof options.fork, "number");
      assert.strictEqual(typeof options.ignore_crashes, "number");
      assert.strictEqual(typeof options.jobs, "number");
      assert.strictEqual(typeof options.runs, "number");
      assert.strictEqual(typeof options.create_missing_dirs, "number");
      assert.strictEqual(typeof options.max_len, "number");
      assert.strictEqual(typeof options.timeout, "number");
      assert.strictEqual(typeof options.rss_limit_mb, "number");

      // Verify numeric boolean values (0 or 1)
      assert(options.fork === 0 || options.fork === 1);
      assert(options.ignore_crashes === 0 || options.ignore_crashes === 1);
      assert(
        options.create_missing_dirs === 0 || options.create_missing_dirs === 1,
      );
    });

    test("should maintain backward compatibility with default values", () => {
      mockConfiguration.get.callsFake((key, defaultValue) => defaultValue);

      const options = fuzzingConfig.getLibFuzzerOptions();

      // These values should match what existing code expects
      assert.strictEqual(options.jobs, 8);
      assert.strictEqual(options.runs, 16);
      assert.strictEqual(options.max_total_time, 300);
      assert.strictEqual(options.max_len, 4096);
      assert.strictEqual(options.timeout, 25);
      assert.strictEqual(options.rss_limit_mb, 2048);
    });

    test("should handle edge cases in option conversion", () => {
      // Test with extreme but valid values
      mockConfiguration.get.callsFake((key, defaultValue) => {
        const extremeValues = {
          "fuzzing.libfuzzer.runs": 1000, // Maximum
          "fuzzing.libfuzzer.jobs": 64, // Maximum
          "fuzzing.libfuzzer.maxTotalTime": 0, // Unlimited
          "fuzzing.libfuzzer.maxLen": 1048576, // Maximum
          "fuzzing.memoryLimit": 16384, // Maximum
          "fuzzing.timeoutPerRun": 300, // Maximum
        };
        return extremeValues[key] !== undefined
          ? extremeValues[key]
          : defaultValue;
      });

      const options = fuzzingConfig.getLibFuzzerOptions();

      assert.strictEqual(options.runs, 1000);
      assert.strictEqual(options.jobs, 64);
      assert.strictEqual(options.max_len, 1048576);
      assert.strictEqual(options.rss_limit_mb, 16384);
      assert.strictEqual(options.timeout, 300);

      // max_total_time should be omitted when 0
      assert(!options.hasOwnProperty("max_total_time"));
    });
  });

  suite("Edge Cases and Error Conditions", () => {
    test("should handle non-numeric values gracefully", () => {
      const invalidConfig = {
        libfuzzer: {
          runs: "not-a-number",
          jobs: 4,
          maxTotalTime: 300,
          maxLen: 1024,
        },
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 30,
        outputDirectory: ".codeforge/fuzzing",
      };

      assert.throws(() => {
        fuzzingConfig.validateConfig(invalidConfig);
      }, /LibFuzzer runs must be between/);
    });

    test("should handle NaN values", () => {
      const invalidConfig = {
        libfuzzer: { runs: NaN, jobs: 4, maxTotalTime: 300, maxLen: 1024 },
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 30,
        outputDirectory: ".codeforge/fuzzing",
      };

      assert.throws(() => {
        fuzzingConfig.validateConfig(invalidConfig);
      }, /LibFuzzer runs must be between/);
    });

    test("should handle missing libfuzzer configuration section", () => {
      const configWithoutLibfuzzer = {
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 1024,
        timeoutPerRun: 30,
        outputDirectory: ".codeforge/fuzzing",
      };

      // Should not throw when libfuzzer section is missing
      assert.doesNotThrow(() => {
        fuzzingConfig.validateConfig(configWithoutLibfuzzer);
      });
    });

    test("should validate maximum boundary values", () => {
      const maxBoundaryConfig = {
        libfuzzer: {
          runs: 1000,
          jobs: 64,
          maxTotalTime: 999999,
          maxLen: 1048576,
        },
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 16384,
        timeoutPerRun: 300,
        outputDirectory: ".codeforge/fuzzing",
      };

      // Should not throw for maximum valid values
      assert.doesNotThrow(() => {
        fuzzingConfig.validateConfig(maxBoundaryConfig);
      });
    });

    test("should validate minimum boundary values", () => {
      const minBoundaryConfig = {
        libfuzzer: { runs: 1, jobs: 1, maxTotalTime: 0, maxLen: 1 },
        ignoreCrashes: true,
        exitOnCrash: false,
        minimizeCrashes: true,
        preserveCorpus: true,
        memoryLimit: 128,
        timeoutPerRun: 1,
        outputDirectory: ".codeforge/fuzzing",
      };

      // Should not throw for minimum valid values
      assert.doesNotThrow(() => {
        fuzzingConfig.validateConfig(minBoundaryConfig);
      });
    });
  });

  suite("Module Exports", () => {
    test("should export all expected functions", () => {
      assert.strictEqual(typeof fuzzingConfig.getFuzzingConfig, "function");
      assert.strictEqual(typeof fuzzingConfig.getLibFuzzerOptions, "function");
      assert.strictEqual(typeof fuzzingConfig.validateConfig, "function");
      assert.strictEqual(typeof fuzzingConfig.getOutputDirectory, "function");
      assert.strictEqual(
        typeof fuzzingConfig.shouldMinimizeCrashes,
        "function",
      );
      assert.strictEqual(typeof fuzzingConfig.shouldPreserveCorpus, "function");
      assert.strictEqual(typeof fuzzingConfig.getConfigSummary, "function");
    });

    test("should export DEFAULT_CONFIG constant", () => {
      assert.strictEqual(typeof fuzzingConfig.DEFAULT_CONFIG, "object");
      assert.strictEqual(fuzzingConfig.DEFAULT_CONFIG.libfuzzer.runs, 16);
      assert.strictEqual(fuzzingConfig.DEFAULT_CONFIG.libfuzzer.jobs, 8);
      assert.strictEqual(fuzzingConfig.DEFAULT_CONFIG.ignoreCrashes, true);
      assert.strictEqual(fuzzingConfig.DEFAULT_CONFIG.exitOnCrash, false);
    });
  });
});
