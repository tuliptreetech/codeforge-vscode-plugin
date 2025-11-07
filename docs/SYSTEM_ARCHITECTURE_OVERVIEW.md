# CodeForge System Architecture Overview

Complete architectural documentation for the CodeForge VSCode extension.

## Quick Navigation

- **[Fuzzing and Crash System Architecture](./FUZZING_AND_CRASH_SYSTEM_ARCHITECTURE.md)** - Complete flow from fuzzing to crash display
- **[Crash Discovery Reference](./CRASH_DISCOVERY_REFERENCE.md)** - Quick reference guide with examples
- **[Task Provider Documentation](./TASK_PROVIDER.md)** - Task system integration
- **[Port Forwarding Guide](./PORT_FORWARDING.md)** - Port mapping configuration
- **[Fuzzing Configuration](./FUZZING_CONFIGURATION.md)** - Fuzzing settings

## System Components Overview

### Core Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Activity Bar UI (webview.js)                      │
│ Renders fuzzers, crashes, and action buttons               │
└────────────────────┬────────────────────────────────────────┘
                     │ stateUpdate messages
┌────────────────────▼────────────────────────────────────────┐
│ Layer 3: Webview Provider (webviewProvider.js)             │
│ Manages state, coordinates discovery and UI updates        │
└────────────────────┬────────────────────────────────────────┘
                     │ calls discovery services
┌────────────────────▼────────────────────────────────────────┐
│ Layer 2: Discovery Services                                │
│ - FuzzerDiscoveryService: Finds fuzzers + crashes          │
│ - CrashDiscoveryService: Enumerates crash files            │
│ - Cache system: 30-second TTL                              │
└────────────────────┬────────────────────────────────────────┘
                     │ executes Docker scripts
┌────────────────────▼────────────────────────────────────────┐
│ Layer 1: Docker & Fuzzing (fuzzingOperations.js)           │
│ - Run fuzzing workflow                                      │
│ - Build fuzz targets                                        │
│ - Parse crash output                                        │
└─────────────────────────────────────────────────────────────┘
```

## Key Data Flow: Fuzzing to Crash Display

```
1. User clicks "Run Fuzzing Tests"
   ↓
2. handleRunFuzzing() in commandHandlers.js
   - Creates CodeForgeFuzzingTerminal (custom PTY)
   - Shows terminal to user
   ↓
3. Terminal executes fuzzingOperations.orchestrateFuzzingWorkflow()
   - Build stage: Calls build-fuzz-tests.sh
   - Run stage: Calls run-fuzz-tests.sh
   - Streams output to terminal in real-time
   ↓
4. During execution, run-fuzz-tests.sh outputs:
   "[+] Found crash file: .codeforge/fuzzing/example-output/corpus/crash-abc123"
   ↓
5. parseScriptExecutionResults() parses crash output
   - Extracts file path and fuzzer name
   - Creates crash results object
   ↓
6. Fuzzing completes, terminal closes
   ↓
7. Webview detects completion (webview.js:677)
   - Auto-calls executeCommand("refreshFuzzers") after 1 second
   ↓
8. handleRefreshFuzzers() in commandHandlers.js
   - Calls fuzzerDiscoveryService.refreshFuzzerData()
   - Invalidates 30-second cache
   ↓
9. discoverFuzzers() flow:
   - Execute find-fuzz-tests.sh → Get fuzzers (preset:fuzzer format)
   - Execute find-crashes.sh → Get crashes (fuzzer_name/crash_hash format)
   - Parse and associate crashes with fuzzers
   - Build FuzzerData objects with crashes array
   ↓
10. webviewProvider._updateFuzzerState() updates state
    ↓
11. webviewProvider._sendMessage() sends stateUpdate to webview
    ↓
12. webview.js receives message and re-renders
    - updateState() → updateUI() → updateFuzzerDisplay()
    - HTML re-rendered with new fuzzer/crash data
    ↓
13. Activity bar displays crashes grouped by fuzzer
```

## Discovery Services Architecture

### FuzzerDiscoveryService
- **Location**: `src/fuzzing/fuzzerDiscoveryService.js`
- **Responsibility**: Discover fuzzers and associate crashes
- **Key Methods**:
  - `discoverFuzzers()` - Main method with cache
  - `refreshFuzzerData()` - Force refresh, bypass cache
  - `buildFuzzerObjects()` - Create FuzzerData objects
  - `associateCrashesWithFuzzers()` - Match crashes to fuzzers

**Cache System**:
- TTL: 30 seconds
- Stored in: `cachedFuzzers` Map
- Invalidated by: `refreshFuzzerData()` or TTL expiration

### CrashDiscoveryService
- **Location**: `src/fuzzing/crashDiscoveryService.js`
- **Responsibility**: Find crash files and build metadata
- **Key Methods**:
  - `discoverCrashes()` - Execute find-crashes.sh and parse
  - `executeFindCrashesScript()` - Run script in Docker
  - `parseFindCrashesScriptOutput()` - Parse script results
  - `buildCrashInfo()` - Create CrashInfo objects with file stats

**Data Output**:
- Array of `{fuzzerName, crashes[], outputDir, lastScan}`
- Each crash contains: `{id, fullHash, filePath, fileSize, createdAt, fuzzerName}`

## Webview State Management

### State Object Structure
```javascript
{
  isLoading: boolean,              // Global loading state
  initialization: {
    isInitialized: boolean,        // CodeForge initialized?
    isLoading: boolean,            // Initializing?
    lastChecked: ISO8601 | null,   // When checked?
    error: string | null,          // Error message
    missingComponents: string[],   // Missing dependencies
    details: { ... }               // Progress details
  },
  fuzzers: {
    isLoading: boolean,            // Discovering?
    lastUpdated: ISO8601 | null,   // When discovered?
    data: FuzzerData[],            // Fuzzer objects with crashes
    error: string | null           // Discovery error
  }
}
```

### Message Types
1. **stateUpdate** - State changed, re-render UI
2. **commandComplete** - Command finished, request fresh state
3. **error** - Error occurred, show error state

## Refresh Mechanisms

### Manual Refresh
- User clicks 🔄 button in activity bar
- Calls: `executeCommand("refreshFuzzers")`
- Effect: Clears cache, discovers all fuzzers/crashes

### Auto-Refresh After Fuzzing
- **Trigger**: Fuzzing command completes
- **Delay**: 1 second after completion
- **Implementation**: `webview.js:677-684`
- **Effect**: Calls `executeCommand("refreshFuzzers")`

### Periodic Auto-Refresh
- **Interval**: Every 30 seconds
- **Condition**: Only if not currently loading
- **Implementation**: `webview.js:689-691`
- **Effect**: Requests fresh state from extension

### Post-Command Auto-Refresh
- **Trigger**: Any command completes successfully
- **Delay**: 500ms after command completes
- **Implementation**: `webview.js:354-356`
- **Effect**: Requests fresh state from extension

## File System Structure

### Crash Storage Location
```
workspace/.codeforge/fuzzing/
├── {FUZZER_NAME}-output/
│   ├── corpus/
│   │   ├── crash-{HASH1}
│   │   ├── crash-{HASH2}
│   │   └── crash-{HASH3}
│   └── test-count.txt
│
└── {FUZZER_NAME2}-output/
    ├── corpus/
    │   └── crash-{HASH4}
    └── test-count.txt
```

### Discovery Process
1. Find all directories matching `*-output` pattern
2. For each directory, list `corpus/` subdirectory
3. Filter for files starting with `crash-`
4. Get file stats (size, birthtime) for each crash

## Performance Profile

### Timing
- **Initial fuzzer discovery**: ~2-5 seconds (with Docker)
- **Cached fuzzer data**: ~50ms (from 30-second cache)
- **Refresh operation**: ~2-5 seconds (bypasses cache)
- **Post-command UI update**: 500-1000ms total latency

### Polling
- **Frequency**: 1 call per 30 seconds (minimum)
- **Annual calls**: ~1,440 discovery cycles (at 30-second interval)
- **Cache effectiveness**: 99% reduction in Docker calls during valid cache period

### Resource Usage
- **Per discovery**: 2 Docker script executions (find-fuzz-tests.sh + find-crashes.sh)
- **Memory**: Minimal (Map-based cache, ~1KB per fuzzer)
- **Network**: None (local Docker operations)

## Error Handling Strategy

### Silent Failures (Don't Show User)
- Initial fuzzer discovery in `_performInitialFuzzerDiscovery()`
- Errors logged to console, not shown in UI

### User-Facing Errors
- Crash analysis/debugging errors - Show popup
- Clear crashes errors - Show popup
- Reevaluate crashes errors - Show popup

### Error Recovery
- No auto-retry (user must click refresh)
- Fallback to cached data if discovery fails
- Error state shown with retry button

## Extension Commands

### Fuzzing Commands
- `codeforge.runFuzzingTests` - Start full fuzzing workflow
- `codeforge.buildFuzzingTests` - Build targets without fuzzing
- `codeforge.runFuzzer` - Run specific fuzzer by name

### Crash Commands
- `codeforge.viewCrash` - Open hex viewer for crash file
- `codeforge.analyzeCrash` - Run GDB analysis
- `codeforge.debugCrash` - Launch GDB server for remote debugging
- `codeforge.clearCrashes` - Clear crashes for fuzzer
- `codeforge.reevaluateCrashes` - Rebuild fuzzer and reevaluate crashes

### UI Commands
- `codeforge.refreshFuzzers` - Manual refresh of fuzzer/crash data
- `codeforge.launchTerminal` - Launch container terminal

## Integration Points

### With VSCode API
- **Activity Bar**: Webview displays in custom activity bar icon
- **Terminal API**: Custom PTY for fuzzing output
- **Debugger**: Creates launch configs for GDB debugging
- **Commands**: Command palette integration for all operations
- **Settings**: Configuration via `contributes.configuration` in package.json

### With Docker
- **Engine**: Uses Docker CLI for container operations
- **Scripts**: Executes `.codeforge/scripts/*.sh` inside containers
- **Mounts**: Workspace mounted to `/workspace` in containers
- **Port Forwarding**: Supports custom port mappings

### With CMake
- **Presets**: Reads CMakePresets.json for fuzzer configurations
- **Targets**: Discovers fuzzer targets via CMake introspection
- **Compilation**: Compiles fuzzers using CMake and provided presets

## Future Enhancements

### Proposed Improvements
1. **Real-time file watching** - Replace polling with fs.watch()
2. **Streaming crash discovery** - Show crashes during fuzzing
3. **Incremental updates** - Only fetch new crashes since last scan
4. **Local discovery** - Skip Docker for crash enumeration
5. **Configurable cache TTL** - User-adjustable refresh rate

### Known Limitations
1. No native file watching (polling-based)
2. Crashes only discovered after fuzzing completes
3. All discovery requires Docker container
4. No incremental crash discovery
5. Cache TTL hardcoded to 30 seconds

## Related Documentation

- [Fuzzing and Crash System Architecture](./FUZZING_AND_CRASH_SYSTEM_ARCHITECTURE.md)
- [Crash Discovery Reference](./CRASH_DISCOVERY_REFERENCE.md)
- [Task Provider](./TASK_PROVIDER.md)
- [Port Forwarding](./PORT_FORWARDING.md)
- [Fuzzing Configuration](./FUZZING_CONFIGURATION.md)
- [README](../README.md)

---

**Last Updated**: 2025-11-07
**Version**: 0.1.3
**License**: MIT
