#!/usr/bin/env bash

set -euo pipefail

# launch-process-in-docker.sh - Launch commands in a new CodeForge Docker container
# This script automatically detects the Docker image for the current workspace
# and runs commands in a new container with support for interactive mode and port forwarding.
# Tracks persistent containers in .codeforge/tracked-containers for lifecycle management.

scripts_directory="$(dirname "$(realpath "$0")")"
codeforge_directory="$(realpath "$scripts_directory/..")"
root_directory="$(realpath "$codeforge_directory/..")"
tracked_containers_file="$codeforge_directory/tracked-containers"

# Default values
INTERACTIVE=false
STDIN_OPEN=false
PORT_FORWARDS=()
COMMAND=""
REMOVE_AFTER_RUN=true
IMAGE_NAME=""
SHELL="/bin/bash"
ADDITIONAL_ARGS=()
MOUNT_WORKSPACE=true
CONTAINER_NAME=""
CONTAINER_TYPE="script"
ENABLE_TRACKING=true
QUIET=false

# Usage information
usage() {
    echo "Usage: $0 [options] [command]"
    echo ""
    echo "Execute commands in a new CodeForge Docker container."
    echo ""
    echo "Options:"
    echo "  -i, --interactive            Run in interactive mode (allocate TTY and keep stdin open)"
    echo "  --stdin                      Keep stdin open without allocating TTY (for VSCode terminals)"
    echo "  -p, --port HOST:CONTAINER    Forward port from host to container (can be specified multiple times)"
    echo "  -k, --keep                   Keep container after execution (default: remove)"
    echo "  -q, --quiet                  Suppress diagnostic messages"
    echo "  --image IMAGE                Use specific Docker image (default: auto-detect from workspace)"
    echo "  --shell SHELL                Shell to use for command execution (default: /bin/bash)"
    echo "  --name NAME                  Custom container name (default: auto-generated)"
    echo "  --type TYPE                  Container type for tracking (default: script)"
    echo "  --no-mount                   Don't mount workspace directory"
    echo "  --no-track                   Don't track container"
    echo "  --docker-arg ARG             Additional docker run argument (can be specified multiple times)"
    echo "  -h, --help                   Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 ls -la                                    # Run 'ls -la' in new container"
    echo "  $0 -i /bin/bash                              # Open interactive bash shell"
    echo "  $0 -p 8080:80 python3 -m http.server        # Run web server with port forwarding"
    echo "  $0 -i -p 3000:3000 npm start                 # Interactive mode with port forwarding"
    echo "  $0 -k build.sh                               # Keep container after build completes"
    echo "  $0 --image myimage:latest --shell /bin/sh ls # Use specific image and shell"
    echo "  $0 --name my_container --type build make     # Custom name and type"
    exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -i|--interactive)
            INTERACTIVE=true
            shift
            ;;
        --stdin)
            STDIN_OPEN=true
            shift
            ;;
        -p|--port)
            if [ -z "${2-}" ]; then
                echo "Error: -p/--port requires an argument (HOST:CONTAINER)"
                usage
            fi
            PORT_FORWARDS+=("$2")
            shift 2
            ;;
        -k|--keep)
            REMOVE_AFTER_RUN=false
            shift
            ;;
        -q|--quiet)
            QUIET=true
            shift
            ;;
        --image)
            if [ -z "${2-}" ]; then
                echo "Error: --image requires an argument"
                usage
            fi
            IMAGE_NAME="$2"
            shift 2
            ;;
        --shell)
            if [ -z "${2-}" ]; then
                echo "Error: --shell requires an argument"
                usage
            fi
            SHELL="$2"
            shift 2
            ;;
        --name)
            if [ -z "${2-}" ]; then
                echo "Error: --name requires an argument"
                usage
            fi
            CONTAINER_NAME="$2"
            shift 2
            ;;
        --type)
            if [ -z "${2-}" ]; then
                echo "Error: --type requires an argument"
                usage
            fi
            CONTAINER_TYPE="$2"
            shift 2
            ;;
        --no-mount)
            MOUNT_WORKSPACE=false
            shift
            ;;
        --no-track)
            ENABLE_TRACKING=false
            shift
            ;;
        --docker-arg)
            if [ -z "${2-}" ]; then
                echo "Error: --docker-arg requires an argument"
                usage
            fi
            ADDITIONAL_ARGS+=("$2")
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            # Everything else is the command to execute
            COMMAND="$*"
            break
            ;;
    esac
done

# Validate that a command was provided
if [ -z "$COMMAND" ]; then
    echo "Error: No command specified"
    usage
fi

# Generate container image name from workspace path
# This mimics the logic in dockerOperations.js generateContainerName()
generate_container_name() {
    local workspace_path="$1"

    # Remove leading slash if present
    local container_name="${workspace_path#/}"

    # Replace all slashes and backslashes with underscores
    container_name="${container_name//\//_}"
    container_name="${container_name//\\/_}"

    # Replace colons with underscores (for Windows drive letters)
    container_name="${container_name//:/_}"

    # Convert to lowercase
    container_name=$(echo "$container_name" | tr '[:upper:]' '[:lower:]')

    # Replace any remaining special characters with underscores
    container_name=$(echo "$container_name" | sed 's/[^a-z0-9_-]/_/g')

    echo "$container_name"
}

# Check if Docker image exists for this workspace
check_image_exists() {
    local image_name="$1"

    if docker image inspect "$image_name" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Track a container in the tracked-containers file
track_container() {
    local container_id="$1"
    local container_name="$2"
    local image_name="$3"
    local timestamp="$4"
    local container_type="$5"

    # Create tracked-containers file if it doesn't exist
    touch "$tracked_containers_file"

    # Get container details
    local container_info
    container_info=$(docker inspect "$container_id" --format '{{.State.Status}}' 2>/dev/null || echo "unknown")

    # Write container info as JSON-like format (one line per container)
    # Format: container_id|container_name|image_name|created_timestamp|type|status
    echo "${container_id}|${container_name}|${image_name}|${timestamp}|${container_type}|${container_info}" >> "$tracked_containers_file"
}

# Clean up stale entries from tracked-containers file
cleanup_stale_entries() {
    if [ ! -f "$tracked_containers_file" ]; then
        return
    fi

    local temp_file="${tracked_containers_file}.tmp"
    > "$temp_file"

    # Read each line and check if container still exists
    while IFS='|' read -r container_id container_name image_name timestamp type status; do
        # Skip empty lines
        if [ -z "$container_id" ]; then
            continue
        fi

        # Check if container still exists
        if docker ps -a --filter "id=${container_id}" --format "{{.ID}}" | grep -q "^${container_id}$"; then
            # Container exists, keep it
            echo "${container_id}|${container_name}|${image_name}|${timestamp}|${type}|${status}" >> "$temp_file"
        fi
    done < "$tracked_containers_file"

    # Replace the original file with the cleaned version
    mv "$temp_file" "$tracked_containers_file"
}

# Main execution
main() {
    # In interactive or stdin mode, default to quiet unless explicitly disabled
    if [ "$QUIET" = false ] && { [ "$INTERACTIVE" = true ] || [ "$STDIN_OPEN" = true ]; }; then
        QUIET=true
    fi

    # Clean up stale entries first (only if tracking is enabled)
    if [ "$ENABLE_TRACKING" = true ]; then
        cleanup_stale_entries
    fi

    # Auto-detect image name if not provided
    if [ -z "$IMAGE_NAME" ]; then
        IMAGE_NAME=$(generate_container_name "$root_directory")
    fi

    # Check if the image exists
    if ! check_image_exists "$IMAGE_NAME"; then
        echo "Error: Docker image '$IMAGE_NAME' not found" >&2
        if [ -z "$CONTAINER_NAME" ]; then
            echo "Hint: Initialize CodeForge and build the Docker image first using the extension." >&2
        fi
        exit 1
    fi

    if [ "$QUIET" = false ]; then
        echo "Using Docker image: $IMAGE_NAME" >&2
    fi

    # Generate unique container name if not provided
    if [ -z "$CONTAINER_NAME" ]; then
        TIMESTAMP=$(date +%s)
        CONTAINER_NAME="${IMAGE_NAME}_${CONTAINER_TYPE}_${TIMESTAMP}"
    fi

    # Build docker run command
    DOCKER_RUN_ARGS=("run")

    # Add container name if tracking is enabled or keeping container
    if [ "$ENABLE_TRACKING" = true ] || [ "$REMOVE_AFTER_RUN" = false ]; then
        DOCKER_RUN_ARGS+=("--name" "$CONTAINER_NAME")
    fi

    # Add interactive/TTY flags
    # Both interactive and stdin modes need -it for proper terminal functionality
    if [ "$INTERACTIVE" = true ] || [ "$STDIN_OPEN" = true ]; then
        DOCKER_RUN_ARGS+=("-i" "-t")
    fi

    # Add remove flag if requested
    if [ "$REMOVE_AFTER_RUN" = true ]; then
        DOCKER_RUN_ARGS+=("--rm")
    fi

    # Add port forwarding
    if [ ${#PORT_FORWARDS[@]} -gt 0 ]; then
        for port in "${PORT_FORWARDS[@]}"; do
            DOCKER_RUN_ARGS+=("-p" "$port")
        done
    fi

    # Add additional docker arguments
    if [ ${#ADDITIONAL_ARGS[@]} -gt 0 ]; then
        for arg in "${ADDITIONAL_ARGS[@]}"; do
            DOCKER_RUN_ARGS+=("$arg")
        done
    fi

    # Mount the workspace if requested
    if [ "$MOUNT_WORKSPACE" = true ]; then
        DOCKER_RUN_ARGS+=("-v" "$root_directory:$root_directory")
        DOCKER_RUN_ARGS+=("-w" "$root_directory")
    fi

    # Add the image name
    DOCKER_RUN_ARGS+=("$IMAGE_NAME")

    # Add the command with shell wrapper
    DOCKER_RUN_ARGS+=("$SHELL" "-c" "$COMMAND")

    # Execute the command
    if [ "$QUIET" = false ]; then
        echo "Running: docker ${DOCKER_RUN_ARGS[*]}" >&2
    fi

    # For stdin mode (VSCode terminals), we must exec docker directly
    # Otherwise the terminal won't connect properly to the container's stdin/stdout
    if [ "$STDIN_OPEN" = true ]; then
        # In stdin mode, exec docker so this script is replaced by the docker process
        # This allows VSCode terminal's stdin/stdout to connect directly to the container
        # Note: This means we can't track the container in the usual way for stdin mode
        exec docker "${DOCKER_RUN_ARGS[@]}"
    elif [ "$ENABLE_TRACKING" = true ]; then
        # For non-stdin mode with tracking, run in background so we can track it
        # Start the container
        docker "${DOCKER_RUN_ARGS[@]}" &
        DOCKER_PID=$!

        # Wait a moment for container to start
        sleep 0.5

        # Get the container ID
        CONTAINER_ID=$(docker ps -a --filter "name=${CONTAINER_NAME}" --format "{{.ID}}" | head -n 1)

        if [ -n "$CONTAINER_ID" ]; then
            # Track the container
            TIMESTAMP=$(date +%s)
            track_container "$CONTAINER_ID" "$CONTAINER_NAME" "$IMAGE_NAME" "$TIMESTAMP" "$CONTAINER_TYPE"
            if [ "$QUIET" = false ]; then
                echo "Container tracked: $CONTAINER_NAME (ID: $CONTAINER_ID)" >&2
            fi
        fi

        # Wait for the docker command to complete
        wait $DOCKER_PID
    else
        # No tracking - just exec
        exec docker "${DOCKER_RUN_ARGS[@]}"
    fi
}

main
