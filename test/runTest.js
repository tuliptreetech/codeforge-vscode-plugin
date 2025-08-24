const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  try {
    console.log("Starting VS Code test runner...");
    console.log("Display environment:", process.env.DISPLAY);
    console.log("CI environment:", process.env.CI);

    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../");

    // The path to the extension test runner script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Determine if we're running in CI environment
    const isCI = process.env.CI === "true";

    // Configure launch arguments for CI/headless mode
    const launchArgs = [
      "--disable-extensions", // Disable other extensions during testing
      "--disable-gpu", // Disable GPU hardware acceleration
      "--no-sandbox", // Required for CI environments
    ];

    if (isCI || !process.env.DISPLAY) {
      console.log("Running in CI/headless mode - adding headless arguments");
      launchArgs.push("--headless");
    }

    console.log("Launch arguments:", launchArgs);

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs,
    });
  } catch (err) {
    console.error("Failed to run tests");
    process.exit(1);
  }
}

main();
