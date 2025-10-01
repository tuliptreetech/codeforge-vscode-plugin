// webview.js
(function () {
  const vscode = acquireVsCodeApi();

  // State management
  let currentState = {
    isLoading: false,
    initialization: {
      isInitialized: false,
      isLoading: false,
      lastChecked: null,
      error: null,
      missingComponents: [],
      details: {},
    },
    fuzzers: {
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
    refreshFuzzersBtn: document.getElementById("refresh-fuzzers-btn"),
    fuzzersContent: document.getElementById("fuzzers-content"),
    // Initialization elements
    initializationSection: document.getElementById("initialization-section"),
    initializeBtn: document.getElementById("initialize-btn"),
    initializationProgressSection: document.getElementById(
      "initialization-progress-section",
    ),
    initProgressSteps: document.getElementById("init-progress-steps"),
    initStatusMessage: document.getElementById("init-status-message"),
    unknownStateSection: document.getElementById("unknown-state-section"),
    actionsSection: document.getElementById("actions-section"),
    fuzzersSection: document.getElementById("fuzzers-section"),
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
  if (elements.refreshFuzzersBtn) {
    elements.refreshFuzzersBtn.addEventListener("click", () =>
      executeCommand("refreshFuzzers"),
    );
  }
  if (elements.initializeBtn) {
    elements.initializeBtn.addEventListener("click", () =>
      executeInitialization(),
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
    updateUI();
  }

  // Main UI update function
  function updateUI() {
    updateInitializationUI();
    updateButtonStates();
    updateFuzzerDisplay();
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
      refreshFuzzers: "Scanning for fuzzers...",
      viewCrash: "Opening crash file...",
      analyzeCrash: "Analyzing crash...",
      clearCrashes: "Clearing crashes...",
      initializeCodeForge: "Initializing CodeForge...",
    };
    return messages[command] || "Processing...";
  }

  // Initialize CodeForge
  function executeInitialization() {
    if (currentState.isLoading || currentState.initialization.isLoading) {
      console.log("Initialization ignored - already loading");
      return;
    }

    console.log("Starting CodeForge initialization");

    vscode.postMessage({
      type: "initializeCodeForge",
      params: {},
    });
  }

  // Update initialization UI based on state
  function updateInitializationUI() {
    const { initialization } = currentState;

    // Hide all sections initially
    hideAllSections();

    if (initialization.isLoading) {
      // Show initialization progress
      showInitializationProgress();
    } else if (initialization.isInitialized) {
      // Show main interface (Quick Actions and Crashes)
      showMainInterface();
    } else if (initialization.error && initialization.lastChecked) {
      // Show initialization button with error context
      showInitializationSection(true);
    } else if (initialization.lastChecked === null) {
      // Show unknown state while checking
      showUnknownState();
    } else {
      // Show initialization button
      showInitializationSection(false);
    }
  }

  function hideAllSections() {
    if (elements.initializationSection)
      elements.initializationSection.style.display = "none";
    if (elements.initializationProgressSection)
      elements.initializationProgressSection.style.display = "none";
    if (elements.unknownStateSection)
      elements.unknownStateSection.style.display = "none";
    if (elements.actionsSection) elements.actionsSection.style.display = "none";
    if (elements.fuzzersSection) elements.fuzzersSection.style.display = "none";
  }

  function showInitializationSection(hasError) {
    if (elements.initializationSection) {
      elements.initializationSection.style.display = "block";

      // Update description based on error state
      const description =
        elements.initializationSection.querySelector(".init-description");
      if (description) {
        if (hasError) {
          description.textContent = `Failed to initialize: ${currentState.initialization.error}. Click to retry.`;
          description.classList.add("error");
        } else {
          description.textContent =
            "Set up CodeForge in your workspace to enable fuzzing capabilities.";
          description.classList.remove("error");
        }
      }
    }
  }

  function showInitializationProgress() {
    if (elements.initializationProgressSection) {
      elements.initializationProgressSection.style.display = "block";
      updateInitializationProgress();
    }
  }

  function showUnknownState() {
    if (elements.unknownStateSection) {
      elements.unknownStateSection.style.display = "block";
    }
  }

  function showMainInterface() {
    if (elements.actionsSection)
      elements.actionsSection.style.display = "block";
    if (elements.fuzzersSection)
      elements.fuzzersSection.style.display = "block";
  }

  function updateInitializationProgress() {
    const { initialization } = currentState;

    if (!elements.initProgressSteps || !elements.initStatusMessage) return;

    // Update status message
    if (initialization.details && initialization.details.currentStep) {
      elements.initStatusMessage.textContent =
        initialization.details.currentStep;
    } else {
      elements.initStatusMessage.textContent = "Setting up your workspace...";
    }

    // Update progress steps
    const steps = [
      "Creating .codeforge directory",
      "Setting up Docker configuration",
      "Configuring fuzzing environment",
      "Finalizing setup",
    ];

    let html = "";
    const currentStepIndex = initialization.details?.stepIndex || 0;

    steps.forEach((step, index) => {
      const isCompleted = index < currentStepIndex;
      const isCurrent = index === currentStepIndex;
      const stepClass = isCompleted
        ? "completed"
        : isCurrent
          ? "current"
          : "pending";

      html += `
        <div class="progress-step ${stepClass}">
          <div class="step-indicator">
            ${isCompleted ? "✓" : isCurrent ? "⏳" : "○"}
          </div>
          <div class="step-text">${step}</div>
        </div>
      `;
    });

    elements.initProgressSteps.innerHTML = html;
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

  // Fuzzer display management
  function updateFuzzerDisplay() {
    if (!elements.fuzzersContent) return;

    const { fuzzers } = currentState;

    if (fuzzers.isLoading) {
      elements.fuzzersContent.innerHTML = `
        <div class="fuzzers-loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">Scanning for fuzzers...</div>
        </div>
      `;
      return;
    }

    if (fuzzers.error) {
      elements.fuzzersContent.innerHTML = `
        <div class="fuzzers-error">
          <div class="error-icon">⚠️</div>
          <div class="error-text">Failed to load fuzzer data</div>
          <button class="retry-btn" onclick="executeCommand('refreshFuzzers')">Retry</button>
        </div>
      `;
      return;
    }

    if (!fuzzers.data || fuzzers.data.length === 0) {
      elements.fuzzersContent.innerHTML = `
        <div class="no-fuzzers-state">
          <div class="empty-icon">🎯</div>
          <div class="empty-text">No fuzzers found</div>
          <div class="empty-subtext">Create fuzz targets to get started</div>
        </div>
      `;
      return;
    }

    // Render fuzzer data
    let html = "";
    fuzzers.data.forEach((fuzzer) => {
      html += renderFuzzerItem(fuzzer);
    });
    elements.fuzzersContent.innerHTML = html;

    // Add event listeners for fuzzer and crash actions
    addFuzzerEventListeners();
  }

  function renderFuzzerItem(fuzzer) {
    const crashCount = fuzzer.crashes.length;
    const crashText = crashCount === 1 ? "crash" : "crashes";
    // Use displayName from backend (formatted by fuzzerUtils) or fallback to name
    const displayName = fuzzer.displayName || fuzzer.name;
    const testCount = fuzzer.testCount || 0;
    const formattedTestCount = formatTestCount(testCount);

    // Render crashes as collapsible sub-items
    let crashItems = "";
    if (crashCount > 0) {
      fuzzer.crashes.forEach((crash) => {
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
                      data-file-path="${crash.filePath}" data-fuzzer-name="${fuzzer.name}" title="View crash">👁️</button>
              <button class="crash-action-btn" data-action="analyze" data-crash-id="${crash.id}"
                      data-fuzzer-name="${fuzzer.name}" data-file-path="${crash.filePath}" title="Analyze crash">🔍</button>
            </div>
          </div>
        `;
      });
    }

    const crashSection =
      crashCount > 0
        ? `
      <div class="fuzzer-crashes ${crashCount > 0 ? "has-crashes" : ""}" data-fuzzer="${fuzzer.name}">
        <div class="crashes-header">
          <span class="crashes-label">${crashCount} ${crashText}</span>
        </div>
        <div class="crash-list" id="crashes-${fuzzer.name}">
          ${crashItems}
          ${
            crashCount > 0
              ? `<div class="crash-actions-footer">
            <button class="clear-all-btn" data-fuzzer="${fuzzer.name}" title="Clear all crashes for this fuzzer">Clear All Crashes</button>
          </div>`
              : ""
          }
        </div>
      </div>
    `
        : `
      <div class="fuzzer-crashes">
        <span class="no-crashes-text">No crashes</span>
      </div>
    `;

    return `
      <div class="fuzzer-item" data-fuzzer="${fuzzer.name}">
        <div class="fuzzer-header">
          <div class="fuzzer-info">
            <span class="fuzzer-name">${displayName}</span>
            ${testCount > 0 ? `<span class="test-count" title="${testCount} test cases executed">${formattedTestCount}</span>` : ""}
          </div>
        </div>
        ${crashSection}
      </div>
    `;
  }

  function addFuzzerEventListeners() {
    // View crash buttons
    document
      .querySelectorAll('.crash-action-btn[data-action="view"]')
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const crashId = e.target.dataset.crashId;
          const filePath = e.target.dataset.filePath;
          const fuzzerName = e.target.dataset.fuzzerName;
          executeCommand("viewCrash", { crashId, filePath, fuzzerName });
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

  function formatTestCount(count) {
    if (count === 0) return "0";
    if (count < 1000) return count.toString();
    if (count < 1000000) return (count / 1000).toFixed(1) + "k";
    return (count / 1000000).toFixed(1) + "M";
  }

  // Initialize with initial state if available
  if (window.initialState) {
    currentState = { ...currentState, ...window.initialState };
  }

  // Request initial state
  console.log("Requesting initial state");
  vscode.postMessage({ type: "requestState" });

  // Initial UI update
  updateUI();

  // Auto-refresh crashes after fuzzing completes
  let lastFuzzingState = false;
  const baseUpdateState = updateState;
  updateState = function (newState) {
    const wasFuzzing = lastFuzzingState;
    const isFuzzing =
      newState.isLoading && getCurrentCommand() === "runFuzzingTests";

    baseUpdateState(newState);

    // If fuzzing just completed, refresh fuzzers
    if (wasFuzzing && !isFuzzing) {
      setTimeout(() => {
        executeCommand("refreshFuzzers");
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
