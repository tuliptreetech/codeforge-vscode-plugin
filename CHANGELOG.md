# Change Log

All notable changes to the "CodeForge" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.1.1] - 2025-10-03

### Added

- **GDB Server Debugging**: Remote debugging support for crash files using GDB server
- **GDB Backtrace Integration**: Automated backtrace generation in crash reports with clickable file links for quick navigation
- **Corpus Viewer**: New interface for viewing and managing fuzzer test case corpus files
- **Test Case Count Tracking**: Real-time tracking and display of test case counts for active fuzzers
- **Individual Fuzzer Control**: Ability to run individual fuzzers directly from the activity panel
- **Clear Crashes Integration**: Integrated crash cleanup functionality with fuzzer activity panel
- **User-Controlled Initialization**: Comprehensive UI states for explicit user control over extension initialization
- **Script Copying Functionality**: Automated copying of fuzzing scripts during extension initialization
- **Centralized Resource Manager**: Template management system for better resource organization
- **Comprehensive Fuzzing Configuration**: New fuzzing configuration system with granular control over LibFuzzer parameters

### Enhanced

- **Fuzzing Build Command**: Added build functionality with proper error handling and status reporting
- **Fuzzer-Centric Display**: Transformed UI from crash-centric to fuzzer-centric for better workflow
- **Fuzzer Display Names**: Improved formatting and display of fuzzer names in activity panel
- **Script-Based Fuzzing**: Refactored fuzzing operations to use shell scripts for better maintainability
- **Resource Management**: Improved template and resource handling with centralized manager

### Fixed

- **Windows Path Handling**: Enhanced cross-platform path handling with support for Windows backslash separators
- **Backtrace Service Tests**: Made backtrace generation tests cross-platform compatible
- **CI Timing Issues**: Resolved timing-related test failures using fake timers
- **File Path Verification**: Corrected file paths in registration verification test utilities
- **Fuzzer Output Directory Handling**: Continue to next fuzzer when output directory is missing instead of failing

### Refactored

- **Crash Discovery Service**: Replaced with script-based approach for improved reliability and maintainability
- **Fuzzer Discovery**: Enhanced fuzzer discovery with proper timer handling and cross-platform support
- **Initialization Process**: Removed automatic initialization on activation in favor of user-controlled process
- **Code Cleanup**: Removed deprecated functions and unnecessary status messages

### Removed

- **Automatic Initialization**: Removed automatic initialization on extension activation
- **Deprecated Functions**: Cleaned up unused fuzzing target builder functions

## [0.1.0] - 2025-09-23

### Added

- **Comprehensive Fuzzing Framework**: Complete fuzzing workflow implementation with CMake preset discovery
  - Automatic detection and parsing of CMake presets for fuzzing targets
  - Integrated fuzz runner with configurable execution parameters
  - Fuzz target builder with cross-platform compilation support
  - Dedicated fuzzing terminal experience with enhanced output handling
- **Activity Bar Integration**: Custom CodeForge hammer icon and webview control panel
  - New activity bar view with intuitive fuzzing workflow controls
  - Interactive webview interface for managing fuzzing operations
  - Real-time status updates and progress monitoring
- **Crash Analysis & Discovery System**: Advanced crash detection and analysis capabilities
  - Automated crash discovery service with file system monitoring
  - Crash display UI with detailed crash information presentation
  - Read-only hex viewer for examining crash dumps and binary data
  - Integration with crash analysis workflows
- **GDB Integration**: Comprehensive crash analysis with debugger integration
  - Cross-platform GDB integration with proper path handling
  - Automated debugging session management for crash analysis
  - Enhanced crash investigation capabilities with symbol resolution
- **Enhanced Terminal Experience**: Dedicated fuzzing terminals with improved functionality
  - Specialized terminal handling for fuzzing operations
  - Better output parsing and status reporting
  - Integrated terminal management for complex workflows

### Enhanced

- **Project Structure**: Complete reorganization into modular src/ directory structure
  - Organized code into logical modules: src/core/, src/tasks/, src/fuzzing/, src/ui/
  - Updated package.json main entry point to src/extension.js
  - Improved code maintainability and extensibility
- **Cross-Platform Compatibility**: Enhanced Windows path handling and compatibility fixes
  - Resolved Windows-specific path resolution issues
  - Improved cross-platform file system operations
  - Better handling of Windows vs Unix path conventions
- **UI/UX Improvements**: Cleaner interface design and improved user experience
  - Enhanced button styling and visual feedback
  - Improved webview layout and responsiveness
  - Better error messaging and user guidance
- **Test Coverage**: Comprehensive test suite with 164+ passing tests
  - Complete test coverage for all new fuzzing functionality
  - Integration tests for activity bar and UI components
  - Cross-platform testing for Windows and Unix systems
  - Automated testing for crash discovery and GDB integration

### Fixed

- **Windows CI Test Failures**: Resolved Windows-specific test execution issues
- **Extension Packaging**: Fixed packaging and deployment pipeline issues
- **Path Handling**: Improved cross-platform path resolution and normalization
- **Resource Management**: Better cleanup of temporary files and processes

### New Files Added

- **Fuzzing Workflow Modules**: Complete set of fuzzing operation handlers
  - fuzzingOperations.js - Core fuzzing workflow management
  - fuzzRunner.js - Fuzz execution engine
  - fuzzTargetBuilder.js - Target compilation and preparation
  - cmakePresetDiscovery.js - CMake preset detection and parsing
  - crashDiscoveryService.js - Crash detection and analysis
  - gdbIntegration.js - Debugger integration for crash analysis
  - fuzzingTerminal.js - Specialized terminal handling
- **UI Components**: Modern webview-based user interface
  - webviewProvider.js - Main webview container and lifecycle management
  - commandHandlers.js - Command processing and execution
  - hexDocumentProvider.js - Read-only hex viewer for binary data
  - webview.html, webview.css, webview.js - Complete webview implementation
- **Media Assets**: Custom CodeForge branding
  - cf-hammer-vscode.svg - Activity bar icon
- **Example Projects**: Reference implementation for fuzzing workflows
  - examples/fuzzing/codeforge-cmake/ - Complete CMake fuzzing project example
- **Comprehensive Test Suites**: Full test coverage for all new functionality
  - Test files for all major components and integration scenarios
  - Cross-platform compatibility testing
  - UI and workflow integration tests

### Context

This major release transforms CodeForge from a basic Docker task runner into a comprehensive fuzzing and crash analysis platform, providing developers with powerful tools for security testing and vulnerability discovery.

## [0.0.3] - 2025-09-09

### Added

- **Container Management System**: Comprehensive Docker container tracking and lifecycle management
  - Automatic tracking of all containers created by terminals and tasks
  - New commands: `CodeForge: Terminate All Containers` and `CodeForge: Show Active Containers`
  - Container ID extraction from terminal output for accurate tracking
  - Task-based container tracking with proper lifecycle management
  - Automatic container cleanup on VSCode window close (configurable via `codeforge.autoTerminateContainers`)
- **Task Registration Command**: New `CodeForge: Register Task` command for managing CodeForge tasks directly from VS Code command palette
- **Comprehensive Test Suite**: 9 new test utility files covering container tracking, terminal tracking, and command execution validation
- **New Setting**: `codeforge.autoTerminateContainers` (default: true) to control automatic container termination

### Enhanced

- **Docker Operations**: Enhanced dockerOperations.js with new functions for container termination and enumeration
- **Task Provider**: Integrated container tracking for task executions
- **Documentation**: Expanded README.md with comprehensive task registration guide
- **Examples**: Updated task configuration examples with improved patterns

### Fixed

- **Function Scope Issue**: Moved `safeOutputLog` function to global scope to resolve "undefined error" during automatic initialization
- **Container Tracking**: Improved container ID extraction regex patterns for various Docker command formats
- **Resource Cleanup**: Added proper cleanup of tracking data when terminals/tasks are disposed
- **User Experience**: Removed confirmation prompts when terminating containers for streamlined workflow

## [0.0.2] - 2025-09-03

### Added

- **Port Forwarding**: Automatic port forwarding from Docker containers to host machine
  - Task-specific port configuration via `ports` property in task definitions
  - Global default port mappings via `codeforge.defaultPortMappings` setting
  - Support for multiple port mappings per task
  - Seamless integration with existing CodeForge tasks
  - Common use cases: web servers, databases, development servers, debugging ports

### Enhanced

- Task Provider now supports port forwarding configuration
- Docker operations automatically handle port mapping arguments
- Documentation expanded with comprehensive port forwarding guide

## [0.0.1] - 2025-08-24

### Added

- Initial release of CodeForge extension
- Command: Initialize CodeForge - Creates .codeforge directory with Dockerfile
- Command: Build Docker Environment - Builds Docker image from .codeforge/Dockerfile
- Command: Launch Terminal in Container - Opens interactive terminal in Docker container
- Command: Run Command in Container - Executes commands inside Docker container
- Automatic container naming based on workspace path
- User ID mapping for proper file permissions in containers
- Output channel for logging Docker operations
- Comprehensive test suite for extension functionality

### Features

- Embedded Dockerfile with Ubuntu 24.04 base image
- Pre-configured development tools:
  - Build essentials
  - ARM GCC toolchain
  - Git
  - CMake
  - Ninja build
  - Clang tools
  - Python 3 with pip
  - Various C++ testing and analysis tools
- Automatic user creation matching host user for seamless file permissions
- Support for Windows (with winpty) and Unix-like systems

### Security

- Non-root container execution by default
- Sudo access configured for development convenience

### Known Issues

- Extension requires Docker to be installed and running
- Windows support requires winpty for interactive terminals
