# CodeForge Extension Test Suite

This directory contains the comprehensive test suite for the CodeForge VS Code extension, including automated tests and verification utilities.

## Test Structure

```
test/
├── runTest.js              # Main test runner for VS Code extension tests
├── suite/                  # Automated test suite
│   ├── index.js           # Test suite loader and configuration
│   ├── extension.test.js  # Core extension functionality tests
│   ├── docker-operations.test.js  # Docker operations tests
│   └── task-provider.test.js      # Task provider tests
└── utils/                  # Verification utilities
    ├── verify-registration.js      # Verify command registration
    ├── verify-tasks.js            # Verify task provider functionality
    ├── verify-extension-loading.js # Verify extension loads correctly
    └── test-minimal-task.js       # Test minimal task execution
```

## Running Tests

### Quick Commands

```bash
# Run all verification utilities
npm run verify

# Run full test suite (verifications + automated tests)
npm run test:full

# Run only automated tests
npm test

# Run individual verification utilities
npm run verify:registration  # Check command registration
npm run verify:tasks         # Check task provider
npm run verify:extension     # Check extension loading
npm run verify:minimal       # Test minimal task execution
```

### Test Types

#### 1. Automated Tests (`npm test`)

Full VS Code extension tests that run in a VS Code instance:

- **Requires**: VS Code test environment
- **Runtime**: ~30-60 seconds
- **Use for**: CI/CD, pre-release validation
- **Coverage**: Complete extension functionality

#### 2. Verification Utilities (`npm run verify`)

Quick standalone scripts for rapid validation:

- **Requires**: Node.js only (no VS Code instance)
- **Runtime**: ~1-2 seconds each
- **Use for**: Development, quick checks, debugging
- **Coverage**: Specific functionality areas

## Test Files Description

### Automated Test Suite

#### `extension.test.js`

Tests core extension functionality:

- Extension activation
- Command registration and execution
- Configuration management
- Error handling
- Output channel creation

#### `docker-operations.test.js`

Tests Docker-related operations:

- Container creation and management
- Image building
- Port forwarding configuration
- Volume mounting
- Docker command execution

#### `task-provider.test.js`

Tests the custom task provider:

- Task registration
- Task execution
- Task configuration parsing
- Interactive vs non-interactive tasks
- Port mapping in tasks

### Verification Utilities

#### `verify-registration.js`

Quick check for command registration:

- Validates package.json command definitions
- Ensures all commands are properly declared
- Checks activation events

#### `verify-tasks.js`

Validates task provider configuration:

- Checks task definition schema
- Validates required and optional properties
- Ensures task type registration

#### `verify-extension-loading.js`

Verifies extension can be loaded:

- Checks main entry point exists
- Validates exports structure
- Ensures no syntax errors in main files

#### `test-minimal-task.js`

Tests minimal task execution flow:

- Creates a simple task configuration
- Validates task provider can handle it
- Checks basic task execution

## When to Use Each Test Type

### Use Verification Utilities When:

- Making quick changes during development
- Debugging specific functionality
- Need rapid feedback (< 5 seconds)
- Working on isolated features
- Don't need full VS Code environment

### Use Automated Tests When:

- Preparing for release
- After major changes
- Need comprehensive coverage
- Testing VS Code API interactions
- Running CI/CD pipelines

## Development Workflow

### Recommended Development Flow:

1. Make code changes
2. Run relevant verification utility (`npm run verify:registration` for command changes)
3. Run all verifications (`npm run verify`)
4. Run full test suite before commit (`npm run test:full`)

### Quick Iteration:

```bash
# While developing a specific feature
npm run verify:tasks  # Quick validation

# Before committing
npm run verify        # All quick checks
npm test             # Full test suite
```

### CI/CD Pipeline:

```bash
# In CI environment
npm run test:full    # Runs everything
```

## Test Configuration

### Environment Variables

- `CI`: Set to 'true' in CI environments for headless testing
- `DISPLAY`: Required for Linux CI environments (usually ':99.0')

### Timeout Configuration

- Default timeout: 60 seconds (configured in suite/index.js)
- Adjust in Mocha configuration if needed for slower systems

### VS Code Version

- Minimum VS Code version: 1.103.0
- Test electron version: 2.5.2
- Configured in package.json engines field

## Troubleshooting

### Common Issues

#### Tests fail with "Cannot find module"

- Run `npm install` to ensure all dependencies are installed
- Check that node_modules is not in .gitignore for CI

#### Extension fails to activate in tests

- Check activation events in package.json
- Ensure main entry point (extension.js) exports activate/deactivate

#### Docker tests fail

- Ensure Docker is installed and running
- Check Docker permissions (user should be in docker group on Linux)
- Verify Docker daemon is accessible

#### Display errors in CI

- Ensure Xvfb is running (for Linux CI)
- Check DISPLAY environment variable is set
- See .github/workflows for CI configuration examples

### Debug Mode

To run tests with additional debugging output:

```bash
# Set DEBUG environment variable
DEBUG=* npm test

# Or for specific debugging
DEBUG=vscode-test npm test
```

## Contributing

When adding new tests:

1. Place automated tests in `test/suite/` with `.test.js` suffix
2. Place verification utilities in `test/utils/`
3. Update this README with new test descriptions
4. Add corresponding npm scripts in package.json
5. Ensure tests are independent and can run in any order

## Best Practices

1. **Keep tests focused**: Each test should verify one specific behavior
2. **Use descriptive names**: Test names should clearly indicate what they test
3. **Clean up resources**: Always clean up created resources (containers, files, etc.)
4. **Mock external dependencies**: Use sinon for mocking VS Code APIs and Docker commands
5. **Fast feedback**: Use verification utilities during development for quick validation
6. **Comprehensive coverage**: Use full test suite before releases

## Additional Resources

- [VS Code Extension Testing Guide](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Mocha Documentation](https://mochajs.org/)
- [Sinon.js Documentation](https://sinonjs.org/)
- [Docker API Documentation](https://docs.docker.com/engine/api/)
