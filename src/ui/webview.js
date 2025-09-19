// webview.js
(function () {
  const vscode = acquireVsCodeApi();

  // State management
  let currentState = {
    isLoading: false,
  };

  // DOM elements
  const elements = {
    terminalBtn: document.getElementById("terminal-btn"),
    fuzzingBtn: document.getElementById("fuzzing-btn"),
    loadingOverlay: document.getElementById("loading-overlay"),
    loadingText: document.getElementById("loading-text"),
  };

  // Verify all elements exist
  const missingElements = Object.entries(elements)
    .filter(([key, element]) => !element)
    .map(([key]) => key);

  if (missingElements.length > 0) {
    console.error("Missing DOM elements:", missingElements);
  }

  // Event listeners
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
    updateButtonStates();
  }


  function updateButtonStates() {
    const { isLoading } = currentState;
    // All buttons are now enabled by default (no status dependencies)

    // Update button states based on current state
    if (elements.terminalBtn) {
      elements.terminalBtn.disabled = isLoading;
      toggleLoadingState(
        elements.terminalBtn,
        isLoading && getCurrentCommand() === "launchTerminal",
      );
    }

    if (elements.fuzzingBtn) {
      elements.fuzzingBtn.disabled = isLoading;
      toggleLoadingState(
        elements.fuzzingBtn,
        isLoading && getCurrentCommand() === "runFuzzingTests",
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
      launchTerminal: "Launching terminal...",
      runFuzzingTests: "Running fuzzing tests...",
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
    originalUpdateState(newState);
    // Status-related announcements removed
  };

  // Request initial state
  console.log("Requesting initial state");
  vscode.postMessage({ type: "requestState" });

  // Initial UI update
  updateButtonStates();

  // Periodic state refresh (every 30 seconds)
  setInterval(() => {
    if (!currentState.isLoading) {
      vscode.postMessage({ type: "requestState" });
    }
  }, 30000);

  console.log("CodeForge webview initialized");
})();
