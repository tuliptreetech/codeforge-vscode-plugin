# Change Log

All notable changes to the "CodeForge" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

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
