# CodeForge VSCode Extension - Developer Guide

## Project Overview

**CodeForge** is a comprehensive VSCode extension for Docker container management, fuzzing, and crash analysis developed by Tulip Tree Technology. It combines Docker-based development environments with advanced fuzzing capabilities and sophisticated crash analysis tools.

**Current Version:** 0.1.5
**License:** MIT
**Repository:** https://github.com/tuliptreetech/codeforge

## Table of Contents

- [Project Architecture](#project-architecture)
- [Development Practices](#development-practices)
- [Configuration](#configuration)
- [Commands and Features](#commands-and-features)
- [Technical Considerations](#technical-considerations)
- [Common Patterns](#common-patterns)
- [Publishing](#publishing)
- [Documentation](#documentation)

---

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

#### 1. Docker Operations ([src/core/dockerOperations.js](../src/core/dockerOperations.js))

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
- See [src/core/dockerOperations.js:41](../src/core/dockerOperations.js#L41)

#### 2. Task Provider ([src/tasks/taskProvider.js](../src/tasks/taskProvider.js))

VSCode task integration for running commands in Docker containers:

- Type: `"codeforge"`
- Required property: `"command"`
- Optional: `"ports"`, `"interactive"`, `"label"`, `"detail"`

#### 3. Fuzzing Framework ([src/fuzzing/](../src/fuzzing/))

Complete fuzzing workflow:

- CMake preset discovery and parsing
- Cross-platform compilation support
- Configurable fuzzing execution with real-time monitoring
- Automated crash detection and analysis
- GDB integration for debugging

#### 4. Activity Bar UI ([src/ui/webviewProvider.js](../src/ui/webviewProvider.js))

Interactive webview control panel:

- Custom hammer icon in activity bar
- Real-time status updates
- Fuzzer management
- Crash analysis tools

---

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

---

## Configuration

Extension settings are defined in [package.json](../package.json#L145) under `contributes.configuration`:

### Core Settings

- `codeforge.dockerCommand` - Docker binary to use (default: "docker")
- `codeforge.defaultBaseImage` - Base image for Dockerfiles (default: "ubuntu:24.04")
- `codeforge.mountWorkspace` - Auto-mount workspace (default: true)
- `codeforge.workspaceMount` - Container mount point (default: "/workspace")
- `codeforge.defaultPortMappings` - Global port mappings (default: [])

### Fuzzing Settings

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

---

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

---

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

---

## Common Patterns

### Adding a New Command

1. Add command to [package.json](../package.json#L79) under `contributes.commands`
2. Add activation event to `activationEvents`
3. Implement handler in [src/ui/commandHandlers.js](../src/ui/commandHandlers.js)
4. Register in [src/extension.js](../src/extension.js)
5. Add tests in `test/suite/`

### Adding Configuration Settings

1. Add to [package.json](../package.json#L145) under `contributes.configuration.properties`
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

---

## Publishing

### Prerequisites

1. **Node.js and npm** installed (v16.x or higher)
2. **Visual Studio Code** installed
3. **Personal Access Token (PAT)** for VS Code Marketplace
4. **Docker** installed (for testing)

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Install VS Code Extension Manager (vsce):

   ```bash
   npm install -g @vscode/vsce
   ```

3. Generate the PNG icon from SVG (if needed):
   ```bash
   convert -background none -resize 128x128 icon.svg icon.png
   ```

### Testing

Before packaging, ensure all tests pass:

```bash
# Run tests
npm test

# Test the extension locally
# Press F5 in VS Code to launch a new Extension Development Host window
```

### Packaging

#### Local Package

To create a .vsix package for local distribution:

```bash
vsce package
```

This creates a file like `codeforge-0.1.0.vsix` that can be:

- Shared directly with users
- Installed using `code --install-extension codeforge-0.1.0.vsix`
- Uploaded to private extension registries

#### Pre-publish Checklist

- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md` with release notes
- [ ] Ensure `README.md` is up to date
- [ ] Verify icon.png exists (128x128 PNG)
- [ ] Run all tests: `npm test`
- [ ] Test extension manually in VS Code
- [ ] Commit all changes
- [ ] Create a git tag: `git tag v0.1.0`

### Publishing to VS Code Marketplace

#### First-time Setup

1. Create a publisher account at https://marketplace.visualstudio.com/manage

2. Generate a Personal Access Token (PAT):
   - Go to https://dev.azure.com/[your-organization]/_usersSettings/tokens
   - Create new token with "Marketplace (Publish)" scope
   - Copy the token (you won't see it again!)

3. Login to vsce:
   ```bash
   vsce login [publisher-name]
   # Enter your PAT when prompted
   ```

#### Publish

```bash
# Publish to VS Code Marketplace
vsce publish

# Or publish with version bump
vsce publish minor  # 0.0.1 -> 0.1.0
vsce publish major  # 0.1.0 -> 1.0.0
vsce publish patch  # 0.1.0 -> 0.1.1
```

#### Automated Publishing

The GitHub Actions workflow will automatically:

1. Run tests on push/PR
2. Create releases when pushing to main
3. Publish to marketplace when a release is created (requires VSCE_PAT secret)

To set up automated publishing:

1. Add `VSCE_PAT` secret to GitHub repository settings
2. Push to main branch or create a release

### Publishing to Open VSX Registry

For VS Code compatible editors (VSCodium, Gitpod, etc.):

1. Create account at https://open-vsx.org/
2. Generate access token
3. Install ovsx CLI: `npm install -g ovsx`
4. Publish: `ovsx publish -p [token]`

### Distribution Channels

1. **VS Code Marketplace**: Official Microsoft marketplace
2. **Open VSX**: Open-source alternative marketplace
3. **Direct VSIX**: Share .vsix file directly
4. **GitHub Releases**: Automated via CI/CD
5. **Private Registry**: For enterprise distribution

### Troubleshooting

#### Common Issues

1. **Missing icon.png**: Generate from icon.svg (see instructions)
2. **Tests failing**: Run `npm test` locally to debug
3. **PAT expired**: Generate new token and re-login
4. **Version conflict**: Bump version in package.json

#### Validation

Before publishing, validate your extension:

```bash
vsce ls  # List files that will be included
vsce package --out test.vsix  # Test packaging
```

### Post-publish

After publishing:

1. Verify extension appears in marketplace (may take a few minutes)
2. Test installation: `code --install-extension codeforge`
3. Monitor user feedback and ratings
4. Update GitHub release notes

### Version Management

Follow semantic versioning:

- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes

Always update CHANGELOG.md with version changes!

---

## Documentation

- [README.md](../README.md) - Main documentation
- [CHANGELOG.md](../CHANGELOG.md) - Version history
- [test/README.md](../test/README.md) - Testing documentation

---

## Dependencies

### Runtime

- VSCode API (^1.103.0)
- Docker (external requirement)
- CMake (for fuzzing features)
- GDB (optional, for enhanced debugging)

### Development

- `mocha` - Test framework
- `sinon` - Mocking library
- `prettier` - Code formatting
- `@vscode/test-electron` - VSCode extension testing
- `@vscode/vsce` - Extension packaging

---

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

- [src/extension.js](../src/extension.js) - Extension entry point
- [src/core/dockerOperations.js](../src/core/dockerOperations.js) - Docker API
- [src/tasks/taskProvider.js](../src/tasks/taskProvider.js) - Task provider
- [src/ui/webviewProvider.js](../src/ui/webviewProvider.js) - Activity bar UI
- [src/fuzzing/fuzzingOperations.js](../src/fuzzing/fuzzingOperations.js) - Fuzzing workflow
- [package.json](../package.json) - Extension manifest

---

## Important Notes

- **Never run npm tests directly** - always ask the developer to run them
- **Always use mocking** - never make real Docker calls in tests
- **Always run prettier** before committing
- **Never mention Claude** in commit messages
- **Always sync with origin/main** before creating feature branches
- **Don't commit until asked** - push branch but wait for instruction to commit
