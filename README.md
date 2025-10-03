# CodeForge

A comprehensive fuzzing and crash analysis platform for VSCode by Tulip Tree Technology.

## Overview

CodeForge is a powerful VSCode extension that combines Docker container management with advanced fuzzing capabilities and crash analysis tools. Originally designed for Docker-based development environments, CodeForge has evolved into a complete security testing platform that helps developers discover vulnerabilities through automated fuzzing and provides sophisticated crash analysis capabilities.

## Features

CodeForge provides a comprehensive suite of tools for security testing and development:

### Core Docker Management

- **Initialize CodeForge**: Set up CodeForge in your workspace with Docker environment
- **Build Docker Environment**: Build Docker containers for your development environment
- **Launch Terminal in Container**: Open a terminal session inside a running container
- **Run Command in Container**: Execute commands inside Docker containers
- **Task Provider Integration**: Run VSCode tasks inside Docker containers seamlessly
- **Port Forwarding**: Automatically forward ports from Docker containers to your host machine

### Fuzzing Framework

- **CMake Preset Discovery**: Automatic detection and parsing of CMake presets for fuzzing targets
- **Fuzz Target Builder**: Cross-platform compilation support for fuzzing targets
- **Fuzz Runner**: Configurable fuzzing execution with real-time monitoring
- **Fuzzing Terminal**: Dedicated terminal experience with enhanced output handling
- **Fuzzing Workflow Management**: Complete end-to-end fuzzing operations

### Crash Analysis & Discovery

- **Automated Crash Detection**: File system monitoring for crash discovery
- **Crash Display UI**: Detailed crash information presentation and analysis
- **Read-only Hex Viewer**: Examine crash dumps and binary data with integrated hex viewer
- **Crash Investigation**: Advanced crash analysis workflows with detailed reporting

### GDB Integration

- **Cross-platform Debugging**: Comprehensive GDB integration with proper path handling
- **Automated Debug Sessions**: Streamlined debugging session management for crash analysis
- **Symbol Resolution**: Enhanced crash investigation with symbol information
- **Debug Workflow Integration**: Seamless integration with crash analysis tools

### Activity Bar Integration

- **Custom CodeForge Interface**: Dedicated activity bar with hammer icon for easy access
- **Webview Control Panel**: Interactive interface for managing all CodeForge operations
- **Real-time Status Updates**: Live progress monitoring and status reporting
- **Intuitive Workflow Controls**: Streamlined access to fuzzing and analysis tools

## Getting Started

### Activity Bar Interface

CodeForge adds a custom activity bar icon (hammer) to VSCode that provides access to the main control panel. Click the CodeForge icon in the activity bar to open the interactive webview interface where you can:

- Start fuzzing operations
- Monitor active containers
- Access crash analysis tools
- Manage Docker environments
- View real-time status updates

### Command Palette Access

Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on macOS) and type "CodeForge" to see all available commands.

## Usage

### Quick Start: Fuzzing Workflow

1. **Initialize CodeForge**: Use `CodeForge: Initialize CodeForge` to set up your workspace
2. **Open Control Panel**: Click the CodeForge hammer icon in the activity bar
3. **Configure Fuzzing**: Use the webview interface to configure your fuzzing targets
4. **Start Fuzzing**: Launch fuzzing operations directly from the control panel
5. **Analyze Results**: View crash reports and analyze results using the integrated tools

### Quick Start: Register a Task

The fastest way to get started with CodeForge tasks is to use the **`CodeForge: Register Task`** command:

1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type `CodeForge: Register Task` and press Enter
3. Enter your command (e.g., `npm test`, `python app.py`, `make build`)
4. That's it! Your task is automatically registered and ready to use

The command automatically:

- Creates a properly formatted task with label `Run in CodeForge: [command]`
- Adds a description `Run '[command]' in CodeForge container`
- Saves it to `.vscode/tasks.json`
- Offers to run the task immediately

You can customize the generated task later by editing `.vscode/tasks.json` if needed.

### Available Commands

#### Core Commands

1. `CodeForge: Initialize CodeForge` - Initialize CodeForge in your current workspace
2. `CodeForge: Build Docker Environment` - Build the Docker environment based on your configuration
3. `CodeForge: Launch Terminal in Container` - Open an interactive terminal in a Docker container
4. `CodeForge: Run Command in Container` - Run a specific command inside a Docker container
5. `CodeForge: Register Task` - **Recommended:** Quickly register a new CodeForge task

#### Fuzzing Commands

6. `CodeForge: Run Fuzzing Tests` - Start fuzzing operations with configured targets
7. `CodeForge: List Active Containers` - View all currently running containers
8. `CodeForge: Terminate All Containers` - Stop all running CodeForge containers
9. `CodeForge: Cleanup Orphaned Containers` - Clean up orphaned or stale containers

### Fuzzing Operations

CodeForge provides comprehensive fuzzing capabilities through its integrated framework:

#### CMake Integration

CodeForge automatically discovers CMake presets configured for fuzzing:

```json
{
  "version": 3,
  "configurePresets": [
    {
      "name": "fuzzing",
      "displayName": "Fuzzing Build",
      "description": "Build configuration for fuzzing targets"
    }
  ]
}
```

#### Fuzzing Workflow

1. **Target Discovery**: Automatic detection of fuzz targets in your project
2. **Build Process**: Cross-platform compilation of fuzzing targets
3. **Execution**: Configurable fuzzing runs with real-time monitoring
4. **Crash Detection**: Automatic discovery and cataloging of crashes
5. **Analysis**: Integrated crash analysis with GDB debugging support

### Crash Analysis

When crashes are detected, CodeForge provides comprehensive analysis tools:

#### Crash Discovery

- Automatic monitoring of fuzzing output directories
- Real-time crash detection and cataloging
- Crash file organization and management

#### Crash Investigation

- Detailed crash information display
- Integrated hex viewer for examining crash dumps
- GDB integration for deep crash analysis
- Symbol resolution and stack trace analysis

### Task Provider

CodeForge includes a VSCode Task Provider that allows you to run commands inside Docker containers. This integrates seamlessly with VSCode's task system.

#### Quick Task Registration (Recommended)

The easiest way to create CodeForge tasks is using the **`CodeForge: Register Task`** command:

1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run `CodeForge: Register Task`
3. Enter the command you want to run in the container (e.g., `npm test`, `make build`)
4. The task is automatically created with:
   - Label: `Run in CodeForge: [your command]`
   - Description: `Run '[your command]' in CodeForge container`
5. You'll be prompted to run the task immediately or can run it later via `Terminal → Run Task`

This command automatically creates or updates your `.vscode/tasks.json` file with the proper configuration. You can later edit `tasks.json` manually if you want to customize the labels, descriptions, or add additional properties like port mappings.

#### Manual Task Configuration

While using `CodeForge: Register Task` is recommended, you can also manually create or edit tasks in `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "codeforge",
      "label": "Run in CodeForge: Build",
      "command": "make build", // REQUIRED: Command to execute
      "detail": "Builds the project in Docker container",
      "group": {
        "kind": "build",
        "isDefault": true
      }
    },
    {
      "type": "codeforge",
      "label": "Run in CodeForge: Test",
      "command": "npm test", // REQUIRED: Command to execute
      "detail": "Runs tests in Docker container",
      "group": {
        "kind": "test",
        "isDefault": true
      }
    },
    {
      "type": "codeforge",
      "label": "Run in CodeForge: Dev Server",
      "command": "npm run dev", // REQUIRED: Command to execute
      "detail": "Starts development server in Docker container"
    },
    {
      "type": "codeforge",
      "label": "Run in CodeForge: Web Server with Port Forwarding",
      "command": "python -m http.server 8080", // REQUIRED: Command to execute
      "detail": "Starts a web server with port forwarding",
      "ports": ["8080:8080"] // Forward container port 8080 to host port 8080
    }
  ]
}
```

**Note:** The `"command"` property is required for all tasks. Without it, the task will fail. For quick task creation, use the `CodeForge: Register Task` command instead of manually editing this file.

### Port Forwarding

CodeForge supports automatic port forwarding from Docker containers to your host machine. This is essential for accessing services running inside containers, such as web servers, databases, or development servers.

#### Task-Specific Port Configuration

You can specify port mappings for individual tasks using the `"ports"` property:

```json
{
  "type": "codeforge",
  "label": "Run Development Server",
  "command": "npm run dev",
  "ports": [
    "3000:3000", // Forward container port 3000 to host port 3000
    "9229:9229" // Forward debugger port
  ]
}
```

#### Global Default Port Mappings

Configure default port mappings that apply to all CodeForge tasks in your VSCode settings:

```json
{
  "codeforge.defaultPortMappings": [
    "8080:8080", // Web server
    "3000:3000", // Node.js development server
    "5432:5432", // PostgreSQL
    "6379:6379" // Redis
  ]
}
```

#### How Port Forwarding Works

1. **Automatic Detection**: When a CodeForge task runs, the extension automatically adds the specified port mappings to the Docker run command
2. **Task Priority**: Task-specific `ports` configuration overrides global `defaultPortMappings`
3. **Format**: Port mappings follow Docker's format: `"host_port:container_port"` or `"container_port"` (maps to same host port)
4. **Multiple Ports**: You can forward multiple ports by specifying an array of port mappings

#### Common Use Cases

- **Web Development**: Forward ports for development servers (3000, 8080, 4200)
- **Database Access**: Connect to databases running in containers (5432 for PostgreSQL, 3306 for MySQL)
- **Debugging**: Forward debugging ports for remote debugging (9229 for Node.js)
- **Microservices**: Forward multiple service ports for microservice architectures

For detailed documentation and advanced examples, see [Port Forwarding Documentation](docs/PORT_FORWARDING.md).

For comprehensive examples and detailed documentation, see [Task Provider Documentation](docs/TASK_PROVIDER.md) and [Example Tasks](examples/tasks.json).

## Requirements

- Visual Studio Code v1.103.0 or higher
- Docker installed and running on your system
- For fuzzing operations: CMake and appropriate build tools
- For crash analysis: GDB (optional but recommended for enhanced debugging)

## Installation

This extension is currently in development. To install:

1. Clone this repository
2. Open in Visual Studio Code
3. Run the extension in development mode (F5)

## Configuration

CodeForge can be configured through VSCode settings:

### Core Settings

- `codeforge.dockerCommand`: The Docker command to use (default: `"docker"`)
- `codeforge.removeContainersAfterRun`: Automatically remove containers after they exit (default: `true`)
- `codeforge.additionalDockerRunArgs`: Additional arguments to pass to `docker run` commands (default: `[]`)
- `codeforge.showOutputChannel`: Automatically show the output channel when running commands (default: `true`)
- `codeforge.defaultShell`: Default shell to use in containers (default: `"/bin/bash"`)
- `codeforge.mountWorkspace`: Automatically mount the workspace directory in containers (default: `true`)
- `codeforge.defaultPortMappings`: Default port mappings for all CodeForge tasks (default: `[]`)

### Advanced Settings

- `codeforge.defaultBaseImage`: Default base image for new Dockerfiles (default: `"ubuntu:24.04"`)
- `codeforge.workspaceMount`: Mount point for the workspace directory inside containers (default: `"/workspace"`)
- `codeforge.terminateContainersOnDeactivate`: Automatically terminate all tracked containers when the extension is deactivated (default: `true`)

### Fuzzing Configuration

CodeForge provides comprehensive fuzzing configuration through VSCode settings. The fuzzing system supports fine-grained control over LibFuzzer execution, crash handling, resource management, and output directories.

#### Quick Configuration Example

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 50,
  "codeforge.fuzzing.libfuzzer.jobs": 8,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 300,
  "codeforge.fuzzing.memoryLimit": 2048,
  "codeforge.fuzzing.ignoreCrashes": true,
  "codeforge.fuzzing.outputDirectory": ".codeforge/fuzzing"
}
```

#### Configuration Categories

- **LibFuzzer Execution**: Control runs, parallel jobs, time limits, and input constraints
- **Crash Handling**: Configure crash detection, processing, and analysis behavior
- **Resource Management**: Set memory limits, timeouts, and performance constraints
- **Directory Management**: Control output locations and corpus preservation

#### Common Use Cases

**Quick Testing** (fast feedback):

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 10,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 60,
  "codeforge.fuzzing.exitOnCrash": true
}
```

**Comprehensive Analysis** (thorough testing):

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 500,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 3600,
  "codeforge.fuzzing.ignoreCrashes": true
}
```

**CI/CD Integration** (automated testing):

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 100,
  "codeforge.fuzzing.exitOnCrash": true,
  "codeforge.fuzzing.preserveCorpus": false
}
```

For complete configuration documentation, parameter reference, validation rules, troubleshooting, and advanced examples, see [Fuzzing Configuration Documentation](docs/FUZZING_CONFIGURATION.md).

## Release Notes

### 0.1.1

Incremental feature release with enhanced debugging, corpus management, and improved user control:

#### New Features

- **GDB Server Debugging**: Remote debugging support for analyzing crash files with GDB server integration
- **GDB Backtrace in Crash Reports**: Automated backtrace generation with clickable file links for quick navigation to source code
- **Corpus Viewer**: Interface for viewing and managing fuzzer test case corpus
- **Test Case Tracking**: Real-time display of test case counts for active fuzzers
- **Individual Fuzzer Control**: Run specific fuzzers directly from the activity panel
- **User-Controlled Initialization**: Explicit initialization control with comprehensive UI state management
- **Comprehensive Fuzzing Configuration**: Granular configuration system for LibFuzzer parameters

#### Improvements

- **Fuzzer-Centric UI**: Transformed interface from crash-focused to fuzzer-focused for better workflow
- **Enhanced Cross-Platform Support**: Improved Windows path handling with backslash separator support
- **Script-Based Fuzzing**: Refactored to use shell scripts for better maintainability
- **Resource Management**: Centralized template and resource management system
- **Better Error Handling**: Continue processing when fuzzer output directories are missing

#### Bug Fixes

- Fixed cross-platform compatibility issues in backtrace service tests
- Resolved CI timing issues in fuzzer discovery tests
- Corrected file paths in verification test utilities
- Enhanced Windows path separator handling throughout the codebase

### 0.1.0

Major release transforming CodeForge into a comprehensive fuzzing and crash analysis platform:

#### New Features

- **Comprehensive Fuzzing Framework**: Complete fuzzing workflow with CMake preset discovery, fuzz target building, and automated fuzzing operations
- **Activity Bar Integration**: Custom CodeForge hammer icon with webview control panel for intuitive access to all features
- **Crash Analysis & Discovery System**: Automated crash detection, crash display UI, and read-only hex viewer for crash file examination
- **GDB Integration**: Cross-platform debugging capabilities with automated crash analysis and symbol resolution
- **Enhanced Terminal Experience**: Dedicated fuzzing terminals with improved output handling and status reporting

#### Technical Improvements

- **Project Restructure**: Complete reorganization into modular src/ directory structure for better maintainability
- **Cross-Platform Compatibility**: Enhanced Windows path handling and compatibility fixes
- **Comprehensive Test Coverage**: 164+ passing tests covering all new functionality and cross-platform scenarios
- **UI/UX Enhancements**: Professional webview-based interface with improved styling and user experience

### 0.0.3

Major feature release with Container Management System and enhanced Docker operations:

- **Container Management System**: Added comprehensive container tracking and lifecycle management
- **Container Termination Commands**: New commands for terminating and managing running containers
- **Task Registration Command**: Streamlined task creation with `CodeForge: Register Task` command
- **Enhanced Docker Operations**: Improved Docker container handling and testing infrastructure
- **Expanded Testing Suite**: Added comprehensive test utilities for container features and task tracking

### 0.0.2

Version bump - Updated version number and documentation (2025-01-03).

### 0.0.1

Initial release of CodeForge with basic command structure.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## About

CodeForge is developed and maintained by Tulip Tree Technology.
