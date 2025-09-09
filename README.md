# CodeForge

Docker container management for development environments by Tulip Tree Technology.

## Features

CodeForge is a VSCode extension that simplifies Docker container management directly from the command palette. It provides the following features:

- **Initialize CodeForge**: Set up CodeForge in your workspace
- **Build Docker Environment**: Build Docker containers for your development environment
- **Launch Terminal in Container**: Open a terminal session inside a running container
- **Run Command in Container**: Execute commands inside Docker containers
- **Task Provider Integration**: Run VSCode tasks inside Docker containers seamlessly
- **Port Forwarding**: Automatically forward ports from Docker containers to your host machine

## Usage

Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on macOS) and type "CodeForge" to see all available commands.

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

1. `CodeForge: Initialize CodeForge` - Initialize CodeForge in your current workspace
2. `CodeForge: Build Docker Environment` - Build the Docker environment based on your configuration
3. `CodeForge: Launch Terminal in Container` - Open an interactive terminal in a Docker container
4. `CodeForge: Run Command in Container` - Run a specific command inside a Docker container
5. `CodeForge: Register Task` - **Recommended:** Quickly register a new CodeForge task

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

- Visual Studio Code v1.74.0 or higher
- Docker installed and running on your system

## Installation

This extension is currently in development. To install:

1. Clone this repository
2. Open in Visual Studio Code
3. Run the extension in development mode (F5)

## Configuration

CodeForge can be configured through VSCode settings:

- `codeforge.dockerCommand`: The Docker command to use (default: `"docker"`)
- `codeforge.removeContainersAfterRun`: Automatically remove containers after they exit (default: `true`)
- `codeforge.additionalDockerRunArgs`: Additional arguments to pass to `docker run` commands (default: `[]`)
- `codeforge.showOutputChannel`: Automatically show the output channel when running commands (default: `true`)
- `codeforge.defaultShell`: Default shell to use in containers (default: `"/bin/bash"`)
- `codeforge.mountWorkspace`: Automatically mount the workspace directory in containers (default: `true`)
- `codeforge.defaultPortMappings`: Default port mappings for all CodeForge tasks (default: `[]`)

## Release Notes

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
