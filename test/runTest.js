const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  try {
    console.log("=== VS Code Test Runner Diagnostics ===");
    console.log("Starting VS Code test runner...");
    console.log("Display environment:", process.env.DISPLAY);
    console.log("CI environment:", process.env.CI);
    console.log("GITHUB_ACTIONS:", process.env.GITHUB_ACTIONS);
    console.log("Node version:", process.version);
    console.log("Platform:", process.platform);
    console.log("Current working directory:", process.cwd());
    console.log("Test runner path:", __filename);

    // Log all environment variables that might affect display
    console.log("\n=== Display-related Environment Variables ===");
    Object.keys(process.env).forEach((key) => {
      if (
        key.includes("DISPLAY") ||
        key.includes("XVFB") ||
        key.includes("X11") ||
        key.includes("DBUS") ||
        key.includes("ELECTRON")
      ) {
        console.log(`${key}:`, process.env[key]);
      }
    });

    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../");

    // The path to the extension test runner script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Verify paths exist
    const fs = require("fs");
    if (!fs.existsSync(path.join(extensionDevelopmentPath, "package.json"))) {
      throw new Error(
        `Extension package.json not found at ${extensionDevelopmentPath}`,
      );
    }
    if (!fs.existsSync(extensionTestsPath + ".js")) {
      throw new Error(`Test suite index not found at ${extensionTestsPath}.js`);
    }

    // Determine if we're running in CI environment
    const isCI =
      process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

    console.log("\n=== Test Configuration ===");
    console.log("Is CI environment:", isCI);
    console.log("Extension development path:", extensionDevelopmentPath);
    console.log("Extension tests path:", extensionTestsPath);

    // Configure launch arguments for CI/headless mode
    const launchArgs = [
      "--disable-extensions", // Disable other extensions during testing
      "--disable-gpu", // Disable GPU hardware acceleration
      "--no-sandbox", // Required for CI environments
    ];

    if (isCI) {
      console.log("\n=== CI Mode Detected ===");
      console.log("Adding CI-specific arguments...");

      // Don't use --headless as it's not compatible with Electron/VS Code
      // Instead, rely on Xvfb virtual display

      // Add additional flags for CI stability
      launchArgs.push(
        "--disable-dev-shm-usage", // Overcome limited resource problems
        "--disable-setuid-sandbox", // Disable setuid sandbox
        "--disable-gpu-sandbox", // Disable GPU sandbox
        "--disable-web-security", // Disable web security for CI
        "--disable-features=IsolateOrigins,site-per-process", // Disable site isolation
        "--disable-software-rasterizer", // Disable software rasterizer
      );

      // If DISPLAY is not set, we have a problem
      if (!process.env.DISPLAY) {
        console.warn("WARNING: DISPLAY environment variable is not set in CI!");
        console.warn(
          "This may cause the tests to fail. Ensure Xvfb is running.",
        );

        // Try to set a default display
        process.env.DISPLAY = ":99.0";
        console.log("Setting DISPLAY to default :99.0");
      }
    } else if (!process.env.DISPLAY) {
      console.log("\n=== No Display Detected (Non-CI) ===");
      console.log("Running in non-CI environment without display");
      console.log("This configuration may not work properly.");
    }

    console.log("\n=== Final Launch Arguments ===");
    console.log("Launch arguments:", launchArgs);

    console.log("\n=== Starting Test Execution ===");
    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs,
    });

    console.log("\n=== Tests Completed Successfully ===");
  } catch (err) {
    console.error("\n=== Test Execution Failed ===");
    console.error("Error details:", err);
    console.error("Stack trace:", err.stack);
    process.exit(1);
  }
}

main();
