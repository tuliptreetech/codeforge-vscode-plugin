# Crash Discovery and UI Update Reference

Quick reference guide for understanding the crash discovery system and how it integrates with the activity bar UI.

## Data Structures

### CrashInfo Object (crashDiscoveryService.js)
Represents a single crash file discovered on the file system.

```javascript
{
  id: string,              // First 9 characters of crash hash (short ID for UI)
  fullHash: string,        // Complete crash hash identifier
  fileName: string,        // "crash-{HASH}" - the filename on disk
  filePath: string,        // Absolute path to crash file (e.g., /workspace/.codeforge/fuzzing/example-output/corpus/crash-abc123...)
  fileSize: number,        // Size in bytes
  createdAt: ISO8601,      // Timestamp when crash was discovered (from file birthtime)
  fuzzerName: string       // Name of the fuzzer that created this crash
}
```

### FuzzerData Object (fuzzerDiscoveryService.js)
Represents a fuzzer and its associated crashes, ready for UI display.

```javascript
{
  name: string,            // Fuzzer name (e.g., "example-fuzz")
  preset: string,          // CMake preset used (e.g., "Debug")
  crashes: CrashInfo[],    // Array of crash objects associated with this fuzzer
  lastUpdated: Date,       // Last time this fuzzer was discovered
  outputDir: string,       // .codeforge/fuzzing/{fuzzerName}-output
  testCount: number,       // Number of test cases executed by this fuzzer
  displayName: string      // Formatted name for UI display (e.g., "Example Fuzz")
}
```

### WebviewState Object (webviewProvider.js)
Complete state object sent to webview for rendering the activity bar UI.

```javascript
{
  isLoading: boolean,      // Global loading state for overlay
  initialization: {
    isInitialized: boolean,           // Is CodeForge initialized?
    isLoading: boolean,               // Currently initializing?
    lastChecked: ISO8601 | null,      // When was status last checked?
    error: string | null,             // Initialization error message
    missingComponents: string[],      // Missing dependencies
    details: {
      currentStep: string | null,     // Current initialization step
      stepIndex: number               // Progress indicator
    }
  },
  fuzzers: {
    isLoading: boolean,               // Currently discovering fuzzers?
    lastUpdated: ISO8601 | null,      // When were fuzzers last discovered?
    data: FuzzerData[],               // Array of fuzzer objects with crashes
    error: string | null              // Discovery error message
  }
}
```

## Message Flow: Refresh Button

User clicks refresh button → Data updated in activity bar

```
1. UI: Click event
   └─ webview.js:66-68
      executeCommand("refreshFuzzers")
   
2. VSCode Message
   └─ Sent to extension via vscode.postMessage()
   
3. Extension Handler
   └─ webviewProvider.js:104-135 (_handleMessage)
      case "command": executeCom("refreshFuzzers", {})
   
4. Command Execution
   └─ commandHandlers.js:751-820 (handleRefreshFuzzers)
      ├─ Validate initialization (silent skip if not initialized)
      ├─ Validate Docker image (silent skip if not built)
      ├─ Set webview loading state
      ├─ Call fuzzerDiscoveryService.refreshFuzzerData()
      │  ├─ Invalidate cache
      │  └─ Call discoverFuzzers()
      │     ├─ Execute find-fuzz-tests.sh in Docker
      │     ├─ Execute find-crashes.sh in Docker
      │     ├─ Parse results
      │     └─ Associate crashes with fuzzers
      ├─ Update webview state
      └─ Send stateUpdate message
   
5. Webview Update
   └─ webview.js:340-369 (message listener)
      case "stateUpdate": updateState(message.state)
      └─ updateState() → updateUI() → updateFuzzerDisplay()
         └─ Re-render fuzzers with crashes in HTML
   
6. UI Display
   └─ Activity bar refreshed with new crash data
```

## Message Flow: Post-Fuzzing Auto-Refresh

Crashes automatically refresh after fuzzing completes.

```
1. Fuzzing Starts
   └─ fuzzingTerminal.js:33-150 (open method)
      ├─ Run fuzzing workflow
      └─ Stream results to terminal in real-time
   
2. Crash Output During Fuzzing
   └─ fuzzingOperations.js:659-681
      Parse: "[+] Found crash file: .codeforge/fuzzing/example-output/corpus/crash-abc123"
      Store in results.crashes[]
   
3. Fuzzing Completes
   └─ Mark fuzzingComplete = true
      Send completion message to terminal
   
4. Terminal Closes
   └─ Terminal PTY closes, trigger normal close flow
   
5. Webview Detects Completion
   └─ webview.js:666-684 (auto-refresh on fuzzing completion)
      Monitor: lastFuzzingState → isFuzzing → completion
      └─ When wasFuzzing && !isFuzzing:
         setTimeout(() => executeCommand("refreshFuzzers"), 1000)
   
6. Refresh Trigger
   └─ Normal refresh flow (see Refresh Button above)
```

## Performance Characteristics

### Cache System (fuzzerDiscoveryService.js)

**Cache Duration**: 30 seconds (fuzzerDiscoveryService.js:33)

**When Cache is Used**:
```
discoverFuzzers() called
  ↓
isCacheValid() checks: Is timestamp + 30s > now?
  ├─ YES: Return cached fuzzer data (~50ms)
  └─ NO: Execute discovery flow (~2-5 seconds with Docker)
```

**Cache Invalidation**:
- Automatic: After 30-second TTL expires
- Manual: Called by `refreshFuzzerData()`
- Automatic: After `clearCrashes()` or `reevaluateCrashes()`

### Polling Intervals

| Source | Interval | Condition | Call Type |
|--------|----------|-----------|-----------|
| Post-fuzzing | 1s | Fuzzing just completed | `executeCommand("refreshFuzzers")` |
| Post-command | 500ms | Any command succeeds | `vscode.postMessage({type: "requestState"})` |
| Periodic | 30s | No active loading | `vscode.postMessage({type: "requestState"})` |

## File System Structure

Crashes are discovered at:
```
.codeforge/fuzzing/
├── {FUZZER_NAME}-output/
│   ├── corpus/
│   │   ├── crash-{HASH1}
│   │   ├── crash-{HASH2}
│   │   ├── crash-{HASH3}
│   │   └── ... (more crash files)
│   ├── test-count.txt
│   └── ... (fuzzer output files)
│
├── {FUZZER_NAME2}-output/
│   ├── corpus/
│   │   ├── crash-{HASH4}
│   │   └── ...
│   └── ...
│
└── ... (more fuzzers)
```

Discovery process:
1. Script finds all directories matching `*-output`
2. For each directory, lists files in `corpus/` subdirectory
3. Filters for files starting with `crash-`
4. Gets file stats (size, creation time) for each crash

## Crash Info Example

When a crash is discovered, this is what the system creates:

```javascript
// Real crash file
File: /workspace/.codeforge/fuzzing/example-output/corpus/crash-abc123456789def...

// Parsed and converted to CrashInfo
{
  id: "abc12345",                    // First 9 chars of hash
  fullHash: "abc123456789def123456", // Full hash
  fileName: "crash-abc123456789def123456",
  filePath: "/workspace/.codeforge/fuzzing/example-output/corpus/crash-abc123456789def123456",
  fileSize: 2048,
  createdAt: "2025-11-07T14:30:45.123Z",
  fuzzerName: "example"
}

// Then grouped and associated with FuzzerData
FuzzerData {
  name: "example",
  preset: "Debug",
  crashes: [ { /* CrashInfo object above */ }, ... ],
  lastUpdated: Date(2025-11-07T14:30:45.200Z),
  outputDir: "/workspace/.codeforge/fuzzing/example-output",
  testCount: 15847,
  displayName: "Example"
}
```

## Common Patterns

### Refresh All Crashes (Manual)
User clicks refresh button → Cache invalidated → Full discovery → UI updated

### Refresh Specific Fuzzer Crashes
`reevaluateCrashes()` → Build fuzzer → Reevaluate crashes → Full refresh

### Clear Crashes
`clearCrashes()` → Execute clear-crashes.sh → Full refresh

### View Single Crash
`viewCrash()` → Use filePath from crash object → Open hex viewer

### Analyze Crash
`analyzeCrash()` → Use filePath + fuzzerName → Run GDB analysis

## Key Methods

### Discovery
- `FuzzerDiscoveryService.discoverFuzzers()` - Main discovery with cache
- `CrashDiscoveryService.discoverCrashes()` - Crash-specific discovery
- `FuzzerDiscoveryService.refreshFuzzerData()` - Force refresh, bypass cache

### Cache Management
- `FuzzerDiscoveryService.isCacheValid()` - Check if cache still valid
- `FuzzerDiscoveryService.updateCache()` - Update cache with new data
- `FuzzerDiscoveryService.invalidateCache()` - Clear cache

### UI Updates
- `webviewProvider._updateFuzzerState()` - Update state object
- `webviewProvider._setFuzzerLoading()` - Set loading state
- `webviewProvider._sendMessage()` - Send message to webview

### User Handlers
- `commandHandlers.handleRefreshFuzzers()` - Refresh button handler
- `commandHandlers.handleClearCrashes()` - Clear crashes handler
- `commandHandlers.handleReevaluateCrashes()` - Reevaluate crashes handler

## Debugging Tips

### Check Cache Status
```javascript
// In VS Code Developer Tools console
fuzzerDiscoveryService.isCacheValid()        // true if cache is still valid
fuzzerDiscoveryService.cacheTimestamp        // When cache was last updated
fuzzerDiscoveryService.cachedFuzzers.size    // Number of cached fuzzers
```

### Force Cache Invalidation
```javascript
fuzzerDiscoveryService.invalidateCache()
```

### View Current State
```javascript
// In webview.js console
console.log(currentState)  // Complete webview state object
console.log(currentState.fuzzers.data)  // All fuzzers with crashes
```

### Monitor Auto-Refresh
```javascript
// Set breakpoint or add logging in:
// - webview.js:677 (fuzzing completion detection)
// - webview.js:689 (periodic refresh)
```

## Error Handling

### Silent Failures (Don't Show Errors)
- `_performInitialFuzzerDiscovery()` - Errors logged but not shown
- `handleRefreshFuzzers()` - Logs errors, shows in output channel

### User-Facing Errors
- Crash analysis errors - Show popup message
- GDB server launch errors - Show popup with suggestions
- Clear crashes errors - Show popup message

### Recovery Mechanisms
- Auto-retry: None (manual refresh required)
- Fallback data: Use cached data if discovery fails
- Error state: Show error message in UI with retry button

