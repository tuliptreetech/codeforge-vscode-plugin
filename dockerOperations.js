const { exec, spawn } = require("child_process");
const path = require("path");
const { promisify } = require("util");
const execAsync = promisify(exec);

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
 * Runs a command in a Docker container
 * @param {string} workspaceFolder - The path to the workspace folder to mount
 * @param {string} imageName - The name of the Docker image to use
 * @param {string} command - The command to run in the container
 * @param {Object} options - Options for running the container
 * @param {boolean} options.interactive - Whether to run in interactive mode (default: false)
 * @param {boolean} options.tty - Whether to allocate a pseudo-TTY (default: false)
 * @param {boolean} options.removeAfterRun - Whether to remove the container after it exits (default: true)
 * @param {string} options.workingDir - Working directory inside the container (default: same as host workspaceFolder path)
 * @param {Array<string>} options.additionalArgs - Additional arguments to pass to docker run
 * @returns {ChildProcess} The spawned child process
 */
function runDockerCommand(workspaceFolder, imageName, command, options = {}) {
  const {
    interactive = false,
    tty = false,
    removeAfterRun = true,
    workingDir = workspaceFolder, // Use the host workspace folder path as default
    additionalArgs = [],
    stdio = "inherit", // Allow customizing stdio
    dockerCommand = "docker", // Allow specifying the docker command
    mountWorkspace = true, // Allow disabling workspace mounting
  } = options;

  const dockerArgs = ["run"];

  // Add interactive and TTY flags if requested
  if (interactive) dockerArgs.push("-i");
  if (tty) dockerArgs.push("-t");

  // Remove container after run if requested
  if (removeAfterRun) dockerArgs.push("--rm");

  // Mount the workspace folder to the same path inside the container
  if (mountWorkspace) {
    dockerArgs.push("-v", `${workspaceFolder}:${workspaceFolder}`);
    // Set working directory (defaults to the workspace folder path)
    dockerArgs.push("-w", workingDir);
  }

  // Add any additional arguments
  dockerArgs.push(...additionalArgs);

  // Add the image name
  dockerArgs.push(imageName);

  // Add the command to run (if provided)
  if (command) {
    // Split the command into parts if it's a string
    const commandParts =
      typeof command === "string" ? command.split(" ") : command;
    dockerArgs.push(...commandParts);
  }

  console.log("Running Docker command:", dockerCommand, dockerArgs.join(" "));

  // Spawn the Docker process
  const dockerProcess = spawn(dockerCommand, dockerArgs, {
    stdio: stdio,
  });

  dockerProcess.on("error", (error) => {
    console.error("Failed to start Docker process:", error);
  });

  return dockerProcess;
}

/**
 * Runs a command in a Docker container with output capture support
 * @param {string} workspaceFolder - The path to the workspace folder to mount
 * @param {string} imageName - The name of the Docker image to use
 * @param {string} command - The command to run in the container
 * @param {string} shell - The shell to use for running the command
 * @param {Object} options - Options for running the container
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
  } = options;

  const dockerArgs = ["run"];

  // Remove container after run if requested
  if (removeAfterRun) dockerArgs.push("--rm");

  // Mount the workspace folder to the same path inside the container
  if (mountWorkspace) {
    dockerArgs.push("-v", `${workspaceFolder}:${workspaceFolder}`);
    dockerArgs.push("-w", workspaceFolder);
  }

  // Add any additional arguments
  dockerArgs.push(...additionalArgs);

  // Add the image name
  dockerArgs.push(imageName);

  // Add the shell command
  dockerArgs.push(shell, "-c", command);

  console.log(
    "Running Docker command with output capture:",
    dockerCommand,
    dockerArgs.join(" "),
  );

  // Spawn the Docker process with piped stdio for output capture
  const dockerProcess = spawn(dockerCommand, dockerArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  return dockerProcess;
}

/**
 * Generates Docker run arguments for terminal usage
 * @param {string} workspaceFolder - The path to the workspace folder
 * @param {string} imageName - The name of the Docker image
 * @param {Object} options - Options for the Docker run command
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
  } = options;

  const dockerArgs = ["run"];

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

// Export all functions
module.exports = {
  generateContainerName,
  checkImageExists,
  buildDockerImage,
  runDockerCommand,
  runDockerCommandWithOutput,
  generateDockerRunArgs,
  checkDockerAvailable,
};
