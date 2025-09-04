# Port Forwarding in CodeForge

## Overview

Port forwarding in CodeForge allows you to access services running inside Docker containers from your host machine. This is essential for development workflows where you need to interact with web servers, databases, APIs, or other network services running in containerized environments.

## How It Works

When CodeForge runs a task in a Docker container, it automatically configures port mappings based on:

1. Task-specific port configurations (highest priority)
2. Global default port mappings (fallback)
3. Docker's standard port mapping syntax

The extension adds the appropriate `-p` flags to the `docker run` command, creating a bridge between container ports and host ports.

## Configuration Methods

### 1. Task-Specific Port Configuration

Define ports directly in your task definition in `.vscode/tasks.json`:

```json
{
  "type": "codeforge",
  "label": "Run Web Server",
  "command": "npm start",
  "ports": [
    "3000:3000", // Maps container port 3000 to host port 3000
    "9229:9229" // Maps debugger port
  ]
}
```

### 2. Global Default Port Mappings

Configure default ports for all CodeForge tasks in your VSCode settings:

**User Settings (applies to all projects):**

```json
{
  "codeforge.defaultPortMappings": ["8080:8080", "3000:3000", "5432:5432"]
}
```

**Workspace Settings (project-specific):**
Create `.vscode/settings.json` in your project:

```json
{
  "codeforge.defaultPortMappings": [
    "4200:4200", // Angular dev server
    "4000:4000" // Custom API server
  ]
}
```

## Port Mapping Syntax

CodeForge supports Docker's standard port mapping formats:

| Format                      | Description                              | Example                 |
| --------------------------- | ---------------------------------------- | ----------------------- |
| `"host:container"`          | Map specific host port to container port | `"8080:3000"`           |
| `"container"`               | Map container port to same host port     | `"3000"`                |
| `"ip:host:container"`       | Bind to specific IP address              | `"127.0.0.1:8080:8080"` |
| `"host:container/protocol"` | Specify protocol (tcp/udp)               | `"8080:8080/tcp"`       |

## Common Use Cases

### Web Development Server

```json
{
  "type": "codeforge",
  "label": "React Development Server",
  "command": "npm start",
  "ports": [
    "3000:3000", // React dev server
    "3001:3001" // React error overlay
  ],
  "detail": "Start React development server with hot reload"
}
```

### Database Access

```json
{
  "type": "codeforge",
  "label": "PostgreSQL Database",
  "command": "postgres",
  "ports": ["5432:5432"],
  "detail": "Run PostgreSQL database server"
}
```

### Multiple Services (Microservices)

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "codeforge",
      "label": "Frontend Service",
      "command": "npm run frontend",
      "ports": ["3000:3000"]
    },
    {
      "type": "codeforge",
      "label": "API Service",
      "command": "npm run api",
      "ports": ["4000:4000"]
    },
    {
      "type": "codeforge",
      "label": "Admin Panel",
      "command": "npm run admin",
      "ports": ["5000:5000"]
    }
  ]
}
```

### Node.js Debugging

```json
{
  "type": "codeforge",
  "label": "Debug Node.js App",
  "command": "node --inspect=0.0.0.0:9229 app.js",
  "ports": [
    "3000:3000", // Application port
    "9229:9229" // Node.js debugger port
  ],
  "detail": "Run Node.js with debugging enabled"
}
```

### Python Development

```json
{
  "type": "codeforge",
  "label": "Django Development Server",
  "command": "python manage.py runserver 0.0.0.0:8000",
  "ports": ["8000:8000"],
  "detail": "Run Django development server"
}
```

### Docker-in-Docker Scenarios

```json
{
  "type": "codeforge",
  "label": "Run Nested Container",
  "command": "docker run -p 8080:80 nginx",
  "ports": ["8080:8080"],
  "detail": "Run nginx in a nested container"
}
```

## Advanced Examples

### Development Environment with Multiple Services

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "codeforge",
      "label": "Full Stack Development",
      "command": "npm run dev:all",
      "ports": [
        "3000:3000", // Frontend
        "4000:4000", // Backend API
        "5432:5432", // PostgreSQL
        "6379:6379", // Redis
        "9229:9229" // Node debugger
      ],
      "detail": "Start all development services"
    }
  ]
}
```

### API Testing with Different Environments

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "codeforge",
      "label": "API - Development",
      "command": "npm run api:dev",
      "ports": ["3000:3000"],
      "detail": "API server in development mode"
    },
    {
      "type": "codeforge",
      "label": "API - Production Build",
      "command": "npm run api:prod",
      "ports": ["8080:8080"],
      "detail": "API server in production mode"
    },
    {
      "type": "codeforge",
      "label": "API - Test Suite",
      "command": "npm test",
      "ports": ["3001:3001"],
      "detail": "Run API tests with test server"
    }
  ]
}
```

### Jupyter Notebook

```json
{
  "type": "codeforge",
  "label": "Jupyter Notebook",
  "command": "jupyter notebook --ip=0.0.0.0 --port=8888 --no-browser --allow-root",
  "ports": ["8888:8888"],
  "detail": "Start Jupyter Notebook server"
}
```

## Priority and Override Behavior

1. **Task-specific ports** (highest priority): Ports defined in the task's `ports` property
2. **Global defaults** (fallback): Ports defined in `codeforge.defaultPortMappings`
3. **No duplication**: If a task defines ports, global defaults are completely overridden

Example:

```json
// Global setting
{
  "codeforge.defaultPortMappings": ["8080:8080", "3000:3000"]
}

// Task definition
{
  "type": "codeforge",
  "label": "Custom Server",
  "command": "npm start",
  "ports": ["4000:4000"]  // Only 4000 will be forwarded, not 8080 or 3000
}
```

## Troubleshooting

### Port Already in Use

**Problem:** Error message "bind: address already in use"

**Solutions:**

1. Check if another process is using the port:

   ```bash
   # Linux/Mac
   lsof -i :3000

   # Windows
   netstat -ano | findstr :3000
   ```

2. Use a different host port:

   ```json
   {
     "ports": ["3001:3000"] // Map container 3000 to host 3001
   }
   ```

3. Stop the conflicting process or container

### Cannot Access Service

**Problem:** Service runs in container but isn't accessible from host

**Common Causes and Solutions:**

1. **Service binding to localhost:**
   - Ensure service binds to `0.0.0.0` not `127.0.0.1`
   - Example: `npm start -- --host 0.0.0.0`

2. **Firewall blocking ports:**
   - Check firewall settings
   - Add exception for Docker

3. **Wrong port configuration:**
   - Verify port numbers match service configuration
   - Check both container and host ports

### Port Forwarding Not Working

**Problem:** Ports configured but not forwarded

**Checklist:**

1. Verify task type is `"codeforge"`
2. Check JSON syntax in tasks.json
3. Ensure ports array is properly formatted
4. Look for typos in port numbers
5. Check CodeForge output channel for errors

### Debugging Port Issues

Enable verbose logging to see actual Docker commands:

1. Open CodeForge output channel: View → Output → Select "CodeForge"
2. Check the generated `docker run` command
3. Verify `-p` flags are present and correct

Example output:

```
Executing: docker run -p 3000:3000 -p 9229:9229 ...
```

## Best Practices

### 1. Use Consistent Port Numbers

Maintain consistency between development and production:

```json
{
  "ports": ["3000:3000"] // Same port inside and outside
}
```

### 2. Document Port Usage

Add comments to explain port purposes:

```json
{
  "ports": [
    "3000:3000", // Main application
    "3001:3001", // WebSocket server
    "9229:9229" // Node.js debugger
  ]
}
```

### 3. Group Related Ports

Organize ports logically in tasks:

```json
{
  "ports": [
    // Application ports
    "3000:3000",
    "3001:3001",

    // Database ports
    "5432:5432",
    "6379:6379",

    // Debug/monitoring
    "9229:9229",
    "9090:9090"
  ]
}
```

### 4. Use Workspace Settings for Project-Specific Ports

Keep project-specific port configurations in `.vscode/settings.json`:

```json
{
  "codeforge.defaultPortMappings": ["3000:3000", "4000:4000"]
}
```

### 5. Consider Security

- Bind to `127.0.0.1` for local-only access:

  ```json
  {
    "ports": ["127.0.0.1:8080:8080"]
  }
  ```

- Use different ports for production:
  ```json
  {
    "ports": ["8080:3000"] // Internal port 3000, external 8080
  }
  ```

## Integration with VSCode Features

### Debugging

CodeForge port forwarding works seamlessly with VSCode's debugging features:

1. Forward debug ports in your task
2. Configure launch.json to connect to forwarded ports
3. Use VSCode's built-in debugger

Example launch.json:

```json
{
  "type": "node",
  "request": "attach",
  "name": "Attach to Container",
  "port": 9229,
  "address": "localhost",
  "localRoot": "${workspaceFolder}",
  "remoteRoot": "/workspace"
}
```

### Terminal Integration

Forwarded ports are accessible from VSCode's integrated terminal:

```bash
# Test forwarded port
curl http://localhost:3000

# Check port status
netstat -an | grep 3000
```

### Preview Features

Use forwarded ports with VSCode's preview features:

- Simple Browser extension
- Live Server extension
- REST Client extension

## Related Documentation

- [Task Provider Documentation](TASK_PROVIDER.md) - Complete guide to CodeForge tasks
- [VSCode Tasks Documentation](https://code.visualstudio.com/docs/editor/tasks) - Official VSCode tasks guide
- [Docker Port Documentation](https://docs.docker.com/config/containers/container-networking/) - Docker networking details

## Support

For issues or questions about port forwarding:

1. Check the troubleshooting section above
2. Review the CodeForge output channel for errors
3. Submit an issue on the [GitHub repository](https://github.com/tuliptreetech/codeforge/issues)
