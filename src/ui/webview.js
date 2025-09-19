// webview.js
(function () {
  const vscode = acquireVsCodeApi();

  // State management
  let currentState = {
    isInitialized: false,
    isBuilt: false,
    containerCount: 0,
    isLoading: false,
  };

  // DOM elements
  const elements = {
    initializeBtn: document.getElementById("initialize-btn"),
    buildBtn: document.getElementById("build-btn"),
    terminalBtn: document.getElementById("terminal-btn"),
    fuzzingBtn: document.getElementById("fuzzing-btn"),
    listContainersBtn: document.getElementById("list-containers-btn"),
    runCommandBtn: document.getElementById("run-command-btn"),
    terminateAllBtn: document.getElementById("terminate-all-btn"),
    cleanupBtn: document.getElementById("cleanup-btn"),
    loadingOverlay: document.getElementById("loading-overlay"),
    loadingText: document.getElementById("loading-text"),
    codeforgeStatus: document.getElementById("codeforge-status"),
    dockerStatus: document.getElementById("docker-status"),
    containerCount: document.getElementById("container-count"),
  };

  // Verify all elements exist
  const missingElements = Object.entries(elements)
    .filter(([key, element]) => !element)
    .map(([key]) => key);

  if (missingElements.length > 0) {
    console.error("Missing DOM elements:", missingElements);
  }

  // Event listeners
  if (elements.initializeBtn) {
    elements.initializeBtn.addEventListener("click", () =>
      executeCommand("initialize"),
    );
  }
  if (elements.buildBtn) {
    elements.buildBtn.addEventListener("click", () =>
      executeCommand("buildEnvironment"),
    );
  }
  if (elements.terminalBtn) {
    elements.terminalBtn.addEventListener("click", () =>
      executeCommand("launchTerminal"),
    );
  }
  if (elements.fuzzingBtn) {
    elements.fuzzingBtn.addEventListener("click", () =>
      executeCommand("runFuzzingTests"),
    );
  }
  if (elements.listContainersBtn) {
    elements.listContainersBtn.addEventListener("click", () =>
      executeCommand("listContainers"),
    );
  }
  if (elements.runCommandBtn) {
    elements.runCommandBtn.addEventListener("click", () =>
      executeCommand("runCommand"),
    );
  }
  if (elements.terminateAllBtn) {
    elements.terminateAllBtn.addEventListener("click", () =>
      executeCommand("terminateAllContainers"),
    );
  }
  if (elements.cleanupBtn) {
    elements.cleanupBtn.addEventListener("click", () =>
      executeCommand("cleanupOrphaned"),
    );
  }

  // Command execution
  function executeCommand(command) {
    if (currentState.isLoading) {
      console.log("Command ignored - already loading");
      return;
    }

    console.log(`Executing command: ${command}`);
    setLoading(true, getLoadingMessage(command));

    vscode.postMessage({
      type: "command",
      command: command,
    });
  }

  // Loading state management
  function setLoading(loading, message = "Processing...") {
    currentState.isLoading = loading;

    if (elements.loadingOverlay) {
      elements.loadingOverlay.style.display = loading ? "flex" : "none";
    }

    if (elements.loadingText) {
      elements.loadingText.textContent = message;
    }

    updateButtonStates();
  }

  // Update UI state
  function updateState(newState) {
    console.log("Updating state:", newState);
    currentState = { ...currentState, ...newState };
    updateStatusDisplay();
    updateButtonStates();
  }

  function updateStatusDisplay() {
    if (elements.codeforgeStatus) {
      const status = currentState.isInitialized
        ? "Initialized"
        : "Not Initialized";
      elements.codeforgeStatus.textContent = status;
      elements.codeforgeStatus.className =
        "status-value " + (currentState.isInitialized ? "success" : "");
    }

    if (elements.dockerStatus) {
      const status = currentState.isBuilt ? "Built" : "Not Built";
      elements.dockerStatus.textContent = status;
      elements.dockerStatus.className =
        "status-value " + (currentState.isBuilt ? "success" : "");
    }

    if (elements.containerCount) {
      elements.containerCount.textContent =
        currentState.containerCount.toString();
      elements.containerCount.className =
        "status-value " + (currentState.containerCount > 0 ? "success" : "");
    }
  }

  function updateButtonStates() {
    const { isInitialized, isBuilt, isLoading } = currentState;

    // Update button states based on current state
    if (elements.initializeBtn) {
      elements.initializeBtn.disabled = isLoading;
      toggleLoadingState(
        elements.initializeBtn,
        isLoading && getCurrentCommand() === "initialize",
      );
    }

    if (elements.buildBtn) {
      elements.buildBtn.disabled = !isInitialized || isLoading;
      toggleLoadingState(
        elements.buildBtn,
        isLoading && getCurrentCommand() === "buildEnvironment",
      );
    }

    if (elements.terminalBtn) {
      elements.terminalBtn.disabled = !isBuilt || isLoading;
      toggleLoadingState(
        elements.terminalBtn,
        isLoading && getCurrentCommand() === "launchTerminal",
      );
    }

    if (elements.fuzzingBtn) {
      elements.fuzzingBtn.disabled = !isBuilt || isLoading;
      toggleLoadingState(
        elements.fuzzingBtn,
        isLoading && getCurrentCommand() === "runFuzzingTests",
      );
    }

    if (elements.runCommandBtn) {
      elements.runCommandBtn.disabled = !isBuilt || isLoading;
      toggleLoadingState(
        elements.runCommandBtn,
        isLoading && getCurrentCommand() === "runCommand",
      );
    }

    if (elements.listContainersBtn) {
      elements.listContainersBtn.disabled = isLoading;
      toggleLoadingState(
        elements.listContainersBtn,
        isLoading && getCurrentCommand() === "listContainers",
      );
    }

    if (elements.terminateAllBtn) {
      elements.terminateAllBtn.disabled = isLoading;
      toggleLoadingState(
        elements.terminateAllBtn,
        isLoading && getCurrentCommand() === "terminateAllContainers",
      );
    }

    if (elements.cleanupBtn) {
      elements.cleanupBtn.disabled = isLoading;
      toggleLoadingState(
        elements.cleanupBtn,
        isLoading && getCurrentCommand() === "cleanupOrphaned",
      );
    }
  }

  function toggleLoadingState(button, isLoading) {
    if (isLoading) {
      button.classList.add("loading");
    } else {
      button.classList.remove("loading");
    }
  }

  let currentCommand = null;
  function getCurrentCommand() {
    return currentCommand;
  }

  function getLoadingMessage(command) {
    currentCommand = command;
    const messages = {
      initialize: "Initializing CodeForge...",
      buildEnvironment: "Building Docker environment...",
      launchTerminal: "Launching terminal...",
      runFuzzingTests: "Running fuzzing tests...",
      listContainers: "Listing containers...",
      runCommand: "Running command...",
      terminateAllContainers: "Terminating containers...",
      cleanupOrphaned: "Cleaning up...",
    };
    return messages[command] || "Processing...";
  }

  // Message handling from extension
  window.addEventListener("message", (event) => {
    const message = event.data;
    console.log("Received message:", message);

    switch (message.type) {
      case "stateUpdate":
        updateState(message.state);
        break;
      case "commandComplete":
        currentCommand = null;
        setLoading(false);
        if (message.success) {
          console.log(`Command ${message.command} completed successfully`);
          // Refresh state after successful command
          setTimeout(() => {
            vscode.postMessage({ type: "requestState" });
          }, 500);
        } else {
          console.error(`Command ${message.command} failed:`, message.error);
        }
        break;
      case "error":
        currentCommand = null;
        setLoading(false);
        console.error("Extension error:", message.message);
        break;
      default:
        console.warn("Unknown message type:", message.type);
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (event) => {
    // Ctrl/Cmd + Enter to initialize
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      if (!currentState.isInitialized && !currentState.isLoading) {
        executeCommand("initialize");
      }
      event.preventDefault();
    }

    // Escape to cancel loading (if possible)
    if (event.key === "Escape" && currentState.isLoading) {
      // Note: We can't actually cancel commands, but we can hide the loading state
      console.log(
        "Escape pressed during loading - command may still be running",
      );
    }
  });

  // Accessibility improvements
  function announceStateChange(message) {
    // Create a live region for screen readers
    const announcement = document.createElement("div");
    announcement.setAttribute("aria-live", "polite");
    announcement.setAttribute("aria-atomic", "true");
    announcement.style.position = "absolute";
    announcement.style.left = "-10000px";
    announcement.style.width = "1px";
    announcement.style.height = "1px";
    announcement.style.overflow = "hidden";
    announcement.textContent = message;

    document.body.appendChild(announcement);

    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  // Enhanced state update with announcements
  const originalUpdateState = updateState;
  updateState = function (newState) {
    const wasInitialized = currentState.isInitialized;
    const wasBuilt = currentState.isBuilt;
    const oldContainerCount = currentState.containerCount;

    originalUpdateState(newState);

    // Announce important state changes
    if (!wasInitialized && currentState.isInitialized) {
      announceStateChange("CodeForge has been initialized");
    }
    if (!wasBuilt && currentState.isBuilt) {
      announceStateChange("Docker environment has been built");
    }
    if (oldContainerCount !== currentState.containerCount) {
      announceStateChange(
        `Container count changed to ${currentState.containerCount}`,
      );
    }
  };

  // Request initial state
  console.log("Requesting initial state");
  vscode.postMessage({ type: "requestState" });

  // Initial UI update
  updateStatusDisplay();
  updateButtonStates();

  // Periodic state refresh (every 30 seconds)
  setInterval(() => {
    if (!currentState.isLoading) {
      vscode.postMessage({ type: "requestState" });
    }
  }, 30000);

  console.log("CodeForge webview initialized");
})();
