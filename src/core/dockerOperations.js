/**
 * Docker Operations Module
 *
 * This module provides two approaches for running commands in Docker containers:
 *
 * 1. runDockerCommandWithOutput() - Low-level, internal use
 *    - Direct Docker API control with full customization
 *    - Container lifecycle tracking and management
 *    - Used by extension internals for fuzzing, building, testing, etc.
 *    - Requires explicit image name and detailed configuration
 *
 * 2. runCommandInNewContainer() - High-level, user-facing
 *    - Simple script-based interface via launch-process-in-docker.sh
 *    - Automatic image detection from workspace
 *    - Built-in port forwarding and interactive mode support
 *    - Ideal for user-facing features and simple command execution
 *    - Requires .codeforge scripts to be initialized
 *
 * Choose runDockerCommandWithOutput() when you need:
 * - Container tracking integration
 * - Custom Docker run arguments
 * - Internal extension operations
 * - Fine-grained control
 *
 * Choose runCommandInNewContainer() when you need:
 * - Simple command execution
 * - Port forwarding
 * - Interactive sessions
 * - User-facing CLI-like features
 */

const { exec, spawn } = require("child_process");
const path = require("path");
const { promisify } = require("util");
const execAsync = promisify(exec);

/**
 * Container tracking system
 * Tracks containers created by this extension for lifecycle management
 */
const trackedContainers = new Map();

/**
 * Adds a container to the tracking list
 * @param {string} containerId - The container ID or name
 * @param {Object} metadata - Additional metadata about the container
 * @param {string} metadata.name - Container name
 * @param {string} metadata.image - Image used
 * @param {string} metadata.workspaceFolder - Associated workspace folder
 * @param {Date} metadata.createdAt - Creation timestamp
 * @param {string} metadata.type - Type of container (e.g., 'terminal', 'task', 'debug')
 */
function trackContainer(containerId, metadata = {}) {
  if (!containerId) {
    console.error("Cannot track container without ID");
    return;
  }

  const containerInfo = {
    id: containerId,
    name: metadata.name || containerId,
    image: metadata.image || "unknown",
    workspaceFolder: metadata.workspaceFolder || "",
    createdAt: metadata.createdAt || new Date(),
    type: metadata.type || "general",
    ...metadata,
  };

  trackedContainers.set(containerId, containerInfo);
  console.log(`Tracking container: ${containerId} (${containerInfo.name})`);
}

/**
 * Removes a container from the tracking list
 * @param {string} containerId - The container ID or name
 */
function untrackContainer(containerId) {
  if (!containerId) {
    return;
  }

  if (trackedContainers.has(containerId)) {
    trackedContainers.delete(containerId);
    console.log(`Untracked container: ${containerId}`);
  }
}

/**
 * Gets the list of currently tracked containers
 * @returns {Array} Array of tracked container information
 */
function getActiveContainers() {
  return Array.from(trackedContainers.values());
}

/**
 * Checks if a container is still running
 * @param {string} containerId - The container ID or name
 * @returns {Promise<boolean>} True if container is running, false otherwise
 */
async function isContainerRunning(containerId) {
  try {
    // Check both by ID and by exact name match
    const { stdout } = await execAsync(
      `docker ps --filter "id=${containerId}" --format "{{.ID}}" 2>/dev/null || docker ps --filter "name=^${containerId}$" --format "{{.ID}}" 2>/dev/null`,
    );
    return stdout.trim().length > 0;
  } catch (error) {
    console.error(`Error checking container status: ${error.message}`);
    return false;
  }
}

/**
 * Stops a single container
 * @param {string} containerId - The container ID or name
 * @param {boolean} remove - Whether to remove the container after stopping (default: true)
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function stopContainer(containerId, remove = true) {
  try {
    // Check if the container exists (by ID or name)
    let actualContainerId = containerId;
    try {
      // Try to get the actual container ID if we were given a name
      const { stdout } = await execAsync(
        `docker ps -a --filter "id=${containerId}" --filter "name=${containerId}" --format "{{.ID}}"`,
      );
      const foundId = stdout.trim();
      if (foundId) {
        actualContainerId = foundId;
      }
    } catch (error) {
      // If we can't find it, continue with the original identifier
      console.log(
        `Could not verify container ${containerId}, attempting to stop anyway`,
      );
    }

    // First try to stop the container gracefully
    console.log(
      `Stopping container: ${actualContainerId} (requested: ${containerId})`,
    );
    await execAsync(`docker stop ${actualContainerId}`, {
      timeout: 10000,
    }).catch(() => {
      // If stop fails or times out, force kill
      console.log(`Force killing container: ${actualContainerId}`);
      return execAsync(`docker kill ${actualContainerId}`);
    });

    // Remove the container if requested
    if (remove) {
      console.log(`Removing container: ${actualContainerId}`);
      await execAsync(`docker rm -f ${actualContainerId}`).catch((err) => {
        console.error(
          `Failed to remove container ${actualContainerId}: ${err.message}`,
        );
      });
    }

    // Untrack the container (use the original identifier for tracking)
    untrackContainer(containerId);
    return true;
  } catch (error) {
    console.error(`Error stopping container ${containerId}: ${error.message}`);
    // Still untrack it as it might have been manually removed
    untrackContainer(containerId);
    return false;
  }
}

/**
 * Immediately kills a container (SIGKILL) without graceful shutdown
 * @param {string} containerId - The container ID or name
 * @param {boolean} remove - Whether to remove the container after killing (default: true)
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function killContainer(containerId, remove = true) {
  try {
    // Check if the container exists (by ID or name)
    let actualContainerId = containerId;
    try {
      // Try to get the actual container ID if we were given a name
      const { stdout } = await execAsync(
        `docker ps -a --filter "id=${containerId}" --filter "name=${containerId}" --format "{{.ID}}"`,
      );
      const foundId = stdout.trim();
      if (foundId) {
        actualContainerId = foundId;
      }
    } catch (error) {
      // If we can't find it, continue with the original identifier
      console.log(
        `Could not verify container ${containerId}, attempting to kill anyway`,
      );
    }

    // Immediately kill the container (SIGKILL)
    console.log(
      `Killing container: ${actualContainerId} (requested: ${containerId})`,
    );
    await execAsync(`docker kill ${actualContainerId}`);

    // Remove the container if requested
    if (remove) {
      console.log(`Removing container: ${actualContainerId}`);
      await execAsync(`docker rm -f ${actualContainerId}`).catch((err) => {
        console.error(
          `Failed to remove container ${actualContainerId}: ${err.message}`,
        );
      });
    }

    // Untrack the container (use the original identifier for tracking)
    untrackContainer(containerId);
    return true;
  } catch (error) {
    console.error(`Error killing container ${containerId}: ${error.message}`);
    // Still untrack it as it might have been manually removed
    untrackContainer(containerId);
    return false;
  }
}

/**
 * Terminates all tracked containers
 * @param {boolean} remove - Whether to remove containers after stopping (default: true)
 * @returns {Promise<Object>} Summary of termination results
 */
async function terminateAllContainers(remove = true) {
  const containers = getActiveContainers();
  const results = {
    total: containers.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  if (containers.length === 0) {
    console.log("No containers to terminate");
    return results;
  }

  console.log(`Terminating ${containers.length} tracked container(s)...`);

  // Process containers in parallel with a limit
  const promises = containers.map(async (container) => {
    try {
      const success = await stopContainer(container.id, remove);
      if (success) {
        results.succeeded++;
      } else {
        results.failed++;
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        containerId: container.id,
        error: error.message,
      });
    }
  });

  await Promise.all(promises);

  console.log(
    `Container termination complete: ${results.succeeded} succeeded, ${results.failed} failed`,
  );
  return results;
}

/**
 * Cleans up orphaned containers (containers that are no longer running but still tracked)
 * @returns {Promise<number>} Number of orphaned containers cleaned up
 */
async function cleanupOrphanedContainers() {
  const containers = getActiveContainers();
  let cleanedUp = 0;

  for (const container of containers) {
    const running = await isContainerRunning(container.id);
    if (!running) {
      untrackContainer(container.id);
      cleanedUp++;
    }
  }

  if (cleanedUp > 0) {
    console.log(`Cleaned up ${cleanedUp} orphaned container(s) from tracking`);
  }

  return cleanedUp;
}

/**
 * Gets detailed information about tracked containers
 * @returns {Promise<Array>} Array of container information with running status
 */
async function getContainerStatus() {
  const containers = getActiveContainers();
  const statusPromises = containers.map(async (container) => {
    const running = await isContainerRunning(container.id);
    return {
      ...container,
      running,
    };
  });

  return Promise.all(statusPromises);
}

/**
 * Generates a container name from the workspace folder path
 * @param {string} workspaceFolderPath - The path to the workspace folder
 * @returns {string} The generated container name
 */
function generateContainerName(workspaceFolderPath) {
  if (!workspaceFolderPath || typeof workspaceFolderPath !== "string") {
    throw new Error("Invalid workspace folder path provided");
  }

  // Remove leading slash if present
  let containerName = workspaceFolderPath.startsWith("/")
    ? workspaceFolderPath.substring(1)
    : workspaceFolderPath;

  // Replace all slashes and backslashes with underscores
  containerName = containerName.replace(/[\/\\]/g, "_");

  // Replace colons (from Windows drive letters) with underscores
  containerName = containerName.replace(/:/g, "_");

  // Remove any characters that are not valid in Docker image names
  containerName = containerName.replace(/[^a-z0-9._-]/gi, "_");

  // Convert to lowercase
  containerName = containerName.toLowerCase();

  // Ensure the name doesn't start with a period or dash
  containerName = containerName.replace(/^[.-]+/, "");

  // Ensure the name is not empty
  if (!containerName) {
    throw new Error("The computed workspace folder is empty");
  }

  // Truncate if too long (Docker has a 128 character limit for image names)
  if (containerName.length > 100) {
    containerName = containerName.substring(0, 100);
  }

  return containerName;
}

/**
 * Checks if a Docker image exists
 * @param {string} imageName - The name of the Docker image to check
 * @returns {Promise<boolean>} True if the image exists, false otherwise
 */
async function checkImageExists(imageName) {
  try {
    const { stdout } = await execAsync(
      'docker image ls --format "{{.Repository}}:{{.Tag}}"',
    );
    const images = stdout
      .trim()
      .split("\n")
      .filter((line) => line);

    // Check if the image name exists in the list
    // Handle both with and without tag formats
    const imageWithoutTag = imageName.split(":")[0];
    const imageExists = images.some((image) => {
      return (
        image === imageName ||
        image === `${imageName}:latest` ||
        (imageName.includes(":") === false &&
          image.startsWith(`${imageWithoutTag}:`))
      );
    });

    return imageExists;
  } catch (error) {
    console.error("Error checking if image exists:", error);
    return false;
  }
}

/**
 * Builds a Docker image from the Dockerfile in the .codeforge directory
 * @param {string} workspaceFolder - The path to the workspace folder
 * @param {string} imageName - The name to give the built image
 * @returns {Promise<void>} Resolves when the build is complete
 */
function buildDockerImage(workspaceFolder, imageName) {
  return new Promise((resolve, reject) => {
    if (!workspaceFolder || !imageName) {
      reject(new Error("Workspace folder and image name are required"));
      return;
    }

    const dockerfilePath = path.join(
      workspaceFolder,
      ".codeforge",
      "Dockerfile",
    );
    const buildContext = path.join(workspaceFolder, ".codeforge");

    // Check if Dockerfile exists
    const fs = require("fs");
    if (!fs.existsSync(dockerfilePath)) {
      reject(new Error(`Dockerfile not found at ${dockerfilePath}`));
      return;
    }

    // Get username and user ID for build arguments
    const username = process.env.USER || process.env.USERNAME || "user";
    const userid = process.getuid ? process.getuid().toString() : "1000";

    const buildArgs = [
      "build",
      "-t",
      imageName,
      "--build-arg",
      `USERNAME=${username}`,
      "--build-arg",
      `USERID=${userid}`,
      "-f",
      dockerfilePath,
      buildContext,
    ];

    console.log(
      "Building Docker image with command:",
      "docker",
      buildArgs.join(" "),
    );

    const buildProcess = spawn("docker", buildArgs, {
      stdio: "inherit",
    });

    let buildTimeout = setTimeout(() => {
      buildProcess.kill();
      reject(new Error("Docker build timed out after 10 minutes"));
    }, 600000); // 10 minute timeout

    buildProcess.on("close", (code) => {
      clearTimeout(buildTimeout);
      if (code === 0) {
        console.log(`Docker image ${imageName} built successfully`);
        resolve();
      } else if (code === null) {
        reject(new Error("Docker build was terminated"));
      } else {
        reject(new Error(`Docker build failed with exit code ${code}`));
      }
    });

    buildProcess.on("error", (error) => {
      clearTimeout(buildTimeout);
      if (error.code === "ENOENT") {
        reject(
          new Error(
            "Docker command not found. Please ensure Docker is installed and in PATH",
          ),
        );
      } else {
        reject(
          new Error(`Failed to start Docker build process: ${error.message}`),
        );
      }
    });
  });
}

/**
 * Runs a command in a Docker container with output capture support (Internal Use)
 *
 * This function provides low-level Docker container management with full control over
 * container lifecycle, tracking, and configuration. It's used internally by the extension
 * for operations that require precise control over Docker behavior.
 *
 * For simpler use cases or user-facing scripts, consider using runCommandInNewContainer()
 * which leverages the launch-process-in-docker.sh script for automatic image detection
 * and simpler configuration.
 *
 * @param {string} workspaceFolder - The path to the workspace folder to mount
 * @param {string} imageName - The name of the Docker image to use
 * @param {string} command - The command to run in the container
 * @param {string} shell - The shell to use for running the command
 * @param {Object} options - Options for running the container
 * @param {boolean} options.removeAfterRun - Remove container after execution (default: true)
 * @param {string[]} options.additionalArgs - Additional docker run arguments (default: [])
 * @param {string} options.dockerCommand - Docker command to use (default: "docker")
 * @param {boolean} options.mountWorkspace - Mount the workspace folder (default: true)
 * @param {boolean} options.enableTracking - Track this container (default: true)
 * @param {string} options.containerName - Custom container name (default: auto-generated)
 * @param {string} options.containerType - Type of container for tracking (default: 'task')
 * @param {Object} options.resourceManager - ResourceManager instance for getting script paths (optional)
 * @returns {ChildProcess} The spawned child process with piped stdio for output capture
 */
function runDockerCommandWithOutput(
  workspaceFolder,
  imageName,
  command,
  shell = "/bin/bash",
  options = {},
) {
  const {
    removeAfterRun = true,
    additionalArgs = [],
    dockerCommand = "docker",
    mountWorkspace = true,
    enableTracking = true,
    containerName = null,
    containerType = "task",
    resourceManager = null,
  } = options;

  // Build arguments for the launch-process-in-docker.sh script
  // If resourceManager is provided, use the extension script path
  // Otherwise, fall back to workspace path for backward compatibility
  const scriptPath = resourceManager
    ? resourceManager.getScriptPath("launch-process-in-docker.sh")
    : path.join(
        workspaceFolder,
        ".codeforge",
        "scripts",
        "launch-process-in-docker.sh",
      );

  const scriptArgs = [];

  // If using extension scripts, pass workspace directory as first argument
  if (resourceManager) {
    scriptArgs.push(workspaceFolder);
  }

  // Add image name
  scriptArgs.push("--image", imageName);

  // Add shell
  scriptArgs.push("--shell", shell);

  // Add container name if provided
  if (containerName) {
    scriptArgs.push("--name", containerName);
  }

  // Add container type
  scriptArgs.push("--type", containerType);

  // Add keep/remove flag
  if (!removeAfterRun) {
    scriptArgs.push("-k");
  }

  // Add workspace mounting flag
  if (!mountWorkspace) {
    scriptArgs.push("--no-mount");
  }

  // Add tracking flag
  if (!enableTracking) {
    scriptArgs.push("--no-track");
  }

  // If using extension scripts, mount the scripts directory into the container
  // at the expected .codeforge/scripts location so scripts work without modification
  if (resourceManager) {
    const scriptsPath = resourceManager.scriptsPath;
    const workspacePath = workspaceFolder;
    // Mount extension scripts at .codeforge/scripts inside the container
    scriptArgs.push("--docker-arg", `-v`);
    scriptArgs.push(
      "--docker-arg",
      `${scriptsPath}:${workspacePath}/.codeforge/scripts:ro`,
    );
  }

  // Add additional docker arguments
  for (const arg of additionalArgs) {
    scriptArgs.push("--docker-arg", arg);
  }

  // Add the command
  scriptArgs.push(command);

  console.log(
    "Running Docker command via script:",
    scriptPath,
    scriptArgs.join(" "),
  );

  // Spawn the script process with piped stdio for output capture
  const scriptProcess = spawn(scriptPath, scriptArgs, {
    cwd: workspaceFolder,
    stdio: ["ignore", "pipe", "pipe"],
  });

  scriptProcess.on("error", (error) => {
    console.error("Failed to execute launch-process-in-docker.sh:", error);
  });

  // Also track in the extension's in-memory tracking system for compatibility
  if (enableTracking) {
    const finalContainerName =
      containerName ||
      `${generateContainerName(workspaceFolder)}_${containerType}_${Date.now()}`;

    trackContainer(finalContainerName, {
      name: finalContainerName,
      image: imageName,
      workspaceFolder: workspaceFolder,
      type: containerType,
      command: command,
      shell: shell,
      autoRemove: removeAfterRun,
    });

    // Clean up tracking when container exits
    scriptProcess.on("exit", () => {
      setTimeout(() => {
        untrackContainer(finalContainerName);
      }, 500);
    });
  }

  return scriptProcess;
}

/**
 * Generates Docker run arguments for terminal usage
 * @param {string} workspaceFolder - The path to the workspace folder
 * @param {string} imageName - The name of the Docker image
 * @param {Object} options - Options for the Docker run command
 * @param {boolean} options.trackContainer - Whether to track this container (default: false for auto-remove, true otherwise)
 * @param {string} options.containerName - Custom container name (default: auto-generated)
 * @param {string} options.containerType - Type of container for tracking (default: 'terminal')
 * @returns {Array<string>} Array of arguments for docker run command
 */
function generateDockerRunArgs(workspaceFolder, imageName, options = {}) {
  const {
    interactive = true,
    tty = true,
    removeAfterRun = true,
    mountWorkspace = true,
    workingDir = workspaceFolder,
    additionalArgs = [],
    shell = "/bin/bash",
    enableTracking = !removeAfterRun,
    containerName = null,
    containerType = "terminal",
  } = options;

  const dockerArgs = ["run"];

  // Always generate container name for tracking purposes
  let finalContainerName = containerName;
  if (!finalContainerName) {
    // Generate a unique container name based on workspace and timestamp
    const baseContainerName = generateContainerName(workspaceFolder);
    const timestamp = Date.now();
    finalContainerName = `${baseContainerName}_${containerType}_${timestamp}`;
  }

  // Add container name if not using --rm or if tracking is enabled
  if (!removeAfterRun || enableTracking) {
    dockerArgs.push("--name", finalContainerName);
  }

  // Store the container name in options for the caller to use for tracking
  options.generatedContainerName = finalContainerName;

  // Add interactive and TTY flags
  if (interactive) dockerArgs.push("-i");
  if (tty) dockerArgs.push("-t");

  // Remove container after run if requested
  if (removeAfterRun) dockerArgs.push("--rm");

  // Mount the workspace folder
  if (mountWorkspace) {
    dockerArgs.push("-v", `${workspaceFolder}:${workspaceFolder}`);
    dockerArgs.push("-w", workingDir);
  }

  // Add any additional arguments
  dockerArgs.push(...additionalArgs);

  // Add the image name
  dockerArgs.push(imageName);

  // Add the shell
  if (shell) {
    dockerArgs.push(shell);
  }

  return dockerArgs;
}

/**
 * Tracks a container after it has been launched via terminal
 * This is used for containers launched through VSCode terminals where we can't
 * directly track the spawn process
 * @param {string} containerName - The name of the container to track
 * @param {string} workspaceFolder - The workspace folder path
 * @param {string} imageName - The Docker image name
 * @param {string} containerType - Type of container (default: 'terminal')
 * @returns {Promise<boolean>} True if container was found and tracked, false otherwise
 */
async function trackLaunchedContainer(
  containerName,
  workspaceFolder,
  imageName,
  containerType = "terminal",
) {
  if (!containerName) {
    console.error("Cannot track container without name");
    return false;
  }

  // Implement retry logic with exponential backoff
  const maxRetries = 10;
  const baseDelay = 500; // Start with 500ms

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Calculate delay with exponential backoff (500ms, 1s, 1.5s, 2s, etc.)
      const delay = baseDelay * Math.pow(1.5, attempt);
      if (attempt > 0) {
        console.log(
          `Retry ${attempt}/${maxRetries}: Waiting ${delay}ms before checking container ${containerName}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Check if container is running
      const { stdout } = await execAsync(
        `docker ps --filter "name=${containerName}" --format "{{.ID}}"`,
      );

      const containerId = stdout.trim();
      if (containerId) {
        trackContainer(containerId, {
          name: containerName,
          image: imageName,
          workspaceFolder: workspaceFolder,
          type: containerType,
          interactive: true,
          tty: true,
        });
        console.log(
          `Successfully tracked launched container: ${containerName} (${containerId}) after ${attempt + 1} attempt(s)`,
        );
        return true;
      }

      // On last attempt, check if container exists but is not running
      if (attempt === maxRetries - 1) {
        console.log(
          `Container ${containerName} not found running after ${maxRetries} attempts, checking if it exists...`,
        );
        const { stdout: allContainers } = await execAsync(
          `docker ps -a --filter "name=${containerName}" --format "{{.ID}}"`,
        );
        if (allContainers.trim()) {
          console.log(`Container ${containerName} exists but is not running`);
        } else {
          console.log(`Container ${containerName} was not created`);
        }
      }
    } catch (error) {
      // Only log error on last attempt
      if (attempt === maxRetries - 1) {
        console.error(
          `Failed to track launched container ${containerName} after ${maxRetries} attempts: ${error.message}`,
        );
      }
    }
  }

  return false;
}

/**
 * Check if Docker is available on the system
 * @param {string} dockerCommand - The docker command to use (default: 'docker')
 * @returns {Promise<boolean>} True if Docker is available, false otherwise
 */
async function checkDockerAvailable(dockerCommand = "docker") {
  try {
    // Check if Docker command exists and get version
    await execAsync(`${dockerCommand} --version`);
    // Also check if Docker daemon is running
    await execAsync(`${dockerCommand} ps`);
    return true;
  } catch (error) {
    console.error(`Docker check failed: ${error.message}`);
    return false;
  }
}

/**
 * Runs a command in a new Docker container using the launch-process-in-docker.sh script
 *
 * This is a high-level convenience function that provides a simpler interface for running
 * commands in Docker containers. It automatically detects the Docker image based on the
 * workspace path and handles common use cases like port forwarding and interactive mode.
 *
 * Container Tracking:
 * - Containers kept with --keep flag are automatically tracked in .codeforge/tracked-containers
 * - Tracking file format: container_id|container_name|image_name|timestamp|type|status
 * - Stale entries are cleaned up automatically on each script invocation
 * - Auto-removed containers (default) are not tracked
 *
 * Use this function when:
 * - You need a simple way to run commands without managing Docker details
 * - You need port forwarding support
 * - You're creating user-facing features or CLI-like functionality
 *
 * Use runDockerCommandWithOutput() instead when you need:
 * - Fine-grained control over Docker run arguments
 * - Custom container tracking behavior
 * - Integration with extension's internal container management
 *
 * Requirements:
 * 1. The Docker image must be built for the workspace
 * 2. If resourceManager is not provided, .codeforge scripts must be installed (legacy mode)
 *
 * @param {string} workspacePath - The path to the workspace folder
 * @param {string} command - The command to run in the container
 * @param {Object} options - Options for running the command
 * @param {boolean} options.interactive - Whether to run in interactive mode (default: false)
 * @param {string[]} options.portForwards - Array of port forwards in format "HOST:CONTAINER" (default: [])
 * @param {boolean} options.keepContainer - Keep container after execution instead of removing (default: false)
 * @param {Object} options.resourceManager - ResourceManager instance for getting script paths (optional)
 * @returns {ChildProcess} The spawned child process with piped stdio for output capture
 * @throws {Error} If the Docker image doesn't exist or script is not available
 *
 * @example
 * // Run a simple command (auto-removed, not tracked)
 * const process = runCommandInNewContainer(workspacePath, 'ls -la', { resourceManager });
 *
 * @example
 * // Run with port forwarding
 * const process = runCommandInNewContainer(
 *   workspacePath,
 *   'python3 -m http.server 8000',
 *   { portForwards: ['8080:8000'], resourceManager }
 * );
 *
 * @example
 * // Keep container and track it in .codeforge/tracked-containers
 * const process = runCommandInNewContainer(
 *   workspacePath,
 *   'npm run build',
 *   { keepContainer: true, resourceManager }
 * );
 *
 * @example
 * // Interactive shell
 * const process = runCommandInNewContainer(
 *   workspacePath,
 *   '/bin/bash',
 *   { interactive: true, resourceManager }
 * );
 */
function runCommandInNewContainer(workspacePath, command, options = {}) {
  const {
    interactive = false,
    portForwards = [],
    keepContainer = false,
    imageName = null,
    shell = null,
    containerName = null,
    containerType = null,
    mountWorkspace = true,
    enableTracking = true,
    additionalArgs = [],
    resourceManager = null,
  } = options;

  // Build the script command
  // If resourceManager is provided, use the extension script path
  // Otherwise, fall back to workspace path for backward compatibility
  const scriptPath = resourceManager
    ? resourceManager.getScriptPath("launch-process-in-docker.sh")
    : path.join(
        workspacePath,
        ".codeforge",
        "scripts",
        "launch-process-in-docker.sh",
      );

  const scriptArgs = [];

  // If using extension scripts, pass workspace directory as first argument
  if (resourceManager) {
    scriptArgs.push(workspacePath);
  }

  // Add interactive flag
  if (interactive) {
    scriptArgs.push("-i");
  }

  // Add port forwarding flags
  for (const portMapping of portForwards) {
    scriptArgs.push("-p", portMapping);
  }

  // Add keep container flag
  if (keepContainer) {
    scriptArgs.push("-k");
  }

  // Add image name if provided
  if (imageName) {
    scriptArgs.push("--image", imageName);
  }

  // Add shell if provided
  if (shell) {
    scriptArgs.push("--shell", shell);
  }

  // Add container name if provided
  if (containerName) {
    scriptArgs.push("--name", containerName);
  }

  // Add container type if provided
  if (containerType) {
    scriptArgs.push("--type", containerType);
  }

  // Add workspace mounting flag
  if (!mountWorkspace) {
    scriptArgs.push("--no-mount");
  }

  // Add tracking flag
  if (!enableTracking) {
    scriptArgs.push("--no-track");
  }

  // If using extension scripts, mount the scripts directory into the container
  // at the expected .codeforge/scripts location so scripts work without modification
  if (resourceManager) {
    const scriptsPath = resourceManager.scriptsPath;
    // Mount extension scripts at .codeforge/scripts inside the container
    scriptArgs.push("--docker-arg", `-v`);
    scriptArgs.push(
      "--docker-arg",
      `${scriptsPath}:${workspacePath}/.codeforge/scripts:ro`,
    );
  }

  // Add additional docker arguments
  for (const arg of additionalArgs) {
    scriptArgs.push("--docker-arg", arg);
  }

  // Add the command
  scriptArgs.push(command);

  console.log(
    "Running command in new container:",
    scriptPath,
    scriptArgs.join(" "),
  );

  // Spawn the script process with piped stdio for output capture
  const scriptProcess = spawn(scriptPath, scriptArgs, {
    cwd: workspacePath,
    stdio: ["ignore", "pipe", "pipe"],
  });

  scriptProcess.on("error", (error) => {
    console.error("Failed to execute launch-process-in-docker.sh:", error);
  });

  return scriptProcess;
}

// Export all functions
module.exports = {
  generateContainerName,
  checkImageExists,
  buildDockerImage,
  runDockerCommandWithOutput,
  runCommandInNewContainer,
  generateDockerRunArgs,
  checkDockerAvailable,
  // Container tracking functions
  trackContainer,
  untrackContainer,
  getActiveContainers,
  terminateAllContainers,
  isContainerRunning,
  stopContainer,
  killContainer,
  cleanupOrphanedContainers,
  getContainerStatus,
  trackLaunchedContainer,
};
