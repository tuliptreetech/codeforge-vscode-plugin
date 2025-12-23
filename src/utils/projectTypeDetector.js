const fs = require("fs").promises;
const path = require("path");

/**
 * Project type constants
 */
const PROJECT_TYPES = {
  CMAKE: "cmake",
  RUST: "rust",
  UNKNOWN: "unknown",
};

/**
 * Docker images for each project type
 */
const PROJECT_TYPE_IMAGES = {
  [PROJECT_TYPES.CMAKE]: "ghcr.io/tuliptreetech/codeforge-cmake:main-609e0ab",
  [PROJECT_TYPES.RUST]: "ghcr.io/tuliptreetech/codeforge-rust:main-609e0ab",
};

/**
 * Detects the project type based on files present in the workspace
 * @param {string} workspacePath - Path to the workspace root
 * @returns {Promise<string>} Project type (cmake, rust, or unknown)
 */
async function detectProjectType(workspacePath) {
  if (!workspacePath) {
    return PROJECT_TYPES.UNKNOWN;
  }

  try {
    // Check for Cargo.toml (Rust project)
    const cargoTomlPath = path.join(workspacePath, "Cargo.toml");
    try {
      await fs.access(cargoTomlPath);
      console.log("Detected Rust project (found Cargo.toml)");
      return PROJECT_TYPES.RUST;
    } catch (error) {
      // Cargo.toml not found, continue checking
    }

    // Check for CMakePresets.json (CMake project)
    const cmakePresetsPath = path.join(workspacePath, "CMakePresets.json");
    try {
      await fs.access(cmakePresetsPath);
      console.log("Detected CMake project (found CMakePresets.json)");
      return PROJECT_TYPES.CMAKE;
    } catch (error) {
      // CMakePresets.json not found, continue checking
    }

    // Check for CMakeLists.txt (CMake project without presets)
    const cmakeListsPath = path.join(workspacePath, "CMakeLists.txt");
    try {
      await fs.access(cmakeListsPath);
      console.log("Detected CMake project (found CMakeLists.txt)");
      return PROJECT_TYPES.CMAKE;
    } catch (error) {
      // CMakeLists.txt not found
    }

    console.log("Could not detect project type");
    return PROJECT_TYPES.UNKNOWN;
  } catch (error) {
    console.error(`Error detecting project type: ${error.message}`);
    return PROJECT_TYPES.UNKNOWN;
  }
}

/**
 * Gets the appropriate Docker image for a project type
 * @param {string} projectType - Project type (cmake, rust, or unknown)
 * @returns {string} Docker image name
 */
function getDockerImageForProjectType(projectType) {
  const image = PROJECT_TYPE_IMAGES[projectType];
  if (!image) {
    // Default to CMake image for unknown project types
    console.warn(
      `No Docker image configured for project type "${projectType}", using CMake image as fallback`,
    );
    return PROJECT_TYPE_IMAGES[PROJECT_TYPES.CMAKE];
  }
  return image;
}

/**
 * Gets the project type and appropriate Docker image for a workspace
 * @param {string} workspacePath - Path to the workspace root
 * @returns {Promise<{projectType: string, dockerImage: string}>}
 */
async function getProjectTypeAndImage(workspacePath) {
  const projectType = await detectProjectType(workspacePath);
  const dockerImage = getDockerImageForProjectType(projectType);

  return {
    projectType,
    dockerImage,
  };
}

module.exports = {
  PROJECT_TYPES,
  PROJECT_TYPE_IMAGES,
  detectProjectType,
  getDockerImageForProjectType,
  getProjectTypeAndImage,
};
