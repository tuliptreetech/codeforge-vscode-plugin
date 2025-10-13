const vscode = require("vscode");
const fs = require("fs").promises;
const path = require("path");
const dockerOperations = require("../core/dockerOperations");
const { CrashDiscoveryService } = require("./crashDiscoveryService");
const { formatFuzzerDisplayName } = require("./fuzzerUtils");
const { getOutputDirectory } = require("./fuzzingConfig");

/**
 * FuzzerDiscoveryService - Discovers and manages fuzzer information
 *
 * This service combines fuzzer discovery using find-fuzz-tests.sh script
 * with crash data from CrashDiscoveryService to provide comprehensive
 * fuzzer information including status, build info, and associated crashes.
 *
 * Data structure returned:
 * {
 *   name: string,           // fuzzer name (e.g., "example-fuzz")
 *   preset: string,         // CMake preset name
 *   crashes: array,         // associated crash objects
 *   lastUpdated: Date,      // last discovery check
 *   outputDir: string       // fuzzing output directory
 * }
 */
class FuzzerDiscoveryService {
  constructor(resourceManager = null) {
    this.fs = fs;
    this.path = path;
    this.resourceManager = resourceManager;
    this.crashDiscoveryService = new CrashDiscoveryService(resourceManager);
    this.cachedFuzzers = new Map();
    this.cacheTimestamp = null;
    this.cacheTimeout = 30000; // 30 seconds cache timeout
  }

  /**
   * Main discovery method that returns fuzzer objects with associated crashes
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} imageName - Docker image name for script execution (optional, will be generated if not provided)
   * @returns {Promise<Object[]>} Array of fuzzer objects
   */
  async discoverFuzzers(workspacePath, imageName = null) {
    try {
      // Check cache first
      if (this.isCacheValid()) {
        console.log("Using cached fuzzer data");
        return Array.from(this.cachedFuzzers.values());
      }

      console.log("Discovering fuzzers using find-fuzz-tests.sh script");

      // Generate image name if not provided
      if (!imageName) {
        const dockerOperations = require("../core/dockerOperations");
        imageName = dockerOperations.generateContainerName(workspacePath);
      }

      // Execute find-fuzz-tests.sh script to get available fuzzers
      const fuzzerList = await this.executeFindFuzzTestsScript(
        workspacePath,
        imageName,
      );

      // Get crash data from CrashDiscoveryService (handle failures gracefully)
      let crashData = [];
      try {
        crashData = await this.crashDiscoveryService.discoverCrashes(
          workspacePath,
          imageName,
        );
      } catch (crashError) {
        console.warn(
          "Crash discovery failed, continuing without crash data:",
          crashError.message,
        );
      }

      // Build fuzzer objects with status and crash information
      const fuzzers = await this.buildFuzzerObjects(
        workspacePath,
        fuzzerList,
        crashData,
      );

      // Add displayName to each fuzzer for UI display (testCount already added in buildFuzzerObjects)
      const fuzzersWithDisplayNames = fuzzers.map((fuzzer) => ({
        ...fuzzer,
        displayName: formatFuzzerDisplayName(fuzzer.name),
      }));

      // Update cache
      this.updateCache(fuzzersWithDisplayNames);

      return fuzzersWithDisplayNames;
    } catch (error) {
      console.error("Error discovering fuzzers:", error);
      throw new Error(`Failed to discover fuzzers: ${error.message}`);
    }
  }

  /**
   * Executes the find-fuzz-tests.sh script to get available fuzzers
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} imageName - Docker image name
   * @returns {Promise<Array>} Array of {preset, fuzzer} objects
   */
  async executeFindFuzzTestsScript(workspacePath, imageName) {
    return new Promise((resolve, reject) => {
      const options = {
        removeAfterRun: true,
        mountWorkspace: true,
        dockerCommand: "docker",
        containerType: "fuzzer_discovery",
      };

      // Execute the find-fuzz-tests.sh script
      const findCommand = ".codeforge/scripts/find-fuzz-tests.sh -q";

      const findProcess = dockerOperations.runDockerCommandWithOutput(
        workspacePath,
        imageName,
        findCommand,
        "/bin/bash",
        { ...options, resourceManager: this.resourceManager },
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
          // Handle case where no fuzzers are found (not an error)
          if (
            stderr.includes("No fuzz targets found") ||
            stdout.includes("No fuzz targets found")
          ) {
            console.log("No fuzz targets found in project");
            resolve([]);
            return;
          }

          reject(
            new Error(
              `Find fuzz tests script failed with exit code ${code}: ${stderr}`,
            ),
          );
          return;
        }

        try {
          // Parse script output: "preset:fuzzer_name" format
          const fuzzerList = this.parseFindScriptOutput(stdout);
          resolve(fuzzerList);
        } catch (parseError) {
          reject(
            new Error(
              `Failed to parse find script output: ${parseError.message}`,
            ),
          );
        }
      });

      findProcess.on("error", (error) => {
        reject(new Error(`Failed to execute find script: ${error.message}`));
      });
    });
  }

  /**
   * Parses the output from find-fuzz-tests.sh script
   * @param {string} stdout - Script output
   * @returns {Array} Array of {preset, fuzzer} objects
   */
  parseFindScriptOutput(stdout) {
    const fuzzerList = [];
    const lines = stdout
      .trim()
      .split("\n")
      .filter((line) => line.trim());

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && trimmedLine.includes(":")) {
        const [preset, fuzzer] = trimmedLine.split(":", 2);
        if (preset && fuzzer) {
          fuzzerList.push({
            preset: preset.trim(),
            fuzzer: fuzzer.trim(),
          });
        }
      }
    }

    return fuzzerList;
  }

  /**
   * Builds fuzzer objects with status and crash information
   * @param {string} workspacePath - Path to the workspace root
   * @param {Array} fuzzerList - Array of {preset, fuzzer} objects
   * @param {Array} crashData - Crash data from CrashDiscoveryService
   * @returns {Promise<Array>} Array of complete fuzzer objects
   */
  async buildFuzzerObjects(workspacePath, fuzzerList, crashData) {
    const fuzzers = [];
    const now = new Date();

    for (const fuzzerInfo of fuzzerList) {
      try {
        // Get associated crashes
        const crashes = this.associateCrashesWithFuzzers(
          fuzzerInfo.fuzzer,
          crashData,
        );

        // Get output directory
        const outputDir = this.getFuzzerOutputDirectory(
          workspacePath,
          fuzzerInfo.fuzzer,
        );

        // Get test count for this fuzzer
        const testCount = await this.getTestCount(outputDir);

        // Build simplified fuzzer object
        const fuzzer = {
          name: fuzzerInfo.fuzzer,
          preset: fuzzerInfo.preset,
          crashes: crashes,
          lastUpdated: now,
          outputDir: outputDir,
          testCount: testCount,
        };

        fuzzers.push(fuzzer);
      } catch (error) {
        console.warn(
          `Failed to build fuzzer object for ${fuzzerInfo.fuzzer}:`,
          error,
        );

        // Create minimal fuzzer object
        const outputDir = this.getFuzzerOutputDirectory(
          workspacePath,
          fuzzerInfo.fuzzer,
        );
        fuzzers.push({
          name: fuzzerInfo.fuzzer,
          preset: fuzzerInfo.preset,
          crashes: [],
          lastUpdated: now,
          outputDir: outputDir,
          testCount: 0,
        });
      }
    }

    return fuzzers;
  }

  /**
   * Links crashes to their respective fuzzers
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {Array} crashData - Crash data from CrashDiscoveryService
   * @returns {Array} Array of crash objects associated with the fuzzer
   */
  associateCrashesWithFuzzers(fuzzerName, crashData) {
    const associatedCrashes = [];

    for (const fuzzerCrashData of crashData) {
      if (fuzzerCrashData.fuzzerName === fuzzerName) {
        associatedCrashes.push(...fuzzerCrashData.crashes);
      }
    }

    // Sort crashes by creation time, newest first
    return associatedCrashes.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Gets the fuzzing output directory for a fuzzer
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @returns {string} Path to the fuzzer output directory
   */
  getFuzzerOutputDirectory(workspacePath, fuzzerName) {
    return this.path.join(
      workspacePath,
      ".codeforge",
      "fuzzing",
      `${fuzzerName}-output`,
    );
  }

  /**
   * Reads the test count from a fuzzer's output directory
   * @param {string} outputDir - Path to the fuzzer output directory
   * @returns {Promise<number>} Test count or 0 if file doesn't exist
   */
  async getTestCount(outputDir) {
    try {
      const testCountPath = this.path.join(outputDir, "test-count.txt");
      const content = await this.fs.readFile(testCountPath, "utf8");
      const count = parseInt(content.trim(), 10);
      return isNaN(count) ? 0 : count;
    } catch (error) {
      // File doesn't exist or can't be read, return 0
      return 0;
    }
  }

  /**
   * Updates fuzzer information and status
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} containerName - Docker container name
   * @param {string} fuzzerName - Optional specific fuzzer to refresh (refreshes all if not provided)
   * @returns {Promise<Object[]>} Updated fuzzer objects
   */
  async refreshFuzzerData(workspacePath, containerName, fuzzerName = null) {
    try {
      if (fuzzerName) {
        // Refresh specific fuzzer
        const cachedFuzzer = this.cachedFuzzers.get(fuzzerName);
        if (cachedFuzzer) {
          // Update crashes for specific fuzzer
          const crashData = await this.crashDiscoveryService.discoverCrashes(
            workspacePath,
            containerName,
          );
          const crashes = this.associateCrashesWithFuzzers(
            fuzzerName,
            crashData,
          );

          const updatedFuzzer = {
            ...cachedFuzzer,
            crashes: crashes,
            lastUpdated: new Date(),
          };

          this.cachedFuzzers.set(fuzzerName, updatedFuzzer);
          return [updatedFuzzer];
        }
      }

      // Refresh all fuzzers (invalidate cache and rediscover)
      this.invalidateCache();
      return await this.discoverFuzzers(workspacePath, containerName);
    } catch (error) {
      console.error("Error refreshing fuzzer data:", error);
      throw new Error(`Failed to refresh fuzzer data: ${error.message}`);
    }
  }

  /**
   * Checks if the cache is still valid
   * @returns {boolean} True if cache is valid, false otherwise
   */
  isCacheValid() {
    if (!this.cacheTimestamp || this.cachedFuzzers.size === 0) {
      return false;
    }

    const now = Date.now();
    return now - this.cacheTimestamp < this.cacheTimeout;
  }

  /**
   * Updates the cache with new fuzzer data
   * @param {Array} fuzzers - Array of fuzzer objects
   */
  updateCache(fuzzers) {
    this.cachedFuzzers.clear();
    for (const fuzzer of fuzzers) {
      this.cachedFuzzers.set(fuzzer.name, fuzzer);
    }
    this.cacheTimestamp = Date.now();
  }

  /**
   * Invalidates the cache
   */
  invalidateCache() {
    this.cachedFuzzers.clear();
    this.cacheTimestamp = null;
  }

  /**
   * Gets a specific fuzzer by name from cache
   * @param {string} fuzzerName - Name of the fuzzer
   * @returns {Object|null} Fuzzer object or null if not found
   */
  getCachedFuzzer(fuzzerName) {
    return this.cachedFuzzers.get(fuzzerName) || null;
  }

  /**
   * Gets all cached fuzzers
   * @returns {Array} Array of cached fuzzer objects
   */
  getAllCachedFuzzers() {
    return Array.from(this.cachedFuzzers.values());
  }
}

module.exports = { FuzzerDiscoveryService };
