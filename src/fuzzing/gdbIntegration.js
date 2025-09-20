const fs = require("fs").promises;
const path = require("path");

/**
 * GDB Command Builder - Constructs proper GDB commands for crash analysis
 */
class GdbCommandBuilder {
  /**
   * Build GDB command for analyzing a crash file with a fuzzer executable
   * @param {string} fuzzerExecutable - Path to the fuzzer executable
   * @param {string} crashFile - Path to the crash file
   * @returns {string[]} Array of command arguments for GDB
   */
  buildAnalyzeCommand(fuzzerExecutable, crashFile) {
    if (!fuzzerExecutable || !crashFile) {
      throw new Error("Both fuzzer executable and crash file are required");
    }

    // Build GDB command: gdb --args $FUZZER $CRASHING_FILE
    return ["gdb", "--args", fuzzerExecutable, crashFile];
  }

  /**
   * Build GDB command with additional options
   * @param {string} fuzzerExecutable - Path to the fuzzer executable
   * @param {string} crashFile - Path to the crash file
   * @param {Object} options - Additional GDB options
   * @returns {string[]} Array of command arguments for GDB
   */
  buildAnalyzeCommandWithOptions(fuzzerExecutable, crashFile, options = {}) {
    const baseCommand = this.buildAnalyzeCommand(fuzzerExecutable, crashFile);

    // Add any additional GDB options before --args
    const gdbOptions = [];
    if (options.batch) {
      gdbOptions.push("--batch");
    }
    if (options.quiet) {
      gdbOptions.push("--quiet");
    }
    if (options.ex) {
      options.ex.forEach((cmd) => {
        gdbOptions.push("--ex", cmd);
      });
    }

    // Insert options after 'gdb' but before '--args'
    return [baseCommand[0], ...gdbOptions, ...baseCommand.slice(1)];
  }
}

/**
 * Fuzzer Resolver - Discovers fuzzer executables in .codeforge/fuzzing
 */
class FuzzerResolver {
  constructor() {
    this.fs = fs;
    this.path = path;
  }

  /**
   * Resolve fuzzer executable path from fuzzer name
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @returns {Promise<string>} Path to the fuzzer executable
   */
  async resolveFuzzerExecutable(workspacePath, fuzzerName) {
    if (!fuzzerName) {
      throw new Error("Fuzzer name is required");
    }

    const fuzzingDir = this.path.join(workspacePath, ".codeforge", "fuzzing");

    try {
      await this.fs.access(fuzzingDir);
    } catch (error) {
      throw new Error(`Fuzzing directory not found: ${fuzzingDir}`);
    }

    // Look for fuzzer executable in the fuzzing directory
    // Common patterns: fuzzer name directly, or in a subdirectory
    const possiblePaths = [
      this.path.join(fuzzingDir, fuzzerName),
      this.path.join(fuzzingDir, `${fuzzerName}-fuzz`),
      this.path.join(fuzzingDir, `codeforge-${fuzzerName}-fuzz`),
      this.path.join(fuzzingDir, fuzzerName, fuzzerName),
      this.path.join(fuzzingDir, fuzzerName, `${fuzzerName}-fuzz`),
      this.path.join(fuzzingDir, fuzzerName, `codeforge-${fuzzerName}-fuzz`),
    ];

    for (const executablePath of possiblePaths) {
      try {
        const stats = await this.fs.stat(executablePath);
        if (stats.isFile()) {
          // Check if file is executable (on Unix-like systems)
          try {
            await this.fs.access(executablePath, this.fs.constants.X_OK);
            return executablePath;
          } catch (error) {
            // File exists but is not executable, continue searching
            continue;
          }
        }
      } catch (error) {
        // File doesn't exist, continue searching
        continue;
      }
    }

    throw new Error(
      `Fuzzer executable not found for: ${fuzzerName}. Searched paths: ${possiblePaths.join(", ")}`,
    );
  }

  /**
   * List all available fuzzers in the workspace
   * @param {string} workspacePath - Path to the workspace root
   * @returns {Promise<string[]>} Array of fuzzer names
   */
  async listAvailableFuzzers(workspacePath) {
    const fuzzingDir = this.path.join(workspacePath, ".codeforge", "fuzzing");

    try {
      await this.fs.access(fuzzingDir);
    } catch (error) {
      return [];
    }

    try {
      const entries = await this.fs.readdir(fuzzingDir, {
        withFileTypes: true,
      });
      const fuzzers = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          // Check if it's an executable file
          const filePath = this.path.join(fuzzingDir, entry.name);
          try {
            await this.fs.access(filePath, this.fs.constants.X_OK);
            fuzzers.push(entry.name);
          } catch (error) {
            // Not executable, skip
          }
        } else if (entry.isDirectory()) {
          // Check if directory contains executables
          const dirPath = this.path.join(fuzzingDir, entry.name);
          try {
            const subEntries = await this.fs.readdir(dirPath, {
              withFileTypes: true,
            });
            for (const subEntry of subEntries) {
              if (subEntry.isFile()) {
                const subFilePath = this.path.join(dirPath, subEntry.name);
                try {
                  await this.fs.access(subFilePath, this.fs.constants.X_OK);
                  fuzzers.push(entry.name);
                  break; // Found at least one executable in this directory
                } catch (error) {
                  // Not executable, continue
                }
              }
            }
          } catch (error) {
            // Can't read directory, skip
          }
        }
      }

      return fuzzers;
    } catch (error) {
      throw new Error(`Failed to list fuzzers: ${error.message}`);
    }
  }
}

/**
 * Path Mapper - Maps host paths to container paths
 */
class PathMapper {
  /**
   * Map host path to container path using /workspace mount
   * @param {string} hostPath - Path on the host system
   * @param {string} workspacePath - Workspace root path on host
   * @returns {string} Corresponding path in the container
   */
  mapHostToContainer(hostPath, workspacePath) {
    if (!hostPath || !workspacePath) {
      throw new Error("Both host path and workspace path are required");
    }

    // Normalize paths - handle Windows paths properly even on non-Windows systems
    let normalizedHostPath, normalizedWorkspacePath;
    
    // Check if we're dealing with Windows-style paths (drive letter)
    const isWindowsPath = /^[A-Za-z]:/.test(hostPath) || /^[A-Za-z]:/.test(workspacePath);
    
    if (isWindowsPath) {
      // For Windows paths, normalize manually to avoid path.resolve() issues on non-Windows systems
      normalizedHostPath = hostPath.replace(/\\/g, '/');
      normalizedWorkspacePath = workspacePath.replace(/\\/g, '/');
    } else {
      // For Unix paths, use standard normalization
      normalizedHostPath = path.resolve(hostPath);
      normalizedWorkspacePath = path.resolve(workspacePath);
    }

    // Check if the host path is within the workspace
    if (!normalizedHostPath.startsWith(normalizedWorkspacePath)) {
      throw new Error(
        `Host path ${hostPath} is not within workspace ${workspacePath}`,
      );
    }

    // Get the relative path from workspace root
    const relativePath = normalizedHostPath.substring(normalizedWorkspacePath.length);
    const cleanRelativePath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;

    // Map to container path (workspace is mounted at the same path in container)
    // For containers, we need Unix-style paths regardless of host OS
    const containerWorkspacePath = normalizedWorkspacePath.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
    
    if (cleanRelativePath) {
      return path.posix.join(containerWorkspacePath, cleanRelativePath);
    } else {
      return containerWorkspacePath;
    }
  }

  /**
   * Map container path to host path
   * @param {string} containerPath - Path in the container
   * @param {string} workspacePath - Workspace root path on host
   * @returns {string} Corresponding path on the host system
   */
  mapContainerToHost(containerPath, workspacePath) {
    if (!containerPath || !workspacePath) {
      throw new Error("Both container path and workspace path are required");
    }

    // Since workspace is mounted at the same path, container path should be the same as host path
    // This method is mainly for consistency and future extensibility
    return containerPath;
  }
}

/**
 * GDB Terminal Launcher - Creates GDB terminal sessions
 */
class GdbTerminalLauncher {
  constructor(dockerOperations) {
    this.dockerOperations = dockerOperations;
  }

  /**
   * Create a GDB terminal session in a Docker container
   * @param {string} workspacePath - Path to the workspace root
   * @param {string[]} gdbCommand - GDB command arguments
   * @param {Object} options - Terminal options
   * @returns {Object} Terminal creation result
   */
  async createGdbTerminal(workspacePath, gdbCommand, options = {}) {
    const {
      containerName = null,
      removeAfterRun = true,
      additionalArgs = [],
      terminalName = "CodeForge GDB Analysis",
    } = options;

    // Generate container name
    const baseContainerName =
      containerName ||
      this.dockerOperations.generateContainerName(workspacePath);

    // Get Docker configuration
    const vscode = require("vscode");
    const config = vscode.workspace.getConfiguration("codeforge");
    const dockerCommand = config.get("dockerCommand", "docker");
    const defaultShell = config.get("defaultShell", "/bin/bash");
    const configAdditionalArgs = config.get("additionalDockerRunArgs", []);
    const mountWorkspace = config.get("mountWorkspace", true);

    // Prepare Docker run options
    const dockerOptions = {
      interactive: true,
      tty: true,
      removeAfterRun: removeAfterRun,
      mountWorkspace: mountWorkspace,
      workingDir: workspacePath,
      additionalArgs: [...configAdditionalArgs, ...additionalArgs],
      shell: defaultShell,
      enableTracking: true,
      containerType: "gdb-analysis",
    };

    // Generate Docker run arguments
    const shellArgs = this.dockerOperations.generateDockerRunArgs(
      workspacePath,
      baseContainerName,
      dockerOptions,
    );

    // Add the GDB command to the shell arguments
    // We need to modify the shell args to run GDB instead of the default shell
    const gdbCommandString = gdbCommand.join(" ");

    // Replace the default shell with a command that starts GDB
    const lastShellIndex = shellArgs.lastIndexOf(defaultShell);
    if (lastShellIndex !== -1) {
      // Replace shell with bash -c "gdb command"
      shellArgs[lastShellIndex] = "/bin/bash";
      shellArgs.splice(lastShellIndex + 1, 0, "-c", gdbCommandString);
    } else {
      // Fallback: add the command at the end
      shellArgs.push("/bin/bash", "-c", gdbCommandString);
    }

    return {
      shellPath: dockerCommand,
      shellArgs: shellArgs,
      terminalName: terminalName,
      generatedContainerName: dockerOptions.generatedContainerName,
    };
  }
}

/**
 * GDB Integration - Main orchestration class
 */
class GdbIntegration {
  constructor(dockerOperations) {
    this.dockerOperations = dockerOperations;
    this.commandBuilder = new GdbCommandBuilder();
    this.fuzzerResolver = new FuzzerResolver();
    this.pathMapper = new PathMapper();
    this.terminalLauncher = new GdbTerminalLauncher(dockerOperations);
  }

  /**
   * Analyze a crash file using GDB
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {string} crashFilePath - Path to the crash file
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeCrash(workspacePath, fuzzerName, crashFilePath, options = {}) {
    try {
      // Resolve fuzzer executable
      const fuzzerExecutable =
        await this.fuzzerResolver.resolveFuzzerExecutable(
          workspacePath,
          fuzzerName,
        );

      // Map crash file path to container path
      const containerCrashPath = this.pathMapper.mapHostToContainer(
        crashFilePath,
        workspacePath,
      );

      // Map fuzzer executable to container path
      const containerFuzzerPath = this.pathMapper.mapHostToContainer(
        fuzzerExecutable,
        workspacePath,
      );

      // Build GDB command
      const gdbCommand = this.commandBuilder.buildAnalyzeCommand(
        containerFuzzerPath,
        containerCrashPath,
      );

      // Create GDB terminal
      const terminalConfig = await this.terminalLauncher.createGdbTerminal(
        workspacePath,
        gdbCommand,
        {
          terminalName: `CodeForge GDB: ${fuzzerName}`,
          ...options,
        },
      );

      return {
        success: true,
        fuzzerExecutable,
        crashFilePath,
        gdbCommand,
        terminalConfig,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fuzzerName,
        crashFilePath,
      };
    }
  }

  /**
   * Validate that GDB analysis can be performed
   * @param {string} workspacePath - Path to the workspace root
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {string} crashFilePath - Path to the crash file
   * @returns {Promise<Object>} Validation result
   */
  async validateAnalysisRequirements(workspacePath, fuzzerName, crashFilePath) {
    const issues = [];

    try {
      // Check if crash file exists
      await fs.access(crashFilePath);
    } catch (error) {
      issues.push(`Crash file not accessible: ${crashFilePath}`);
    }

    try {
      // Check if fuzzer executable can be resolved
      await this.fuzzerResolver.resolveFuzzerExecutable(
        workspacePath,
        fuzzerName,
      );
    } catch (error) {
      issues.push(`Fuzzer executable not found: ${error.message}`);
    }

    try {
      // Check if crash file is within workspace
      this.pathMapper.mapHostToContainer(crashFilePath, workspacePath);
    } catch (error) {
      issues.push(`Path mapping failed: ${error.message}`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

module.exports = {
  GdbCommandBuilder,
  FuzzerResolver,
  PathMapper,
  GdbTerminalLauncher,
  GdbIntegration,
};
