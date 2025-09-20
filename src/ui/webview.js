// webview.js
(function () {
  const vscode = acquireVsCodeApi();

  // State management
  let currentState = {
    isLoading: false,
    crashes: {
      isLoading: false,
      lastUpdated: null,
      data: [],
      error: null,
    },
  };

  // DOM elements
  const elements = {
    terminalBtn: document.getElementById("terminal-btn"),
    fuzzingBtn: document.getElementById("fuzzing-btn"),
    loadingOverlay: document.getElementById("loading-overlay"),
    loadingText: document.getElementById("loading-text"),
    refreshCrashesBtn: document.getElementById("refresh-crashes-btn"),
    crashesContent: document.getElementById("crashes-content"),
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
  if (elements.refreshCrashesBtn) {
    elements.refreshCrashesBtn.addEventListener("click", () =>
      executeCommand("refreshCrashes"),
    );
  }

  // Command execution
  function executeCommand(command, params = {}) {
    if (currentState.isLoading) {
      console.log("Command ignored - already loading");
      return;
    }

    console.log(`Executing command: ${command}`, params);
    setLoading(true, getLoadingMessage(command));

    vscode.postMessage({
      type: "command",
      command: command,
      params: params,
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
    updateCrashDisplay();
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
      refreshCrashes: "Scanning for crashes...",
      viewCrash: "Opening crash file...",
      analyzeCrash: "Analyzing crash...",
      clearCrashes: "Clearing crashes...",
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

  // Enhanced state update with announcements - removed duplicate declaration

  // Crash display management
  function updateCrashDisplay() {
    if (!elements.crashesContent) return;

    const { crashes } = currentState;

    if (crashes.isLoading) {
      elements.crashesContent.innerHTML = `
        <div class="crashes-loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">Scanning for crashes...</div>
        </div>
      `;
      return;
    }

    if (crashes.error) {
      elements.crashesContent.innerHTML = `
        <div class="crashes-error">
          <div class="error-icon">⚠️</div>
          <div class="error-text">Failed to load crash data</div>
          <button class="retry-btn" onclick="executeCommand('refreshCrashes')">Retry</button>
        </div>
      `;
      return;
    }

    if (!crashes.data || crashes.data.length === 0) {
      elements.crashesContent.innerHTML = `
        <div class="no-crashes-state">
          <div class="empty-icon">🎯</div>
          <div class="empty-text">No crashes found</div>
          <div class="empty-subtext">Run fuzzing tests to discover crashes</div>
        </div>
      `;
      return;
    }

    // Render crash data
    let html = "";
    crashes.data.forEach((fuzzerData) => {
      html += renderFuzzerGroup(fuzzerData);
    });
    elements.crashesContent.innerHTML = html;

    // Add event listeners for crash actions
    addCrashEventListeners();
  }

  function renderFuzzerGroup(fuzzerData) {
    const crashCount = fuzzerData.crashes.length;
    const crashText = crashCount === 1 ? "crash" : "crashes";

    let crashItems = "";
    fuzzerData.crashes.forEach((crash) => {
      const formattedDate = formatCrashDate(crash.createdAt);
      crashItems += `
        <div class="crash-item" data-crash-id="${crash.id}">
          <div class="crash-info">
            <span class="crash-id">${crash.id}</span>
            <span class="crash-size">${formatFileSize(crash.fileSize)}</span>
            <span class="crash-date">${formattedDate}</span>
          </div>
          <div class="crash-actions">
            <button class="crash-action-btn" data-action="view" data-crash-id="${crash.id}"
                    data-file-path="${crash.filePath}" title="View crash">👁️</button>
            <button class="crash-action-btn" data-action="analyze" data-crash-id="${crash.id}"
                    data-fuzzer-name="${crash.fuzzerName}" data-file-path="${crash.filePath}" title="Analyze crash">🔍</button>
          </div>
        </div>
      `;
    });

    return `
      <div class="fuzzer-group" data-fuzzer="${fuzzerData.fuzzerName}">
        <div class="fuzzer-header">
          <div>
            <span class="fuzzer-name">${fuzzerData.fuzzerName}</span>
            <span class="crash-count">${crashCount} ${crashText}</span>
          </div>
          <div class="fuzzer-actions">
            <button class="clear-all-btn" data-fuzzer="${fuzzerData.fuzzerName}" title="Clear all crashes for this fuzzer">Clear All</button>
          </div>
        </div>
        <div class="crash-list">
          ${crashItems}
        </div>
      </div>
    `;
  }

  function addCrashEventListeners() {
    // View crash buttons
    document
      .querySelectorAll('.crash-action-btn[data-action="view"]')
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const crashId = e.target.dataset.crashId;
          const filePath = e.target.dataset.filePath;
          executeCommand("viewCrash", { crashId, filePath });
        });
      });

    // Analyze crash buttons
    document
      .querySelectorAll('.crash-action-btn[data-action="analyze"]')
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const crashId = e.target.dataset.crashId;
          const fuzzerName = e.target.dataset.fuzzerName;
          const filePath = e.target.dataset.filePath;
          executeCommand("analyzeCrash", { crashId, fuzzerName, filePath });
        });
      });

    // Clear all buttons
    document.querySelectorAll(".clear-all-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const fuzzerName = e.target.dataset.fuzzer;
        if (
          confirm(
            `Are you sure you want to clear all crashes for ${fuzzerName}?`,
          )
        ) {
          executeCommand("clearCrashes", { fuzzerName });
        }
      });
    });
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function formatCrashDate(isoTimestamp) {
    if (!isoTimestamp) return "Unknown date";

    try {
      const date = new Date(isoTimestamp);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return "Invalid date";
      }

      // Format date in local time with user-friendly format
      // Example: "Dec 19, 2024 at 3:45 PM"
      const options = {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      };

      return date.toLocaleString("en-US", options).replace(",", " at");
    } catch (error) {
      console.warn("Failed to format crash date:", error);
      return "Invalid date";
    }
  }

  // Initialize with initial state if available
  if (window.initialState) {
    currentState = { ...currentState, ...window.initialState };
  }

  // Request initial state
  console.log("Requesting initial state");
  vscode.postMessage({ type: "requestState" });

  // Initial UI update
  updateButtonStates();
  updateCrashDisplay();

  // Auto-refresh crashes after fuzzing completes
  let lastFuzzingState = false;
  const baseUpdateState = updateState;
  updateState = function (newState) {
    const wasFuzzing = lastFuzzingState;
    const isFuzzing =
      newState.isLoading && getCurrentCommand() === "runFuzzingTests";

    baseUpdateState(newState);

    // If fuzzing just completed, refresh crashes
    if (wasFuzzing && !isFuzzing) {
      setTimeout(() => {
        executeCommand("refreshCrashes");
      }, 1000);
    }

    lastFuzzingState = isFuzzing;
  };

  // Periodic state refresh (every 30 seconds)
  setInterval(() => {
    if (!currentState.isLoading) {
      vscode.postMessage({ type: "requestState" });
    }
  }, 30000);

  console.log("CodeForge webview initialized");
})();
