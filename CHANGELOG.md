# Change Log

All notable changes to the "CodeForge" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.1.6] - 2025-12-23

### Changed

- **Docker Images**: Updated Docker images to main-609e0ab
  - Updated CMake and Rust workflow images to latest version
  - Ensures compatibility with latest codeforge CLI features and improvements

### Technical

- **Image Updates**: Synchronized Docker image versions across all workflows
- **Build Improvements**: Latest image includes enhanced build tools and dependencies

## [0.1.5] - 2025-12-18

### Added

- **Rust Project Support**: Comprehensive automatic detection and support for Rust fuzzing projects
  - Automatic detection of cargo-fuzz projects via Cargo.toml
  - Integration with Rust fuzzing workflows and tooling
  - Enhanced fuzzer discovery for Rust-based fuzzers
- **Docker Image Update Management**: One-click Docker image updates with visual notifications
  - Lightweight image verification without automatic downloads
  - Prominent blue gradient "Update Image" button in control panel
  - Progress notifications during updates with automatic re-verification
  - New `codeforge.updateDockerImage` command
- **CodeLLDB Debug Extension Support**: Automatic fuzzer validation with debugging integration
  - Integration with CodeLLDB extension for enhanced debugging capabilities
  - Automatic fuzzer validation during debug sessions
  - Improved debugging workflow for crash analysis
- **Automated GDB-based Crash Debugging**: VSCode-integrated crash debugging with gdbserver
  - Automated gdbserver-based crash debugging workflow
  - VSCode debugging integration for crash analysis
  - Streamlined crash investigation process
- **Consolidated Developer Documentation**: Single comprehensive developer guide
  - Merged CLAUDE.md, PUBLISHING.md, and subsystem docs into [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)
  - Simplified documentation structure (removed 8 files, 3,329 lines)
  - Improved discoverability with unified reference
- **CodeForge Icon in Control Panel**: Visual branding enhancement
  - Added CodeForge icon (icon.png) as centered header in control panel webview
  - Responsive icon scaling (0-300px width) with aspect ratio maintenance
  - New media assets: codeforge-horizontal.png and code-forge-orange-circle.png

### Enhanced

- **Control Panel Performance**: Dramatic performance improvements for panel interactions
  - Eliminated redundant initialization checks on panel switches
  - Cached initialization, Docker, and fuzzer discovery results per session
  - Panel switching now nearly instant (only message round-trip time)
  - Smart UI rendering waits for valid data before display
  - Reduced unnecessary Docker command executions
- **Loading State Management**: Eliminated UI flickering and flashing
  - Fixed webview loading state flickering on initialization
  - Prevented "No fuzzers found" message from flashing before scan completion
  - Removed redundant state update cycles
  - Single smooth transition from loading to displaying fuzzers
  - Show cached data immediately when available
- **Report Generation**: Migrated to codeforge CLI commands
  - Replaced manual corpus generation with `codeforge generate-corpus-report` command
  - Replaced manual crash report generation with `codeforge generate-crash-report` command
  - Improved maintainability by centralizing logic in Docker images
- **Corpus Viewer**: Enhanced real-time updates
  - Automatic corpus viewer document updates when files are open
  - Real-time corpus monitoring and display
- **Crash Discovery**: Improved crash detection accuracy
  - Updated crash parser delimiter (using `/` separator instead of `:`)
  - Enhanced crash file detection in both corpus subdirectory and output root
  - Path-based crash output format for better organization
- **Initialization UI**: Cleaner initialization interface
  - Redesigned initialization section with prominent "Initialize CodeForge" button
  - Button displayed above description text for better visibility
  - Removed wrench emoji icon for cleaner appearance

### Fixed

- **GDB Integration**: Enhanced crash debugging reliability
  - Fixed crash parser delimiter handling
  - Removed redundant build step in debug workflow
  - Proper handling of empty preset strings for Rust fuzzers
  - Improved path matching in GDB integration tests
- **Test Suite Updates**: Comprehensive test coverage improvements
  - Updated test expectations for new fuzzer loading state
  - Fixed async wait for discovery checks in initialization tests
  - Updated CrashReportProvider tests to match new behavior
  - Fixed old tests to use `/` separator instead of `:`
  - Added proper mock setup using callsFake for path matching
- **Content Security Policy**: Added img-src support for icon display in webview
- **File Naming**: Various file name corrections and consistency improvements

### Refactored

- **Crash Debugging Workflow**: Delegated to codeforge CLI
  - Integrated `codeforge` command for backtrace generation
  - Delegated GDB crash debugging to codeforge CLI commands
  - Streamlined debugging workflow with centralized tooling
- **Docker Images**: Updated to latest versions
  - Updated to main-10c67cb for both CMake and Rust workflows
  - Ensured compatibility with latest codeforge CLI features

### Technical

- **Documentation**: Updated VSCode marketplace description to reflect full feature set
- **Code Formatting**: Applied prettier to ensure consistent code style
- **Asset Management**: Removed CI icon download step (icons now committed to repo)
- **Media Resources**: Added webview localResourceRoots for media folder access

## [0.1.4] - 2025-11-11

### Added

- **Security Validation**: Comprehensive fuzzer name validation to prevent shell injection attacks with 48 test cases
- **Timeout Handling**: Configurable timeouts for Docker operations (checkImageExists, isContainerRunning) to prevent infinite hangs
- **Crash Reevaluation**: New functionality to test crash files against rebuilt binaries to identify fixed bugs
- **Script Auto-Sync**: Automatic script synchronization on extension load for seamless upgrades

### Enhanced

- **Docker Image Distribution**: Migrated from local Docker builds to pre-built GHCR images (ghcr.io/tuliptreetech/codeforge-cmake)
  - Improved reliability and consistency across installations
  - Faster deployment without local build requirements
  - Pre-configured fuzzing environment with all tools built-in
- **Multi-Architecture Support**: Removed hardcoded linux/amd64 platform constraints for native ARM64 execution
  - Enables Apple Silicon and ARM servers to run containers without emulation overhead
  - Automatic platform detection and native execution
- **Script Architecture**: Migrated 7 fuzzing scripts from local resources to Docker image
  - Scripts now accessed via `codeforge <script-name>` CLI format
  - Reduced local resource footprint
  - Only launch-process-in-docker.sh remains local for container bootstrapping
- **Launch Script Interface**: Simplified launch-process-in-docker.sh by auto-detecting workspace directory
  - Removed workspace directory as required positional argument
  - Script now uses $(pwd) automatically
  - Default behavior launches interactive shell when no command specified
- **Fuzzing UI**: Added automatic refresh after each fuzzing run for up-to-date crash information
- **Initialization Components**: Reduced from 4 to 3 components (removed Dockerfile, kept directory/gitignore/scripts)

### Fixed

- **Null Reference Protection**: Added safety checks in TaskProvider to prevent crashes
- **State Verification**: Enhanced initialization state verification
- **Directory Creation**: Fixed container cleanup script directory creation issues
- **Fuzzer Display**: Fixed state management bug preventing fuzzers from displaying
- **Crash Discovery**: Improved crash detection to check both corpus subdirectory and output root

### Refactored

- **Resource Management**: Updated ResourceManager to handle GHCR image workflow
  - Removed dumpDockerfile() method
  - Implemented pullAndTagDockerImage() with platform support
  - Updated all initialization and fuzzing services for image pull workflow
- **Testing Updates**: Fixed 22 failing tests related to Docker image workflow changes
  - Updated mocks and expectations for pull-based architecture
  - Removed dumpDockerfile test suite
  - Added Docker operation mocks for initialization tests
- **Script Paths**: Updated all script invocations throughout fuzzing services and command handlers
- **Documentation**: Updated focus from security testing to quality assurance and bug detection

### Security

- **Input Validation**: Fuzzer names now validated against strict patterns to prevent command injection
- **Timeout Protection**: Docker operations timeout after configurable period to prevent resource exhaustion

### Technical

- **Test Coverage**: Added 48 comprehensive fuzzer name validation tests
- **Error Handling**: Improved error messages and user feedback for initialization and Docker operations
- **Code Cleanup**: Removed inaccurate crash/error reporting from fuzzing output
- **Button UI**: Removed unnecessary cancel buttons for cleaner interface

## [0.1.3] - 2025-10-09

### Added

- **Developer Guide**: Comprehensive CLAUDE.md documentation covering project architecture, development practices, testing strategy, and git workflow
- **VSCode Terminal Support**: --stdin mode for launch-process-in-docker.sh enabling proper terminal integration with VSCode's pseudo-TTY environment
- **Unified Docker Script**: Single launch-process-in-docker.sh script providing comprehensive Docker operations interface with automatic container tracking

### Enhanced

- **Container Operations**: All Docker operations now use unified script for consistency and maintainability
- **Terminal Creation**: Refactored handleLaunchTerminal and createGdbTerminal to use unified script
- **Docker Script Features**: Automatic image detection, port forwarding, interactive mode, custom configurations, and lifecycle tracking
- **Container Tracking**: File-based tracking system (.codeforge/tracked-containers) that survives extension restarts

### Fixed

- **Terminal Integration**: VSCode terminals now properly connect stdin/stdout by exec'ing docker directly
- **Test Case Counting**: Fixed to sum iterations from all parallel fuzzer workers instead of only last job
- **Profiling Files**: Disabled LLVM profiling in GDB operations to prevent default.profraw generation in workspace
- **Initialization Prompts**: Fuzzer discovery no longer prompts for initialization on extension load
- **Test Stubs**: Resolved 'already stubbed' errors in checkImageExists tests

### Refactored

- **Docker Operations**: Removed ~150 lines of code by delegating to unified script
- **Code Organization**: Cleaner separation of concerns with script-based approach
- **Container Tracking**: Dual tracking (file-based + in-memory) for backward compatibility

### Documentation

- **CLAUDE.md**: Complete developer onboarding guide with architecture details, development practices, and quick reference

## [0.1.2] - 2025-10-08

### Added

- **Automatic GDB Launch Configuration**: Auto-creates and manages VS Code launch.json configurations for crash debugging with gdbserver
- **Regenerate Fuzzer List Command**: New command to clear cached fuzzer list and regenerate from CMake presets
- **Filesystem-Based Crash Counting**: Accurate tracking of new crashes by counting crash files before and after fuzzing sessions
- **Enhanced Script Installation**: All fuzzing scripts (build, find, run, crashes, backtrace, clear) are now packaged and installed during initialization

### Enhanced

- **Improved Terminal Output**: Enhanced fuzzing terminal with aligned status boxes and separate crash information display
- **Better Crash File Handling**: Crash viewer now reads only needed bytes (64KB) instead of entire files, preventing VSCode 50MB limit issues
- **Smarter Output Channel Behavior**: Output channel only auto-shows for errors or user-requested actions, reducing noise
- **Refresh Button Behavior**: Refresh button now bypasses cache to always fetch fresh data and prevents UI duplication

### Fixed

- **GDB Remote Debugging**: Resolved threading and stack trace errors when connecting to gdbserver
  - Fixed "Cannot execute this command while the target is running" error
  - Fixed "Selected thread is running" error
  - Added stopAtConnect configuration for proper target state on connection
- **Terminal Error Handling**: Terminal now stays open on fuzzer build errors with key-to-close prompt for better error visibility
- **Initialization Check**: Fuzzer refresh command now validates CodeForge initialization before attempting discovery
- **Command Registration Cleanup**: Removed unsupported commands from package.json, resolving "command not found" errors

### Technical

- **Launch Configuration Management**: New LaunchConfigManager utility for managing launch.json with JSON comment support
- **Crash Counting Logic**: Per-fuzzer statistics showing "X new (Y total)" crashes
- **GDB Session Lifecycle**: Improved gdbserver session handling with --once flag and proper connection sequence
- **Script Verification**: InitializationDetectionService now verifies all 6 scripts are present with executable permissions

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
