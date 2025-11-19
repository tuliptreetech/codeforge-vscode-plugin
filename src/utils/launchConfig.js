const fs = require("fs").promises;
const path = require("path");

/**
 * Launch Configuration Manager
 * Handles creation and management of VS Code launch.json configurations
 */
class LaunchConfigManager {
  constructor(fsModule = null) {
    this.fs = fsModule || fs;
  }

  /**
   * Create or update GDB attach configuration in workspace launch.json
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} configName - Name for the launch configuration
   * @param {number} port - Port number for GDB server connection
   * @param {string} fuzzerExecutable - Path to the fuzzer executable (host path, optional)
   * @param {Object} options - Additional configuration options
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

      // Create the GDB attach configuration
      const gdbConfig = {
        name: configName,
        type: "gdb",
        request: "attach",
        remote: true,
        target: `:${port}`,
        cwd: "${workspaceFolder}",
        valuesFormatting: options.valuesFormatting || "parseText",
        printCalls:
          options.printCalls !== undefined ? options.printCalls : false,
      };

      // Add executable if provided
      if (fuzzerExecutable) {
        gdbConfig.executable = fuzzerExecutable;
      }

      // Add autorun commands if provided, or default to connecting
      if (options.autorun && options.autorun.length > 0) {
        gdbConfig.autorun = options.autorun;
      }

      // Check if a configuration with this name already exists
      const existingIndex = launchConfig.configurations.findIndex(
        (config) => config.name === configName,
      );

      let action;
      if (existingIndex !== -1) {
        // Update existing configuration
        launchConfig.configurations[existingIndex] = gdbConfig;
        action = "updated";
      } else {
        // Add new configuration
        launchConfig.configurations.push(gdbConfig);
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
