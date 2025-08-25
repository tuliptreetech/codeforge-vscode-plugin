# CodeForge Task Provider

The CodeForge extension includes a VSCode Task Provider that allows you to run commands inside Docker containers directly from VSCode's task system.

## Important: Task Configuration Required

**CodeForge no longer provides default tasks.** You MUST configure your own tasks in `.vscode/tasks.json` with the required `"command"` property. Each task must explicitly specify what command to run in the Docker container.

## Features

- **Seamless Integration**: Run commands in Docker containers using VSCode's built-in task system
- **Automatic Setup**: Automatically initializes and builds Docker images when needed
- **Custom Tasks**: Define your own tasks in `.vscode/tasks.json` (required)
- **Output Capture**: View command output in the CodeForge output window
- **Error Handling**: Proper error reporting and exit code handling

## How It Works

The task provider integrates with VSCode's task system to:

1. Detect when a CodeForge Docker environment is available
2. Read task definitions from `.vscode/tasks.json`
3. Execute the specified commands inside the Docker container
4. Stream output to the CodeForge output window in VSCode

## Creating Tasks (Required)

You MUST define CodeForge tasks in your project's `.vscode/tasks.json` file. Without this configuration, no tasks will be available.

### Basic Task Structure

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "codeforge",
      "label": "Your Task Name",
      "command": "command to run", // REQUIRED PROPERTY
      "detail": "Description of what this task does"
    }
  ]
}
```

### Required Property: command

The `"command"` property is **REQUIRED** for all CodeForge tasks. This specifies the exact command that will be executed inside your Docker container. Without this property, the task will fail.

Examples of valid commands:

- `"make build"` - Run a make target
- `"npm test"` - Run npm scripts
- `"python3 script.py"` - Execute Python scripts
- `"./build.sh && ./test.sh"` - Chain multiple commands
- `"cargo build --release"` - Run Rust builds
- `"go test ./..."` - Run Go tests

## Task Definition Properties

Each CodeForge task supports the following properties:

| Property         | Type          | Required | Description                                                                        |
| ---------------- | ------------- | -------- | ---------------------------------------------------------------------------------- |
| `type`           | string        | **Yes**  | Must be `"codeforge"`                                                              |
| `label`          | string        | **Yes**  | Display name for the task                                                          |
| `command`        | string        | **Yes**  | Command to run in the container - this is the actual command that will be executed |
| `detail`         | string        | No       | Additional description shown in task list                                          |
| `group`          | object        | No       | Task grouping (build, test, etc.)                                                  |
| `problemMatcher` | string/object | No       | Problem matcher for parsing output                                                 |
| `options`        | object        | No       | Additional options like working directory                                          |

## Viewing Task Output

All task output is captured and displayed in the **CodeForge output window**:

1. The output window automatically opens when a task runs
2. You can manually open it via: View → Output → Select "CodeForge" from dropdown
3. Output includes both stdout and stderr from your commands
4. Exit codes are displayed at the end of execution

## Running Tasks

There are several ways to run CodeForge tasks:

### 1. Command Palette

- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
- Type "Tasks: Run Task"
- Select a CodeForge task from the list

### 2. Keyboard Shortcuts

- Press `Ctrl+Shift+B` for the default build task
- Configure custom keybindings for specific tasks

### 3. Terminal Menu

- Go to Terminal → Run Task
- Select a CodeForge task

### 4. Task Explorer

- Open the Task Explorer in the sidebar
- Click on a CodeForge task to run it

## Complete Example: Multi-Language Project

Here's a comprehensive `.vscode/tasks.json` example showing various commands:

```json
{
  "version": "2.0.0",
  "tasks": [
    // C++ Build Task
    {
      "type": "codeforge",
      "label": "Build C++ Project",
      "command": "cmake --build build/ --config Release",
      "detail": "Builds the C++ project using CMake",
      "group": {
        "kind": "build",
        "isDefault": true
      },
      "problemMatcher": "$gcc"
    },

    // Python Test Task
    {
      "type": "codeforge",
      "label": "Run Python Tests",
      "command": "python3 -m pytest tests/ --cov=src --cov-report=html",
      "detail": "Runs Python tests with coverage report",
      "group": {
        "kind": "test",
        "isDefault": true
      }
    },

    // Node.js Development Server
    {
      "type": "codeforge",
      "label": "Start Dev Server",
      "command": "npm run dev",
      "detail": "Starts the Node.js development server"
    },

    // Database Operations
    {
      "type": "codeforge",
      "label": "Reset Database",
      "command": "dropdb myapp && createdb myapp && npm run migrate",
      "detail": "Drops, recreates, and migrates the database"
    },

    // Code Quality Check
    {
      "type": "codeforge",
      "label": "Code Quality Check",
      "command": "npm run lint && npm run format:check && npm audit",
      "detail": "Runs linting, format checking, and security audit"
    },

    // Docker Compose Operations
    {
      "type": "codeforge",
      "label": "Start Services",
      "command": "docker-compose up -d redis postgres",
      "detail": "Starts required backend services"
    },

    // Custom Script with Arguments
    {
      "type": "codeforge",
      "label": "Deploy to Staging",
      "command": "./scripts/deploy.sh --env=staging --skip-tests",
      "detail": "Deploys application to staging environment"
    }
  ]
}
```

## Advanced Usage

### Chaining Multiple Commands

You can chain multiple commands using shell operators:

```json
{
  "type": "codeforge",
  "label": "Full Build Pipeline",
  "command": "npm ci && npm run build && npm test && npm run package",
  "detail": "Install deps, build, test, and package the application"
}
```

### Using Environment Variables

Commands can use environment variables available in the container:

```json
{
  "type": "codeforge",
  "label": "Build for Production",
  "command": "NODE_ENV=production npm run build",
  "detail": "Builds with production environment settings"
}
```

### Working Directory

Specify a different working directory:

```json
{
  "type": "codeforge",
  "label": "Run Backend Tests",
  "command": "go test ./...",
  "detail": "Runs all Go tests",
  "options": {
    "cwd": "${workspaceFolder}/backend"
  }
}
```

### Problem Matchers

Configure problem matchers to parse compiler/linter output:

```json
{
  "type": "codeforge",
  "label": "Lint TypeScript",
  "command": "tsc --noEmit",
  "problemMatcher": "$tsc",
  "detail": "Type-checks TypeScript files"
}
```

## Automatic Initialization

The task provider automatically handles:

1. **Dockerfile Detection**: Checks if `.codeforge/Dockerfile` exists
2. **Image Building**: Builds the Docker image if it doesn't exist
3. **Container Management**: Handles container lifecycle based on your settings
4. **Error Recovery**: Provides clear error messages in the output window

## Configuration

The task provider respects all CodeForge configuration settings:

- `codeforge.dockerCommand`: Docker command to use (default: "docker")
- `codeforge.removeContainersAfterRun`: Auto-remove containers (default: true)
- `codeforge.defaultShell`: Shell to use for commands (default: "/bin/bash")
- `codeforge.additionalDockerRunArgs`: Extra Docker arguments
- `codeforge.mountWorkspace`: Mount workspace in container (default: true)
- `codeforge.showOutputChannel`: Auto-show output window (default: true)

## Limitations

- **No Default Tasks**: You must configure all tasks yourself
- **Interactive Tasks**: Tasks requiring interactive input should use the "Launch Terminal in Container" command instead
- **Long-Running Tasks**: Tasks that run indefinitely work but may need manual termination
- **GUI Applications**: Tasks that launch GUI applications won't work in the task system

## Troubleshooting

### No Tasks Available

- **Solution**: Create `.vscode/tasks.json` with at least one CodeForge task
- Ensure each task has the required `"command"` property
- Verify `"type": "codeforge"` is set correctly

### Task Fails with "No command specified"

- **Solution**: Add the `"command"` property to your task definition
- The command property is required and must contain the actual command to run

### Command Not Found

- Verify the command exists in the Docker container
- Check that required packages are installed in the Dockerfile
- Test the command manually using "Launch Terminal in Container" first

### Output Not Visible

- Check the CodeForge output window (View → Output → CodeForge)
- Ensure `codeforge.showOutputChannel` is set to `true`
- The output window captures all stdout and stderr from commands

### Permission Errors

- Check that your user has Docker permissions
- Verify file permissions in the mounted workspace
- Ensure the container user matches your host user

## Best Practices

1. **Always Specify Commands**: Every task must have a `"command"` property
2. **Test Commands First**: Use "Launch Terminal in Container" to test commands before adding them as tasks
3. **Use Problem Matchers**: Configure problem matchers to parse compiler/linter output
4. **Group Related Tasks**: Use task groups for better organization
5. **Add Descriptions**: Use the `detail` property to explain what tasks do
6. **Check Output Window**: Monitor the CodeForge output window for command results
7. **Keep Commands Simple**: Complex scripts should be in separate files
8. **Document Dependencies**: Note what tools/packages your commands require

## Migration from Default Tasks

If you were previously relying on default tasks, you'll need to create your own `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "codeforge",
      "label": "Build",
      "command": "make build", // Replace with your build command
      "group": {
        "kind": "build",
        "isDefault": true
      }
    },
    {
      "type": "codeforge",
      "label": "Test",
      "command": "make test", // Replace with your test command
      "group": {
        "kind": "test",
        "isDefault": true
      }
    }
  ]
}
```

## Integration with Other Extensions

CodeForge tasks work well with:

- **C/C++ Extension**: Use with CMake or Make tasks
- **Python Extension**: Run pytest or other Python tools
- **ESLint/Prettier**: Run linters and formatters
- **GitLens**: Run git commands in containers
- **Test Explorer**: Run test suites

## Examples Repository

For comprehensive examples, see the `examples/tasks.json` file in the extension repository. It contains practical examples for various programming languages and use cases.
