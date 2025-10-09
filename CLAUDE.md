# CodeForge VSCode Extension - Developer Guide

## Project Overview

**CodeForge** is a comprehensive VSCode extension for Docker container management, fuzzing, and crash analysis developed by Tulip Tree Technology. It combines Docker-based development environments with advanced fuzzing capabilities and sophisticated crash analysis tools.

**Current Version:** 0.1.3
**License:** MIT
**Repository:** https://github.com/tuliptreetech/codeforge

## Project Architecture

### Directory Structure

```
codeforge-vscode-plugin/
├── src/                        # Main source code
│   ├── core/                   # Core functionality
│   │   ├── dockerOperations.js      # Docker API and container management
│   │   ├── resourceManager.js       # Template and resource management
│   │   └── initializationDetectionService.js
│   ├── fuzzing/                # Fuzzing framework
│   │   ├── fuzzingOperations.js     # Fuzzing workflow orchestration
│   │   ├── fuzzingConfig.js         # Configuration management
│   │   ├── fuzzerDiscoveryService.js
│   │   ├── crashDiscoveryService.js
│   │   ├── backtraceService.js
│   │   ├── gdbIntegration.js
│   │   ├── fuzzingTerminal.js
│   │   ├── corpusViewerService.js
│   │   ├── cmakePresetDiscovery.js
│   │   └── fuzzerUtils.js
│   ├── tasks/                  # VSCode task provider integration
│   │   └── taskProvider.js
│   ├── ui/                     # User interface components
│   │   ├── webviewProvider.js       # Activity bar control panel
│   │   ├── commandHandlers.js       # Command execution handlers
│   │   ├── hexDocumentProvider.js   # Hex viewer for crash files
│   │   ├── corpusDocumentProvider.js
│   │   └── webview.js
│   ├── utils/                  # Utility functions
│   │   └── launchConfig.js
│   └── extension.js            # Main extension entry point
├── test/                       # Test suite
│   ├── suite/                  # Mocha automated tests (*.test.js)
│   └── utils/                  # Verification utilities
├── resources/                  # Extension resources
│   ├── scripts/               # Shell scripts for fuzzing
│   └── templates/             # Dockerfile and config templates
├── docs/                       # Documentation
├── media/                      # Icons and images
└── examples/                   # Example configurations
```

### Key Components

#### 1. Docker Operations ([src/core/dockerOperations.js](src/core/dockerOperations.js))

Two primary approaches for running Docker commands:

- **`runDockerCommandWithOutput()`** - Low-level API for internal use
  - Direct Docker control with container tracking
  - Used by extension internals (fuzzing, building, testing)
  - Requires explicit image name and detailed configuration

- **`runCommandInNewContainer()`** - High-level user-facing API
  - Script-based interface via launch-process-in-docker.sh
  - Automatic image detection from workspace
  - Built-in port forwarding and interactive mode support

Container tracking system:

- `trackedContainers` Map tracks all extension-created containers
- Lifecycle management for proper cleanup
- See [src/core/dockerOperations.js:41](src/core/dockerOperations.js#L41)

#### 2. Task Provider ([src/tasks/taskProvider.js](src/tasks/taskProvider.js))

VSCode task integration for running commands in Docker containers:

- Type: `"codeforge"`
- Required property: `"command"`
- Optional: `"ports"`, `"interactive"`, `"label"`, `"detail"`

#### 3. Fuzzing Framework ([src/fuzzing/](src/fuzzing/))

Complete fuzzing workflow:

- CMake preset discovery and parsing
- Cross-platform compilation support
- Configurable fuzzing execution with real-time monitoring
- Automated crash detection and analysis
- GDB integration for debugging

#### 4. Activity Bar UI ([src/ui/webviewProvider.js](src/ui/webviewProvider.js))

Interactive webview control panel:

- Custom hammer icon in activity bar
- Real-time status updates
- Fuzzer management
- Crash analysis tools

## Development Practices

### Code Style and Formatting

**REQUIRED:** Always run Prettier before committing code:

```bash
npx prettier --write .
```

**Note:** No `.prettierrc` config exists yet, so Prettier uses defaults. If you need custom formatting rules, create a `.prettierrc` file.

### File Organization

- **All source files** belong in `src/` directories
- **All test files** belong in `test/` directories
- Use appropriate subdirectories: `core/`, `fuzzing/`, `ui/`, `tasks/`, `utils/`
- Follow existing naming conventions (camelCase for files and functions)

### Testing Strategy

**CRITICAL:** Do NOT run tests directly - I will run them and report results.

#### Test Structure

1. **Automated Tests** (`test/suite/*.test.js`)
   - Mocha-based tests that run in VSCode environment
   - Use mocking extensively (sinon library)
   - **NEVER test Docker directly** - mock all Docker calls
   - Tests must be fast (no real container operations)

2. **Verification Utilities** (`test/utils/`)
   - Standalone scripts for quick validation
   - No VSCode environment required
   - Used for development workflow

#### Adding Tests

- Fit new tests into existing test suite structure
- Mock external dependencies (Docker, file system, VSCode APIs)
- Place tests in `test/suite/` with `.test.js` suffix
- Use descriptive test names
- Keep tests focused and independent

Example test structure:

```javascript
const assert = require("assert");
const sinon = require("sinon");
const dockerOperations = require("../../src/core/dockerOperations");

describe("Docker Operations", () => {
  let execStub;

  beforeEach(() => {
    // Mock Docker commands
    execStub = sinon.stub(require("child_process"), "exec");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should run command in container", async () => {
    // Test implementation with mocked Docker
  });
});
```

### Git Workflow

**IMPORTANT:** Follow these steps for all commits:

1. **Before committing:**
   - Run Prettier: `npx prettier --write .`
   - Ensure all source files are in appropriate `src/` directories
   - Verify tests would pass (don't run them yourself)

2. **Commit process:**
   - Check current branch: `git status`
   - Sync with remote: `git fetch origin && git pull origin main`
   - Create feature branch: `git checkout -b feat/descriptive-name`
   - Stage changes: `git add .`
   - Commit with **clean message** (no Claude/AI references)
   - Push to remote: `git push -u origin feat/descriptive-name`

3. **Commit message guidelines:**
   - Use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
   - Be descriptive and concise
   - **Never mention Claude, AI, or automated tools**
   - Focus on what changed and why

Example good commit messages:

```
feat: add port forwarding support for task provider
fix: prevent default.profraw generation in fuzzer initialization
refactor: update terminal creation to use unified Docker script
test: add mocking layer for Docker operations
docs: update README with port forwarding examples
```

### Configuration

Extension settings are defined in [package.json](package.json#L145) under `contributes.configuration`:

**Core Settings:**

- `codeforge.dockerCommand` - Docker binary to use (default: "docker")
- `codeforge.defaultBaseImage` - Base image for Dockerfiles (default: "ubuntu:24.04")
- `codeforge.mountWorkspace` - Auto-mount workspace (default: true)
- `codeforge.workspaceMount` - Container mount point (default: "/workspace")
- `codeforge.defaultPortMappings` - Global port mappings (default: [])

**Fuzzing Settings:**

- `codeforge.fuzzing.libfuzzer.*` - LibFuzzer parameters
- `codeforge.fuzzing.memoryLimit` - Memory limit per fuzzer (default: 2048 MB)
- `codeforge.fuzzing.outputDirectory` - Fuzzing output location

### Port Forwarding

Supports both task-specific and global port mappings:

**Task-specific:**

```json
{
  "type": "codeforge",
  "command": "npm run dev",
  "ports": ["3000:3000", "9229:9229"]
}
```

**Global defaults:**

```json
{
  "codeforge.defaultPortMappings": ["8080:8080", "3000:3000"]
}
```

## Commands and Features

### Core Commands

- `codeforge.initializeProject` - Initialize CodeForge in workspace
- `codeforge.launchTerminal` - Launch terminal in container
- `codeforge.registerTask` - Quick task registration helper

### Fuzzing Commands

- `codeforge.runFuzzingTests` - Start fuzzing operations
- `codeforge.buildFuzzingTests` - Build fuzzing targets
- `codeforge.regenerateFuzzerList` - Refresh fuzzer cache

### Task Provider Integration

Users can run commands in Docker containers via VSCode tasks:

- Quick registration: Command Palette → "CodeForge: Register Task"
- Manual configuration in `.vscode/tasks.json`
- Seamless integration with VSCode's task system

## Technical Considerations

### Docker Container Lifecycle

- Extension tracks all created containers
- Automatic cleanup on extension deactivation (if enabled)
- Container names follow pattern: `codeforge-{workspace}-{timestamp}`
- Supports interactive and non-interactive modes

### Cross-Platform Support

- Windows path handling (backslash support)
- macOS and Linux support
- Platform-specific Docker command adjustments
- Cross-platform GDB integration

### Resource Management

- `ResourceManager` handles templates and scripts
- Resources located in `resources/` directory
- Scripts installed to `.codeforge/` in workspace
- Template-based Dockerfile generation

### Fuzzing Workflow

1. **Discovery** - Find CMake presets and fuzzer targets
2. **Build** - Compile fuzzing targets with proper flags
3. **Execute** - Run LibFuzzer with configured parameters
4. **Monitor** - Real-time progress and crash detection
5. **Analyze** - GDB integration for crash investigation

## Dependencies

**Runtime:**

- VSCode API (^1.103.0)
- Docker (external requirement)
- CMake (for fuzzing features)
- GDB (optional, for enhanced debugging)

**Development:**

- `mocha` - Test framework
- `sinon` - Mocking library
- `prettier` - Code formatting
- `@vscode/test-electron` - VSCode extension testing
- `@vscode/vsce` - Extension packaging

## Common Patterns

### Adding a New Command

1. Add command to [package.json](package.json#L79) under `contributes.commands`
2. Add activation event to `activationEvents`
3. Implement handler in [src/ui/commandHandlers.js](src/ui/commandHandlers.js)
4. Register in [src/extension.js](src/extension.js)
5. Add tests in `test/suite/`

### Adding Configuration Settings

1. Add to [package.json](package.json#L145) under `contributes.configuration.properties`
2. Access via `vscode.workspace.getConfiguration("codeforge")`
3. Document in README.md and relevant docs
4. Add validation if needed

### Working with Docker

```javascript
const dockerOps = require("./core/dockerOperations");

// High-level API (user-facing)
await dockerOps.runCommandInNewContainer(workspaceFolder, command, {
  ports: ["8080:8080"],
  interactive: true,
});

// Low-level API (internal use)
await dockerOps.runDockerCommandWithOutput(
  imageName,
  command,
  workspaceFolder,
  outputChannel,
  { additionalArgs: ["--rm"] },
);
```

### Accessing Extension Context

```javascript
// In extension.js
function activate(context) {
  // context provides:
  // - context.extensionPath (extension installation directory)
  // - context.subscriptions (disposable management)
  // - context.workspaceState (workspace storage)
  // - context.globalState (global storage)
}
```

## Documentation

- [README.md](README.md) - Main documentation
- [CHANGELOG.md](CHANGELOG.md) - Version history
- [docs/FUZZING_CONFIGURATION.md](docs/FUZZING_CONFIGURATION.md) - Fuzzing settings
- [docs/TASK_PROVIDER.md](docs/TASK_PROVIDER.md) - Task system documentation
- [docs/PORT_FORWARDING.md](docs/PORT_FORWARDING.md) - Port forwarding guide
- [test/README.md](test/README.md) - Testing documentation

## Quick Reference

### Running Verification

```bash
npm run verify              # Run all verifications
npm run verify:registration # Check command registration
npm run verify:tasks       # Check task provider
npm run verify:extension   # Check extension loading
```

### Development Workflow

1. Understand the task and requirements
2. Locate relevant files in `src/` directory
3. Make changes, following existing patterns
4. Add or update tests in `test/suite/`
5. Run prettier: `npx prettier --write .`
6. **Inform developer to run tests**
7. Create feature branch and commit

### Key Files to Know

- [src/extension.js](src/extension.js) - Extension entry point
- [src/core/dockerOperations.js](src/core/dockerOperations.js) - Docker API
- [src/tasks/taskProvider.js](src/tasks/taskProvider.js) - Task provider
- [src/ui/webviewProvider.js](src/ui/webviewProvider.js) - Activity bar UI
- [src/fuzzing/fuzzingOperations.js](src/fuzzing/fuzzingOperations.js) - Fuzzing workflow
- [package.json](package.json) - Extension manifest

## Important Notes

- **Never run npm tests directly** - always ask the developer to run them
- **Always use mocking** - never make real Docker calls in tests
- **Always run prettier** before committing
- **Never mention Claude** in commit messages
- **Always sync with origin/main** before creating feature branches
- **Don't commit until asked** - push branch but wait for instruction to commit
