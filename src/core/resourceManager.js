const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const vscode = require("vscode");

/**
 * ResourceManager handles loading and dumping of extension resources like templates
 */
class ResourceManager {
  /**
   * Creates a new ResourceManager instance
   * @param {string} extensionPath - The path to the extension directory
   */
  constructor(extensionPath) {
    this.extensionPath = extensionPath;
    this.resourcesPath = path.join(extensionPath, "resources");
    this.templatesPath = path.join(this.resourcesPath, "templates");
    this.scriptsPath = path.join(this.resourcesPath, "scripts");
  }

  /**
   * Gets the content of a resource file
   * @param {string} resourcePath - Relative path to the resource file from the resources directory
   * @returns {Promise<string>} The content of the resource file
   * @throws {Error} If the resource file cannot be read
   */
  async getResourceContent(resourcePath) {
    try {
      const fullPath = path.join(this.resourcesPath, resourcePath);
      const content = await fs.readFile(fullPath, "utf8");
      return content;
    } catch (error) {
      throw new Error(
        `Failed to read resource '${resourcePath}': ${error.message}`,
      );
    }
  }

  /**
   * Dumps a resource file to a target directory
   * @param {string} resourcePath - Relative path to the resource file from the resources directory
   * @param {string} targetDir - Target directory to dump the resource to
   * @param {string} [filename] - Optional filename override. If not provided, uses the original filename
   * @returns {Promise<string>} The full path to the dumped file
   * @throws {Error} If the resource cannot be dumped
   */
  async dumpResource(resourcePath, targetDir, filename = null) {
    try {
      // Get the resource content
      const content = await this.getResourceContent(resourcePath);

      // Determine the target filename
      const originalFilename = path.basename(resourcePath);
      const targetFilename = filename || originalFilename;
      const targetPath = path.join(targetDir, targetFilename);

      // Ensure target directory exists
      await fs.mkdir(targetDir, { recursive: true });

      // Write the file
      await fs.writeFile(targetPath, content, "utf8");

      return targetPath;
    } catch (error) {
      throw new Error(
        `Failed to dump resource '${resourcePath}' to '${targetDir}': ${error.message}`,
      );
    }
  }

  /**
   * Dumps the .gitignore template to a target directory
   * @param {string} targetDir - Target directory to dump the .gitignore to
   * @returns {Promise<string>} The full path to the dumped .gitignore file
   * @throws {Error} If the .gitignore cannot be dumped
   */
  async dumpGitignore(targetDir) {
    try {
      return await this.dumpResource("templates/.gitignore", targetDir);
    } catch (error) {
      throw new Error(`Failed to dump .gitignore: ${error.message}`);
    }
  }

  /**
   * Dumps a single script file to a target directory with executable permissions
   * @param {string} scriptName - Name of the script file (e.g., 'build-fuzz-tests.sh')
   * @param {string} targetDir - Target directory to dump the script to
   * @returns {Promise<string>} The full path to the dumped script file
   * @throws {Error} If the script cannot be dumped
   */
  async dumpScript(scriptName, targetDir) {
    try {
      const scriptPath = `scripts/${scriptName}`;
      const targetPath = await this.dumpResource(scriptPath, targetDir);

      // Set executable permissions (equivalent to chmod +x)
      fsSync.chmodSync(targetPath, 0o755);

      return targetPath;
    } catch (error) {
      throw new Error(
        `Failed to dump script '${scriptName}': ${error.message}`,
      );
    }
  }

  /**
   * Dumps all script files to a target directory with executable permissions
   * Note: Most scripts are now available in the Docker image via 'codeforge <script-name>'.
   * Only launch-process-in-docker.sh is dumped locally as it's needed to launch containers.
   * @param {string} targetDir - Target directory to dump the scripts to
   * @returns {Promise<string[]>} Array of full paths to the dumped script files
   * @throws {Error} If any script cannot be dumped
   */
  async dumpScripts(targetDir) {
    try {
      const scriptFiles = ["launch-process-in-docker.sh"];
      const dumpedPaths = [];

      for (const scriptFile of scriptFiles) {
        const dumpedPath = await this.dumpScript(scriptFile, targetDir);
        dumpedPaths.push(dumpedPath);
      }

      return dumpedPaths;
    } catch (error) {
      throw new Error(`Failed to dump scripts: ${error.message}`);
    }
  }

  /**
   * Gets the full path to a resource file
   * @param {string} resourcePath - Relative path to the resource file from the resources directory
   * @returns {string} The full path to the resource file
   */
  getResourcePath(resourcePath) {
    return path.join(this.resourcesPath, resourcePath);
  }

  /**
   * Checks if a resource file exists
   * @param {string} resourcePath - Relative path to the resource file from the resources directory
   * @returns {Promise<boolean>} True if the resource exists, false otherwise
   */
  async resourceExists(resourcePath) {
    try {
      const fullPath = this.getResourcePath(resourcePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the full path to a script file in the extension
   * @param {string} scriptName - Name of the script file (e.g., 'build-fuzz-tests.sh')
   * @returns {string} The full path to the script file in the extension
   */
  getScriptPath(scriptName) {
    return path.join(this.scriptsPath, scriptName);
  }

  /**
   * Gets all available script names
   * Note: Most scripts are now in the Docker image. Only launch-process-in-docker.sh is local.
   * @returns {string[]} Array of script filenames
   */
  getAvailableScripts() {
    return ["launch-process-in-docker.sh"];
  }
}

module.exports = { ResourceManager };
