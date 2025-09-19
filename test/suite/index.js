const path = require("path");
const Mocha = require("mocha");
const { glob } = require("glob");

function run() {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 60000,
  });

  const testsRoot = path.resolve(__dirname, "..");

  return new Promise(async (c, e) => {
    try {
      // Use more specific glob pattern to find test files
      const files = await glob("suite/**/*.test.js", { cwd: testsRoot });

      console.log("=== Test Discovery ===");
      console.log(`Found ${files.length} test file(s):`);
      files.forEach((f) => console.log(`  - ${f}`));

      // Verify we found all expected test files
      const expectedTests = [
        "extension.test.js",
        "docker-operations.test.js",
        "task-provider.test.js",
        "activity-bar-ui.test.js",
        "command-handlers.test.js",
      ];

      const foundTestNames = files.map((f) => path.basename(f));
      const missingTests = expectedTests.filter(
        (test) => !foundTestNames.includes(test),
      );

      if (missingTests.length > 0) {
        console.warn("Warning: Missing expected test files:", missingTests);
      }

      // Add files to the test suite
      files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        // Run the mocha test
        mocha.run((failures) => {
          if (failures > 0) {
            e(new Error(`${failures} tests failed.`));
          } else {
            c();
          }
        });
      } catch (err) {
        console.error(err);
        e(err);
      }
    } catch (err) {
      return e(err);
    }
  });
}

module.exports = {
  run,
};
