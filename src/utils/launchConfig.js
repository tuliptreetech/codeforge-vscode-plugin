const fs = require("fs").promises;
const path = require("path");
const vscode = require("vscode");

/**
 * Launch Configuration Manager
 * Handles creation and management of VS Code launch.json configurations
 */
class LaunchConfigManager {
  constructor(fsModule = null, vscodeModule = null) {
    this.fs = fsModule || fs;
    this.vscode = vscodeModule || vscode;
  }

  /**
   * Detect which debugging extensions are installed
   * Checks for CodeLLDB and NativeDebug extensions
   * @returns {Object} Object with boolean flags for each extension
   */
  detectDebugExtensions() {
    const extensions = this.vscode.extensions.all;

    const codeLLDB = extensions.some(
      (ext) =>
        ext.id === "vadimcn.vscode-lldb" ||
        ext.id.toLowerCase().includes("lldb"),
    );

    const nativeDebug = extensions.some(
      (ext) =>
        ext.id === "webfreak.debug" || ext.id.toLowerCase().includes("native"),
    );

    return {
      codeLLDB,
      nativeDebug,
      // Prioritize CodeLLDB over NativeDebug
      preferredExtension: codeLLDB
        ? "codeLLDB"
        : nativeDebug
          ? "nativeDebug"
          : null,
    };
  }

  /**
   * Create a CodeLLDB launch configuration for gdbserver debugging
   * @param {string} configName - Name for the launch configuration
   * @param {number} port - Port number for GDB server connection
   * @param {string} fuzzerExecutable - Path to the fuzzer executable (container path, optional)
   * @returns {Object} CodeLLDB launch configuration
   */
  createCodeLLDBConfig(configName, port, fuzzerExecutable = null) {
    const config = {
      type: "lldb",
      request: "launch",
      name: configName,
      processCreateCommands: [`gdb-remote localhost:${port}`],
    };

    // Add program path if provided
    if (fuzzerExecutable) {
      config.program = fuzzerExecutable;
    }

    return config;
  }

  /**
   * Create a NativeDebug (GDB) launch configuration for gdbserver debugging
   * @param {string} configName - Name for the launch configuration
   * @param {number} port - Port number for GDB server connection
   * @param {string} fuzzerExecutable - Path to the fuzzer executable (host path, optional)
   * @param {Object} options - Additional configuration options
   * @returns {Object} NativeDebug launch configuration
   */
  createNativeDebugConfig(
    configName,
    port,
    fuzzerExecutable = null,
    options = {},
  ) {
    const config = {
      name: configName,
      type: "gdb",
      request: "attach",
      remote: true,
      target: `:${port}`,
      cwd: "${workspaceFolder}",
      valuesFormatting: options.valuesFormatting || "parseText",
      printCalls: options.printCalls !== undefined ? options.printCalls : false,
    };

    // Add executable if provided
    if (fuzzerExecutable) {
      config.executable = fuzzerExecutable;
    }

    // Add autorun commands if provided
    if (options.autorun && options.autorun.length > 0) {
      config.autorun = options.autorun;
    }

    return config;
  }

  /**
   * Check if a fuzzer exists using codeforge CLI
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @returns {Promise<Object>} Object with exists flag and optional path/error
   */
  async checkFuzzerExists(workspacePath, fuzzerName) {
    return new Promise((resolve) => {
      try {
        const dockerOps = require("../core/dockerOperations");
        const containerName = dockerOps.generateContainerName(workspacePath);

        // Run codeforge get-path-to-fuzzer command in the container
        const command = `codeforge get-path-to-fuzzer ${fuzzerName}`;
        const process = dockerOps.runDockerCommandWithOutput(
          workspacePath,
          containerName,
          command,
          "/bin/bash",
          {
            removeAfterRun: true,
          },
        );

        let stdout = "";
        let stderr = "";

        process.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        process.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        process.on("close", (exitCode) => {
          if (exitCode === 0 && stdout.trim()) {
            resolve({
              exists: true,
              path: stdout.trim(),
            });
          } else {
            resolve({
              exists: false,
              error: stderr.trim() || "Fuzzer not found",
            });
          }
        });

        process.on("error", (error) => {
          resolve({
            exists: false,
            error: error.message || "Failed to check fuzzer existence",
          });
        });
      } catch (error) {
        resolve({
          exists: false,
          error: error.message || "Failed to check fuzzer existence",
        });
      }
    });
  }

  /**
   * Get fuzzer executable path using codeforge CLI
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @returns {Promise<string|null>} Path to the fuzzer executable, or null if not found
   */
  async getFuzzerPath(workspacePath, fuzzerName) {
    const result = await this.checkFuzzerExists(workspacePath, fuzzerName);
    return result.exists ? result.path : null;
  }

  /**
   * Create or update GDB attach configuration in workspace launch.json
   * Automatically detects and uses the appropriate debug extension (CodeLLDB or NativeDebug)
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} configName - Name for the launch configuration
   * @param {number} port - Port number for GDB server connection
   * @param {string} fuzzerExecutable - Path to the fuzzer executable (host path, optional)
   * @param {Object} options - Additional configuration options
   * @param {string} options.fuzzerName - Name of the fuzzer (used to get path for CodeLLDB)
   * @returns {Promise<Object>} Result object with success status and details
   */
  async createOrUpdateGdbAttachConfig(
    workspacePath,
    configName,
    port,
    fuzzerExecutable = null,
    options = {},
  ) {
    try {
      const vscodeDir = path.join(workspacePath, ".vscode");
      const launchJsonPath = path.join(vscodeDir, "launch.json");

      // Detect which debug extensions are installed
      const debugExtensions = this.detectDebugExtensions();

      // Ensure .vscode directory exists
      try {
        await this.fs.access(vscodeDir);
      } catch (error) {
        await this.fs.mkdir(vscodeDir, { recursive: true });
      }

      // Read existing launch.json or create new one
      let launchConfig;
      let launchJsonExists = false;

      try {
        const launchJsonContent = await this.fs.readFile(
          launchJsonPath,
          "utf-8",
        );
        launchConfig = JSON.parse(this.stripJsonComments(launchJsonContent));
        launchJsonExists = true;
      } catch (error) {
        // File doesn't exist or is invalid, create new config
        launchConfig = {
          version: "0.2.0",
          configurations: [],
        };
      }

      // Ensure configurations array exists
      if (!launchConfig.configurations) {
        launchConfig.configurations = [];
      }

      // Create the appropriate debug configuration based on installed extensions
      let debugConfig;
      let extensionUsed = null;
      let resolvedFuzzerPath = fuzzerExecutable;

      if (debugExtensions.preferredExtension === "codeLLDB") {
        // For CodeLLDB, try to get the fuzzer path if fuzzerName is provided
        if (options.fuzzerName && !fuzzerExecutable) {
          resolvedFuzzerPath = await this.getFuzzerPath(
            workspacePath,
            options.fuzzerName,
          );
        }

        // Use CodeLLDB configuration
        debugConfig = this.createCodeLLDBConfig(
          configName,
          port,
          resolvedFuzzerPath,
        );
        extensionUsed = "CodeLLDB";
      } else if (debugExtensions.preferredExtension === "nativeDebug") {
        // Use NativeDebug (GDB) configuration
        debugConfig = this.createNativeDebugConfig(
          configName,
          port,
          fuzzerExecutable,
          options,
        );
        extensionUsed = "NativeDebug";
      } else {
        // No debug extension detected, fall back to NativeDebug format
        debugConfig = this.createNativeDebugConfig(
          configName,
          port,
          fuzzerExecutable,
          options,
        );
        extensionUsed = "NativeDebug (fallback)";
      }

      // Check if a configuration with this name already exists
      const existingIndex = launchConfig.configurations.findIndex(
        (config) => config.name === configName,
      );

      let action;
      if (existingIndex !== -1) {
        // Update existing configuration
        launchConfig.configurations[existingIndex] = debugConfig;
        action = "updated";
      } else {
        // Add new configuration
        launchConfig.configurations.push(debugConfig);
        action = "created";
      }

      // Write launch.json with pretty formatting
      const jsonContent = JSON.stringify(launchConfig, null, 2);
      await this.fs.writeFile(launchJsonPath, jsonContent + "\n", "utf-8");

      return {
        success: true,
        action,
        configName,
        launchJsonPath,
        launchJsonExists,
        extensionUsed,
        debugExtensions: {
          codeLLDB: debugExtensions.codeLLDB,
          nativeDebug: debugExtensions.nativeDebug,
          preferred: debugExtensions.preferredExtension,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        configName,
      };
    }
  }

  /**
   * Strip JSON comments (// and /* *\/) from JSON content
   * This allows us to parse launch.json files that may contain comments
   * @param {string} jsonString - JSON string potentially containing comments
   * @returns {string} JSON string with comments removed
   */
  stripJsonComments(jsonString) {
    // Remove single-line comments
    let result = jsonString.replace(/\/\/.*$/gm, "");

    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, "");

    return result;
  }

  /**
   * Get all GDB configurations from launch.json
   * @param {string} workspacePath - Path to the workspace root
   * @returns {Promise<Array>} Array of GDB configurations
   */
  async getGdbConfigurations(workspacePath) {
    try {
      const launchJsonPath = path.join(workspacePath, ".vscode", "launch.json");
      const launchJsonContent = await this.fs.readFile(launchJsonPath, "utf-8");
      const launchConfig = JSON.parse(
        this.stripJsonComments(launchJsonContent),
      );

      if (!launchConfig.configurations) {
        return [];
      }

      // Filter for GDB configurations
      return launchConfig.configurations.filter(
        (config) => config.type === "gdb" && config.request === "attach",
      );
    } catch (error) {
      // File doesn't exist or is invalid
      return [];
    }
  }

  /**
   * Remove a GDB configuration by name
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} configName - Name of the configuration to remove
   * @returns {Promise<Object>} Result object with success status
   */
  async removeGdbConfig(workspacePath, configName) {
    try {
      const launchJsonPath = path.join(workspacePath, ".vscode", "launch.json");
      const launchJsonContent = await this.fs.readFile(launchJsonPath, "utf-8");
      const launchConfig = JSON.parse(
        this.stripJsonComments(launchJsonContent),
      );

      if (!launchConfig.configurations) {
        return {
          success: false,
          error: "No configurations found",
        };
      }

      const originalLength = launchConfig.configurations.length;
      launchConfig.configurations = launchConfig.configurations.filter(
        (config) => config.name !== configName,
      );

      if (launchConfig.configurations.length === originalLength) {
        return {
          success: false,
          error: `Configuration '${configName}' not found`,
        };
      }

      // Write updated launch.json
      const jsonContent = JSON.stringify(launchConfig, null, 2);
      await this.fs.writeFile(launchJsonPath, jsonContent + "\n", "utf-8");

      return {
        success: true,
        configName,
        removed: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Check if a GDB configuration exists
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} configName - Name of the configuration to check
   * @returns {Promise<boolean>} True if configuration exists
   */
  async configExists(workspacePath, configName) {
    try {
      const configs = await this.getGdbConfigurations(workspacePath);
      return configs.some((config) => config.name === configName);
    } catch (error) {
      return false;
    }
  }
}

module.exports = { LaunchConfigManager };
