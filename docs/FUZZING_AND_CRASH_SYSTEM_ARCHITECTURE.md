# CodeForge Fuzzing and Crash Discovery System - Complete Flow Analysis

## Overview

This document traces the complete flow from fuzzing execution through crash detection to activity bar UI display. The system uses a multi-layered approach with Docker-based execution, file-based crash discovery, and real-time UI updates.

---

## 1. FUZZING EXECUTION FLOW

### 1.1 Entry Point: `handleRunFuzzing()` (commandHandlers.js:287-331)

**Location**: `/home/ms/codeforge-vscode-plugin/src/ui/commandHandlers.js:287`

```javascript
async handleRunFuzzing() {
  1. Get workspace path: workspacePath
  2. Generate container name: containerName
  3. Ensure project is initialized and Docker image is built
  4. Create CodeForgeFuzzingTerminal instance
  5. Create VSCode terminal with custom PTY
  6. Show terminal to user
}
```

**Key Steps**:

- Validates initialization status
- Validates Docker image exists
- Creates a custom terminal implementation (PTY) for fuzzing

### 1.2 Fuzzing Terminal Execution (fuzzingTerminal.js:33-150)

**Location**: `/home/ms/codeforge-vscode-plugin/src/fuzzing/fuzzingTerminal.js:33`

**Flow**:

```
1. Terminal opens (open() method)
   ↓
2. Check Dockerfile exists in .codeforge/
   ↓
3. Check Docker image exists
   ↓
4. Import fuzzingOperations module
   ↓
5. Call orchestrateFuzzingWorkflow() or runSpecificFuzzer()
```

### 1.3 Main Orchestrator: `orchestrateFuzzingWorkflow()` (fuzzingOperations.js:838-967)

**Location**: `/home/ms/codeforge-vscode-plugin/src/fuzzing/fuzzingOperations.js:838`

**Workflow Stages**:

```
Stage 1: Discovery (10% progress)
├─ Create fuzzing directory (.codeforge/fuzzing)
└─ Discover fuzz tests using cmakePresetDiscovery.discoverFuzzTestsWithScript()
   Output: Array of {preset, fuzzer} objects

Stage 2: Build (30% → 70% progress)
├─ Call buildFuzzTestsWithScript()
│  ├─ Execute: .codeforge/scripts/build-fuzz-tests.sh "preset:fuzzer ..."
│  ├─ Stream stdout/stderr to terminal in real-time
│  └─ Parse output for "[+] built fuzzer:" patterns
├─ Collect build results (builtTargets, errors, builtFuzzers)
└─ Display formatted build summary

Stage 3: Execution (70% → 85% progress)
├─ Call runFuzzTestsWithScript()
│  ├─ Execute: .codeforge/scripts/run-fuzz-tests.sh "preset:fuzzer ..."
│  ├─ Stream stdout/stderr to terminal in real-time
│  └─ Parse output for crash patterns:
│     - "[+] running fuzzer: <path>" → execution count
│     - "[+] Found crash file: <path>" → crash detection
│     - "[+] fuzzer <path> encountered errors!" → errors
├─ Collect execution results (executed, crashes, errors)
└─ Return crash data immediately

Stage 4: Completion (85% → 100% progress)
├─ Generate summary report
├─ Display completion message
└─ Mark terminal as complete (fuzzingComplete = true)
```

### 1.4 Crash Detection During Execution

**Location**: `fuzzingOperations.js:659-681`

During `parseScriptExecutionResults()`, crashes are parsed from script output:

```javascript
// Parse: "[+] Found crash file: .codeforge/fuzzing/example-output/corpus/crash-abc123"
const crashMatch = line.match(/\[\+\] Found crash file: (.+)/);
if (crashMatch) {
  const crashFile = crashMatch[1].trim();
  // Extract fuzzer name from path (e.g., "example" from "example-output")
  const fuzzerName = pathParts[i].replace("-output", "");
  results.crashes.push({
    fuzzer: fuzzerName,
    file: crashFile,
    relativePath: crashFile.split("/").slice(-2).join("/"),
  });
}
```

**Crash File Structure**:

```
.codeforge/fuzzing/
├── {FUZZER_NAME}-output/
│   ├── corpus/
│   │   ├── crash-{HASH1}
│   │   ├── crash-{HASH2}
│   │   └── ...
│   └── test-count.txt
```

---

## 2. CRASH DISCOVERY SERVICE

### 2.1 Service Architecture (crashDiscoveryService.js)

**Location**: `/home/ms/codeforge-vscode-plugin/src/fuzzing/crashDiscoveryService.js`

**Primary Method**: `discoverCrashes(workspacePath, imageName)`

```
discoverCrashes()
├─ Check if .codeforge/fuzzing directory exists
├─ Execute find-crashes.sh script in Docker container
│  └─ Command: .codeforge/scripts/find-crashes.sh
├─ Parse script output for: "fuzzer_name/crash_hash" format
├─ For each crash:
│  ├─ Build crash file path (check corpus/ first, fallback to root)
│  ├─ Get file stats (size, birthtime)
│  └─ Build detailed crash info object
├─ Group crashes by fuzzer name
├─ Sort crashes by creation time (newest first)
└─ Return array of {fuzzerName, crashes[], outputDir, lastScan}
```

### 2.2 Crash Info Object Structure

**Created in**: `buildCrashInfo()` method (crashDiscoveryService.js:233)

```javascript
{
  id: string,              // First 9 chars of hash (short ID for UI)
  fullHash: string,        // Complete crash hash
  fileName: string,        // crash-{HASH}
  filePath: string,        // Absolute path to crash file
  fileSize: number,        // Size in bytes
  createdAt: ISO8601,      // Crash creation timestamp
  fuzzerName: string       // Associated fuzzer
}
```

**Example**:

```json
{
  "id": "abc12345",
  "fullHash": "abc123456789def",
  "fileName": "crash-abc123456789def",
  "filePath": "/home/user/project/.codeforge/fuzzing/example-output/corpus/crash-abc123456789def",
  "fileSize": 1024,
  "createdAt": "2025-11-07T10:30:45.000Z",
  "fuzzerName": "example"
}
```

---

## 3. FUZZER DISCOVERY SERVICE WITH CRASH INTEGRATION

### 3.1 Main Discovery Method (fuzzerDiscoveryService.js:42-99)

**Location**: `/home/ms/codeforge-vscode-plugin/src/fuzzing/fuzzerDiscoveryService.js`

**Flow**:

```
discoverFuzzers(workspacePath, imageName)
├─ Check cache validity (30-second timeout)
├─ If valid cache exists, return cached data
├─ Otherwise:
│  ├─ Execute find-fuzz-tests.sh script
│  │  └─ Parses output: "preset:fuzzer_name" format
│  │
│  ├─ Call crashDiscoveryService.discoverCrashes()
│  │  └─ Gets all crashes grouped by fuzzer
│  │
│  ├─ buildFuzzerObjects() for each fuzzer:
│  │  ├─ Get associated crashes via associateCrashesWithFuzzers()
│  │  ├─ Get output directory path
│  │  ├─ Get test count from test-count.txt
│  │  └─ Create fuzzer object with status
│  │
│  ├─ Add displayName formatting
│  ├─ Update cache (30-second TTL)
│  └─ Return complete fuzzer objects with crashes
```

### 3.2 Fuzzer Object Structure (After Discovery)

**Created in**: `buildFuzzerObjects()` (fuzzerDiscoveryService.js:212)

```javascript
{
  name: string,                      // Fuzzer name (e.g., "example")
  preset: string,                    // CMake preset (e.g., "Debug")
  crashes: CrashInfo[],              // Associated crash objects
  lastUpdated: Date,                 // Last discovery timestamp
  outputDir: string,                 // .codeforge/fuzzing/example-output
  testCount: number,                 // Number of test cases executed
  displayName: string                // Formatted name (e.g., "Example Fuzz")
}
```

### 3.3 Crash Association Algorithm (fuzzerDiscoveryService.js:275-289)

```javascript
associateCrashesWithFuzzers(fuzzerName, crashData) {
  // crashData is from CrashDiscoveryService: [{fuzzerName, crashes[]}, ...]

  for (const fuzzerCrashData of crashData) {
    if (fuzzerCrashData.fuzzerName === fuzzerName) {
      associatedCrashes.push(...fuzzerCrashData.crashes);
    }
  }

  // Sort by creation time (newest first)
  return associatedCrashes.sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}
```

### 3.4 Cache Management

**Cache Properties**:

- Duration: 30 seconds (defined at fuzzerDiscoveryService.js:33)
- Stored in: `cachedFuzzers` Map
- Timestamp: `cacheTimestamp`

**Cache Methods**:

```javascript
isCacheValid(); // Check if cache is still valid
updateCache(fuzzers); // Update cache with new data
invalidateCache(); // Clear cache
refreshFuzzerData(); // Bypass cache, discover fresh data
```

---

## 4. ACTIVITY BAR UI UPDATE FLOW

### 4.1 Webview Provider Initialization (webviewProvider.js:72-99)

**Location**: `/home/ms/codeforge-vscode-plugin/src/ui/webviewProvider.js`

**Initial State Management**:

```
resolveWebviewView()
├─ Create webview with HTML/CSS/JS
├─ Set initial state object: {isLoading, initialization, fuzzers}
├─ Register message handler: _handleMessage()
├─ Check initialization status: _checkInitializationStatus()
├─ Perform initial fuzzer discovery: _performInitialFuzzerDiscovery()
│  └─ Silently skips if:
│     - No workspace open
│     - .codeforge directory doesn't exist
│     - Project not initialized
│     - Docker image not built
└─ Send stateUpdate message to webview
```

### 4.2 Initial Fuzzer Discovery (webviewProvider.js:438-494)

**Location**: `/home/ms/codeforge-vscode-plugin/src/ui/webviewProvider.js:438`

```
_performInitialFuzzerDiscovery()
├─ Validate prerequisites:
│  ├─ Workspace folder exists
│  ├─ .codeforge directory exists
│  ├─ Project is initialized
│  └─ Docker image exists
├─ Set loading state: _setFuzzerLoading(true)
├─ Discover fuzzers: fuzzerDiscoveryService.discoverFuzzers()
│  └─ Returns fuzzer array with crashes
├─ Update state: _updateFuzzerState()
│  ├─ Set isLoading = false
│  ├─ Set data = fuzzer array
│  ├─ Set lastUpdated = now
│  └─ Set error = null
├─ Send stateUpdate message to webview
└─ Handle errors gracefully (no user notification)
```

### 4.3 State Update Messages (webviewProvider.js:193-234)

**Format**:

```javascript
{
  type: "stateUpdate",
  state: {
    isLoading: boolean,
    initialization: {
      isInitialized: boolean,
      isLoading: boolean,
      lastChecked: ISO8601,
      error: string | null,
      missingComponents: string[],
      details: object
    },
    fuzzers: {
      isLoading: boolean,
      lastUpdated: ISO8601,
      data: FuzzerObject[],       // Array of fuzzer objects with crashes
      error: string | null
    }
  }
}
```

---

## 5. REFRESH BUTTON BEHAVIOR

### 5.1 Refresh Button Handler (webview.js:66-68)

**Location**: `/home/ms/codeforge-vscode-plugin/src/ui/webview.js:66`

```javascript
if (elements.refreshFuzzersBtn) {
  elements.refreshFuzzersBtn.addEventListener("click", () =>
    executeCommand("refreshFuzzers"),
  );
}
```

### 5.2 Refresh Command Handler (commandHandlers.js:751-820)

**Location**: `/home/ms/codeforge-vscode-plugin/src/ui/commandHandlers.js:751`

**Flow**:

```
handleRefreshFuzzers()
├─ Get workspace path
├─ Check initialization status (NO prompt if not initialized)
│  └─ Silently skip if not initialized
├─ Check Docker image exists (NO prompt if not built)
│  └─ Silently skip if not built
├─ Set loading state: webviewProvider._setFuzzerLoading(true)
├─ Call fuzzerDiscoveryService.refreshFuzzerData()
│  ├─ Invalidate cache (force fresh discovery)
│  └─ Call discoverFuzzers() with fresh data
├─ Update webview state with:
│  ├─ data: fuzzerData (fresh discovery)
│  ├─ lastUpdated: current timestamp
│  ├─ isLoading: false
│  └─ error: null
├─ Calculate total crashes
└─ Log results to output channel
```

### 5.3 Refresh Data Method (fuzzerDiscoveryService.js:330-364)

```javascript
refreshFuzzerData(workspacePath, containerName, fuzzerName = null)
├─ If fuzzerName provided:
│  ├─ Get cached fuzzer
│  ├─ Discover crashes for that fuzzer only
│  └─ Update specific fuzzer in cache
├─ Otherwise:
│  ├─ Invalidate entire cache
│  └─ Call discoverFuzzers() for full refresh
├─ Return updated fuzzer array
```

---

## 6. WEBVIEW UI RENDERING

### 6.1 State to UI Mapping (webview.js:109-148)

**Main Update Flow**:

```
updateState(newState)
├─ Deep merge nested objects (fuzzers, initialization)
├─ Update currentState object
└─ Call updateUI()
   ├─ updateInitializationUI()
   ├─ updateButtonStates()
   └─ updateFuzzerDisplay()
```

### 6.2 Fuzzer Display Rendering (webview.js:405-456)

**Location**: `/home/ms/codeforge-vscode-plugin/src/ui/webview.js:405`

**Rendering States**:

```
if (fuzzers.isLoading)
  └─ Show loading spinner with "Scanning for fuzzers..."

else if (fuzzers.error)
  └─ Show error state with "Retry" button

else if (!fuzzers.data || fuzzers.data.length === 0)
  └─ Show empty state: "No fuzzers found"

else
  └─ For each fuzzer:
     ├─ Render fuzzer-item
     │  ├─ Fuzzer name (displayName)
     │  ├─ Test count badge (if testCount > 0)
     │  └─ Fuzzer action buttons:
     │     ├─ ▶️ Run fuzzer
     │     ├─ 🔄 Reevaluate crashes
     │     └─ 📁 View corpus
     │
     ├─ If crashes > 0:
     │  ├─ Render crashes-header: "{count} crash(es)"
     │  └─ For each crash:
     │     ├─ Render crash-item with:
     │     │  ├─ Crash ID (first 9 chars)
     │     │  ├─ File size (formatted)
     │     │  └─ Creation date (localized)
     │     │
     │     └─ Crash action buttons:
     │        ├─ 👁️ View crash (hex viewer)
     │        ├─ 🔍 Analyze crash (GDB)
     │        └─ 🐛 Debug crash (GDB server)
     │
     │  └─ Clear All Crashes button
     │
     └─ If no crashes:
        └─ Show "No crashes" text
```

### 6.3 Crash Action Handlers (webview.js:534-608)

**View Crash** (👁️):

```
→ executeCommand("viewCrash", {crashId, filePath, fuzzerName})
→ handleViewCrash() in commandHandlers
→ Opens hex viewer for crash file
```

**Analyze Crash** (🔍):

```
→ executeCommand("analyzeCrash", {crashId, fuzzerName, filePath})
→ handleAnalyzeCrash() in commandHandlers
→ Runs GDB in Docker container
```

**Debug Crash** (🐛):

```
→ executeCommand("debugCrash", {crashId, fuzzerName, filePath})
→ handleDebugCrash() in commandHandlers
→ Launches GDB server for remote debugging
```

**Clear All Crashes**:

```
→ executeCommand("clearCrashes", {fuzzerName})
→ handleClearCrashes() in commandHandlers
→ Executes clear-crashes.sh script
→ Calls handleRefreshFuzzers() for UI update
```

---

## 7. AUTO-REFRESH MECHANISMS

### 7.1 Post-Fuzzing Auto-Refresh (webview.js:666-684)

**Location**: `/home/ms/codeforge-vscode-plugin/src/ui/webview.js:666`

```javascript
// Monitor for fuzzing completion
let lastFuzzingState = false;
const baseUpdateState = updateState;

updateState = function (newState) {
  const wasFuzzing = lastFuzzingState;
  const isFuzzing =
    newState.isLoading && getCurrentCommand() === "runFuzzingTests";

  baseUpdateState(newState);

  // If fuzzing just completed → auto-refresh crashes
  if (wasFuzzing && !isFuzzing) {
    setTimeout(() => {
      executeCommand("refreshFuzzers");
    }, 1000); // Wait 1 second before refresh
  }

  lastFuzzingState = isFuzzing;
};
```

### 7.2 Periodic State Refresh (webview.js:686-691)

**Location**: `/home/ms/codeforge-vscode-plugin/src/ui/webview.js:686`

```javascript
// Auto-refresh every 30 seconds (if not currently loading)
setInterval(() => {
  if (!currentState.isLoading) {
    vscode.postMessage({ type: "requestState" });
  }
}, 30000); // 30-second interval
```

### 7.3 Command Completion Auto-Refresh (webview.js:348-359)

**Location**: `/home/ms/codeforge-vscode-plugin/src/ui/webview.js:348`

```javascript
case "commandComplete":
  currentCommand = null;
  setLoading(false);
  if (message.success) {
    // After ANY successful command, request fresh state
    setTimeout(() => {
      vscode.postMessage({ type: "requestState" });
    }, 500);  // Wait 500ms before refresh
  }
  break;
```

---

## 8. MONITORING METHODS SUMMARY

| Method                         | Interval   | Trigger                         | Type               |
| ------------------------------ | ---------- | ------------------------------- | ------------------ |
| **Auto-refresh after fuzzing** | 1 second   | Fuzzing command completion      | Event-driven       |
| **Periodic refresh**           | 30 seconds | Timer                           | Time-based polling |
| **Post-command refresh**       | 500ms      | Any command completion          | Event-driven       |
| **Manual refresh button**      | On-demand  | User click                      | User-triggered     |
| **Operation-specific refresh** | Immediate  | clearCrashes, reevaluateCrashes | Event-driven       |

---

## 9. CURRENT POLLING/WATCHING MECHANISMS

### 9.1 File System Monitoring

**Status**: NOT implemented

- No file watchers on crash directories
- No native fs.watch() usage for crash files
- Relies entirely on script execution and polling

### 9.2 Cache-Based Updates

**Status**: IMPLEMENTED (30-second TTL)

- `FuzzerDiscoveryService` maintains 30-second cache
- Cache auto-invalidates on refresh
- Reduces Docker script execution frequency

### 9.3 Script-Based Discovery

**Status**: PRIMARY MECHANISM

- Uses Docker scripts to query file system:
  - `find-fuzz-tests.sh` - discovers fuzzer binaries
  - `find-crashes.sh` - discovers crash files
- Scripts execute on each discovery call (not cached results)
- Real-time file system introspection

### 9.4 User-Triggered Refresh

**Status**: IMPLEMENTED

- Manual refresh button in UI
- Clears cache and forces discovery
- Returns results to UI in ~1-2 seconds

---

## 10. KEY FILES AND RESPONSIBILITIES

| File                        | Responsibility                                                         |
| --------------------------- | ---------------------------------------------------------------------- |
| `fuzzingOperations.js`      | Orchestrates full fuzzing workflow, parses crash output                |
| `crashDiscoveryService.js`  | Executes crash discovery script, parses results, builds crash objects  |
| `fuzzerDiscoveryService.js` | Integrates fuzzer + crash discovery, manages cache, associates crashes |
| `webviewProvider.js`        | Manages webview state, coordinates UI updates with backend             |
| `commandHandlers.js`        | Handles all user commands, triggers refresh operations                 |
| `webview.js`                | Renders UI, manages click handlers, implements auto-refresh timers     |
| `fuzzingTerminal.js`        | Custom terminal PTY, runs fuzzing workflow, streams output             |

---

## 11. COMPLETE CRASH DISCOVERY REQUEST CHAIN

```
User clicks Refresh button
  ↓
executeCommand("refreshFuzzers")
  ↓
handleRefreshFuzzers() [commandHandlers.js:751]
  ├─ Validate initialization & Docker (silent skip if failed)
  ├─ Set webview loading state
  └─ fuzzerDiscoveryService.refreshFuzzerData()
      ├─ Invalidate cache
      └─ discoverFuzzers(workspacePath, imageName)
          ├─ Execute find-fuzz-tests.sh in Docker
          │  └─ Parse: "preset:fuzzer_name" format
          ├─ crashDiscoveryService.discoverCrashes()
          │  ├─ Execute find-crashes.sh in Docker
          │  │  └─ Parse: "fuzzer_name/crash_hash" format
          │  ├─ For each crash:
          │  │  └─ buildCrashInfo() → get file stats, create object
          │  └─ Group by fuzzer, sort by date
          ├─ buildFuzzerObjects()
          │  ├─ associateCrashesWithFuzzers() → match crashes to fuzzers
          │  ├─ getTestCount() → read test-count.txt
          │  └─ Create fuzzer objects with crashes
          └─ Update cache (30-second TTL)
              └─ Return fuzzer array
  ├─ Update webview state: _updateFuzzerState()
  └─ Send stateUpdate message
      ↓
Webview receives stateUpdate
  └─ updateState() → updateUI() → updateFuzzerDisplay()
      └─ Re-render fuzzers with crashes in activity bar
```

---

## 12. PERFORMANCE CHARACTERISTICS

### Cache Effectiveness

- **With cache (valid)**: ~50ms UI update (no Docker calls)
- **Without cache (refresh)**: ~2-5 seconds (Docker script execution)

### Polling Overhead

- **Per 30-second cycle**: 1 Docker script execution if no loading
- **Annual calls** (30-second polling): ~1,440 script executions

### Script Execution Flow

```
User action
  ↓
Trigger Docker script execution
  ↓
Script queries file system (.codeforge/fuzzing/)
  ↓
Script outputs results (preset:fuzzer or fuzzer_name/crash_hash)
  ↓
Parser extracts structured data
  ↓
UI updates in real-time
```

---

## 13. KNOWN LIMITATIONS & FUTURE IMPROVEMENTS

### Current Limitations

1. **No file watching**: Relies on polling, not real-time fs events
2. **No streaming updates**: Crashes only discovered after fuzzing completes
3. **Cache TTL**: 30-second minimum delay for crash updates
4. **Script dependency**: All discovery requires Docker container startup

### Potential Improvements

1. **Native file watching**: Use `chokidar` or `fs.watch()` on crash directories
2. **Real-time streaming**: Monitor fuzzer output during execution
3. **Shorter cache TTL**: Increase responsiveness (trade-off with performance)
4. **Local file discovery**: Skip Docker for crash enumeration if possible
5. **Incremental updates**: Only fetch new crashes since last scan
