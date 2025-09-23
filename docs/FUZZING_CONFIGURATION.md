# Fuzzing Configuration in CodeForge

## Overview

CodeForge provides a comprehensive fuzzing configuration system that allows you to customize all aspects of fuzzing operations through VSCode's settings system. The configuration system supports both workspace-specific and global settings, with automatic validation and sensible defaults for all parameters.

The fuzzing configuration system is built around LibFuzzer and provides fine-grained control over:

- **LibFuzzer Execution Parameters**: Control fuzzing runs, parallel jobs, time limits, and input constraints
- **Crash Handling & Analysis**: Configure how crashes are detected, processed, and analyzed
- **Resource Management**: Set memory limits, timeouts, and performance constraints
- **Directory & File Management**: Control output locations and corpus preservation

## Configuration System Architecture

CodeForge uses VSCode's configuration system with the `codeforge.fuzzing.*` namespace. All settings support:

- **Workspace Settings**: Project-specific configuration in `.vscode/settings.json`
- **Global Settings**: User-wide defaults in VSCode user settings
- **Automatic Validation**: Real-time validation with detailed error messages
- **Default Fallbacks**: Sensible defaults when settings are not configured

## Configuration Parameters

### LibFuzzer Execution Parameters

These parameters control the core LibFuzzer execution behavior:

| Parameter                                                                     | Type     | Default | Range       | Description                                           |
| ----------------------------------------------------------------------------- | -------- | ------- | ----------- | ----------------------------------------------------- |
| [`codeforge.fuzzing.libfuzzer.runs`](src/fuzzing/fuzzingConfig.js:52)         | `number` | `16`    | `1-1000`    | Number of fuzzing runs to execute                     |
| [`codeforge.fuzzing.libfuzzer.jobs`](src/fuzzing/fuzzingConfig.js:53)         | `number` | `8`     | `1-64`      | Number of parallel fuzzing jobs                       |
| [`codeforge.fuzzing.libfuzzer.maxTotalTime`](src/fuzzing/fuzzingConfig.js:54) | `number` | `300`   | `≥0`        | Maximum total fuzzing time in seconds (0 = unlimited) |
| [`codeforge.fuzzing.libfuzzer.maxLen`](src/fuzzing/fuzzingConfig.js:55)       | `number` | `4096`  | `1-1048576` | Maximum input length in bytes                         |

#### LibFuzzer Runs

Controls how many individual fuzzing iterations to perform. Higher values provide more thorough testing but take longer to complete.

- **Quick Testing**: 1-10 runs
- **Development**: 16-50 runs (default: 16)
- **CI/CD**: 100-500 runs
- **Comprehensive**: 500-1000 runs

#### Parallel Jobs

Number of parallel fuzzing processes to run simultaneously. Should generally match your CPU core count for optimal performance.

- **Single Core**: 1 job
- **Quad Core**: 4 jobs
- **8-Core**: 8 jobs (default)
- **High-End**: 16+ jobs

#### Maximum Total Time

Total time limit for all fuzzing operations. Set to 0 for unlimited fuzzing.

- **Quick Tests**: 60-300 seconds (default: 300)
- **Development**: 600-1800 seconds
- **Long Running**: 3600+ seconds
- **Unlimited**: 0

#### Maximum Input Length

Maximum size of generated test inputs. Larger values can find different types of bugs but may slow down fuzzing.

- **Small Inputs**: 256-1024 bytes
- **Medium Inputs**: 4096 bytes (default)
- **Large Inputs**: 16384-65536 bytes
- **Very Large**: 1048576 bytes (1MB max)

### Crash Handling & Analysis

These parameters control how crashes are detected, handled, and processed:

| Parameter                                                              | Type      | Default | Description                                        |
| ---------------------------------------------------------------------- | --------- | ------- | -------------------------------------------------- |
| [`codeforge.fuzzing.ignoreCrashes`](src/fuzzing/fuzzingConfig.js:57)   | `boolean` | `true`  | Continue fuzzing after crashes are found           |
| [`codeforge.fuzzing.exitOnCrash`](src/fuzzing/fuzzingConfig.js:58)     | `boolean` | `false` | Stop fuzzing immediately when first crash is found |
| [`codeforge.fuzzing.minimizeCrashes`](src/fuzzing/fuzzingConfig.js:59) | `boolean` | `true`  | Automatically minimize crash-inducing inputs       |

#### Ignore Crashes vs Exit on Crash

These settings are mutually exclusive and control the fuzzer's behavior when crashes are discovered:

**Ignore Crashes (`ignoreCrashes: true`)**:

- Fuzzer continues running after finding crashes
- Collects multiple crash samples
- Good for comprehensive vulnerability discovery
- **Cannot be used with `exitOnCrash: true`**

**Exit on Crash (`exitOnCrash: true`)**:

- Fuzzer stops immediately after first crash
- Faster feedback for critical bugs
- Good for CI/CD pipelines where any crash is a failure
- **Requires `ignoreCrashes: false`**

#### Crash Minimization

When enabled, CodeForge automatically attempts to minimize crash-inducing inputs to their smallest form, making analysis easier.

### Resource Management

These parameters control system resource usage during fuzzing:

| Parameter                                                            | Type     | Default | Range       | Description                                    |
| -------------------------------------------------------------------- | -------- | ------- | ----------- | ---------------------------------------------- |
| [`codeforge.fuzzing.memoryLimit`](src/fuzzing/fuzzingConfig.js:60)   | `number` | `2048`  | `128-16384` | Memory limit per fuzzing process in MB         |
| [`codeforge.fuzzing.timeoutPerRun`](src/fuzzing/fuzzingConfig.js:61) | `number` | `25`    | `1-300`     | Timeout for individual fuzzing runs in seconds |

#### Memory Limit

Controls the maximum memory each fuzzing process can use. Prevents runaway memory consumption and system instability.

- **Constrained**: 128-512 MB
- **Standard**: 1024-2048 MB (default: 2048)
- **High Memory**: 4096-8192 MB
- **Maximum**: 16384 MB (16 GB)

#### Timeout Per Run

Maximum time allowed for each individual fuzzing iteration. Prevents hanging on infinite loops or very slow inputs.

- **Fast**: 1-10 seconds
- **Standard**: 25 seconds (default)
- **Slow Targets**: 60-120 seconds
- **Very Slow**: 300 seconds (5 minutes max)

### Directory & File Management

These parameters control where fuzzing outputs are stored and how files are managed:

| Parameter                                                              | Type      | Default                | Description                                   |
| ---------------------------------------------------------------------- | --------- | ---------------------- | --------------------------------------------- |
| [`codeforge.fuzzing.outputDirectory`](src/fuzzing/fuzzingConfig.js:62) | `string`  | `".codeforge/fuzzing"` | Directory for fuzzing outputs and crash files |
| [`codeforge.fuzzing.preserveCorpus`](src/fuzzing/fuzzingConfig.js:63)  | `boolean` | `true`                 | Keep corpus files between fuzzing sessions    |

#### Output Directory

Specifies where all fuzzing outputs (crashes, corpus, logs) are stored. The directory is created automatically if it doesn't exist.

- **Default**: `.codeforge/fuzzing` (recommended)
- **Custom**: Any valid directory path
- **Absolute Paths**: Supported but not recommended
- **Relative Paths**: Relative to workspace root

#### Preserve Corpus

Controls whether the fuzzing corpus (collection of interesting inputs) is preserved between sessions.

- **Preserve (`true`)**: Corpus accumulates over time, improving fuzzing effectiveness
- **Clean (`false`)**: Fresh start each time, useful for reproducible testing

## Configuration Examples

### Quick Testing Configuration

Optimized for fast feedback during development:

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 10,
  "codeforge.fuzzing.libfuzzer.jobs": 4,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 60,
  "codeforge.fuzzing.libfuzzer.maxLen": 1024,
  "codeforge.fuzzing.ignoreCrashes": false,
  "codeforge.fuzzing.exitOnCrash": true,
  "codeforge.fuzzing.minimizeCrashes": true,
  "codeforge.fuzzing.memoryLimit": 1024,
  "codeforge.fuzzing.timeoutPerRun": 10,
  "codeforge.fuzzing.outputDirectory": ".codeforge/quick-fuzz",
  "codeforge.fuzzing.preserveCorpus": false
}
```

**Use Case**: Quick smoke testing, development iterations, fast CI checks

### Thorough Analysis Configuration

Comprehensive fuzzing for thorough vulnerability discovery:

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 500,
  "codeforge.fuzzing.libfuzzer.jobs": 16,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 3600,
  "codeforge.fuzzing.libfuzzer.maxLen": 16384,
  "codeforge.fuzzing.ignoreCrashes": true,
  "codeforge.fuzzing.exitOnCrash": false,
  "codeforge.fuzzing.minimizeCrashes": true,
  "codeforge.fuzzing.memoryLimit": 4096,
  "codeforge.fuzzing.timeoutPerRun": 60,
  "codeforge.fuzzing.outputDirectory": ".codeforge/thorough-fuzz",
  "codeforge.fuzzing.preserveCorpus": true
}
```

**Use Case**: Security audits, comprehensive testing, finding edge cases

### CI/CD Configuration

Balanced configuration for automated testing environments:

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 100,
  "codeforge.fuzzing.libfuzzer.jobs": 8,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 600,
  "codeforge.fuzzing.libfuzzer.maxLen": 4096,
  "codeforge.fuzzing.ignoreCrashes": false,
  "codeforge.fuzzing.exitOnCrash": true,
  "codeforge.fuzzing.minimizeCrashes": true,
  "codeforge.fuzzing.memoryLimit": 2048,
  "codeforge.fuzzing.timeoutPerRun": 25,
  "codeforge.fuzzing.outputDirectory": ".codeforge/ci-fuzz",
  "codeforge.fuzzing.preserveCorpus": false
}
```

**Use Case**: Continuous integration, automated testing, regression detection

### Development Configuration

Balanced settings for local development work:

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 50,
  "codeforge.fuzzing.libfuzzer.jobs": 8,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 300,
  "codeforge.fuzzing.libfuzzer.maxLen": 4096,
  "codeforge.fuzzing.ignoreCrashes": true,
  "codeforge.fuzzing.exitOnCrash": false,
  "codeforge.fuzzing.minimizeCrashes": true,
  "codeforge.fuzzing.memoryLimit": 2048,
  "codeforge.fuzzing.timeoutPerRun": 25,
  "codeforge.fuzzing.outputDirectory": ".codeforge/fuzzing",
  "codeforge.fuzzing.preserveCorpus": true
}
```

**Use Case**: Regular development, iterative testing, bug discovery

## Configuration Methods

### Workspace Settings (Recommended)

Create or edit `.vscode/settings.json` in your project root:

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 100,
  "codeforge.fuzzing.libfuzzer.jobs": 8,
  "codeforge.fuzzing.memoryLimit": 4096,
  "codeforge.fuzzing.outputDirectory": ".codeforge/project-fuzz"
}
```

**Advantages**:

- Project-specific configuration
- Version controlled with your code
- Team-wide consistency
- Overrides global settings

### Global Settings

Configure in VSCode User Settings (File → Preferences → Settings):

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 50,
  "codeforge.fuzzing.libfuzzer.jobs": 8,
  "codeforge.fuzzing.memoryLimit": 2048
}
```

**Advantages**:

- Applies to all projects
- Personal defaults
- Fallback when workspace settings not configured

### Settings UI

Use VSCode's Settings UI for easier configuration:

1. Open Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "codeforge fuzzing"
3. Configure parameters using the UI
4. Choose "Workspace" or "User" scope

## Best Practices

### Performance Optimization

**Match Jobs to CPU Cores**:

```json
{
  "codeforge.fuzzing.libfuzzer.jobs": 8 // Match your CPU core count
}
```

**Balance Memory and Jobs**:

```json
{
  // For 16GB system with 8 jobs: 16GB / 8 jobs = 2GB per job
  "codeforge.fuzzing.libfuzzer.jobs": 8,
  "codeforge.fuzzing.memoryLimit": 2048
}
```

**Adjust Timeouts for Target Complexity**:

```json
{
  // Fast targets
  "codeforge.fuzzing.timeoutPerRun": 10,

  // Complex targets
  "codeforge.fuzzing.timeoutPerRun": 60
}
```

### Security Considerations

**Isolate Fuzzing Outputs**:

```json
{
  "codeforge.fuzzing.outputDirectory": ".codeforge/fuzzing" // Keep in project
}
```

**Limit Resource Usage**:

```json
{
  "codeforge.fuzzing.memoryLimit": 2048, // Prevent memory exhaustion
  "codeforge.fuzzing.timeoutPerRun": 25, // Prevent hanging
  "codeforge.fuzzing.libfuzzer.maxLen": 4096 // Limit input size
}
```

### Development Workflow

**Quick Iteration**:

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 10,
  "codeforge.fuzzing.exitOnCrash": true,
  "codeforge.fuzzing.preserveCorpus": false
}
```

**Comprehensive Testing**:

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 500,
  "codeforge.fuzzing.ignoreCrashes": true,
  "codeforge.fuzzing.preserveCorpus": true
}
```

### Team Collaboration

**Consistent Team Settings**:
Create `.vscode/settings.json` with team-agreed defaults:

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 50,
  "codeforge.fuzzing.libfuzzer.jobs": 8,
  "codeforge.fuzzing.memoryLimit": 2048,
  "codeforge.fuzzing.outputDirectory": ".codeforge/fuzzing",
  "codeforge.fuzzing.preserveCorpus": true
}
```

**Environment-Specific Overrides**:
Use different configurations for different environments:

```json
{
  // Development
  "codeforge.fuzzing.libfuzzer.runs": 25,

  // CI (override in CI environment)
  "codeforge.fuzzing.libfuzzer.runs": 100,
  "codeforge.fuzzing.exitOnCrash": true
}
```

## Troubleshooting

### Common Configuration Errors

#### Invalid Parameter Ranges

**Error**: `LibFuzzer runs must be between 1 and 1000, got: 0`

**Solution**: Ensure numeric parameters are within valid ranges:

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 16 // Must be 1-1000
}
```

#### Conflicting Settings

**Error**: `Cannot have both ignoreCrashes and exitOnCrash enabled simultaneously`

**Solution**: Choose one crash handling strategy:

```json
{
  // Option 1: Continue on crashes
  "codeforge.fuzzing.ignoreCrashes": true,
  "codeforge.fuzzing.exitOnCrash": false,

  // Option 2: Exit on first crash
  "codeforge.fuzzing.ignoreCrashes": false,
  "codeforge.fuzzing.exitOnCrash": true
}
```

#### Type Errors

**Error**: `ignoreCrashes must be a boolean, got: string`

**Solution**: Use correct data types:

```json
{
  "codeforge.fuzzing.ignoreCrashes": true, // boolean, not "true"
  "codeforge.fuzzing.libfuzzer.runs": 50 // number, not "50"
}
```

### Performance Issues

#### High Memory Usage

**Symptoms**: System becomes unresponsive, out of memory errors

**Solutions**:

```json
{
  "codeforge.fuzzing.memoryLimit": 1024, // Reduce memory per job
  "codeforge.fuzzing.libfuzzer.jobs": 4 // Reduce parallel jobs
}
```

#### Slow Fuzzing

**Symptoms**: Fuzzing takes too long, timeouts

**Solutions**:

```json
{
  "codeforge.fuzzing.libfuzzer.maxLen": 1024, // Reduce input size
  "codeforge.fuzzing.timeoutPerRun": 10, // Reduce timeout
  "codeforge.fuzzing.libfuzzer.runs": 25 // Reduce total runs
}
```

#### Resource Contention

**Symptoms**: System lag, high CPU usage

**Solutions**:

```json
{
  "codeforge.fuzzing.libfuzzer.jobs": 4 // Reduce to half CPU cores
}
```

### Validation Failures

#### Configuration Not Loading

**Check**:

1. JSON syntax in `.vscode/settings.json`
2. Correct parameter names (case-sensitive)
3. VSCode settings scope (Workspace vs User)

**Debug**:

```json
{
  // Check CodeForge output channel for validation errors
  "codeforge.fuzzing.libfuzzer.runs": 16 // Start with known good values
}
```

#### Settings Not Taking Effect

**Solutions**:

1. Reload VSCode window (`Ctrl+Shift+P` → "Developer: Reload Window")
2. Check settings precedence (Workspace overrides User)
3. Verify configuration with [`getConfigSummary()`](src/fuzzing/fuzzingConfig.js:240) in output

### Directory and File Issues

#### Output Directory Creation Failed

**Error**: Cannot create output directory

**Solutions**:

```json
{
  "codeforge.fuzzing.outputDirectory": ".codeforge/fuzzing" // Use relative path
}
```

#### Permission Errors

**Solutions**:

- Ensure write permissions to output directory
- Use directories within workspace
- Avoid system directories

## Advanced Configuration

### Environment-Specific Settings

Use VSCode's multi-root workspaces or environment variables for different configurations:

```json
{
  "codeforge.fuzzing.outputDirectory": "${workspaceFolder}/.codeforge/fuzzing",
  "codeforge.fuzzing.libfuzzer.jobs": "${env:FUZZING_JOBS}"
}
```

### Integration with Build Systems

Configure fuzzing parameters based on build configuration:

```json
{
  // Debug builds - more thorough fuzzing
  "codeforge.fuzzing.libfuzzer.runs": 100,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 600,

  // Release builds - quick validation
  "codeforge.fuzzing.libfuzzer.runs": 25,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 120
}
```

### Custom Validation

The configuration system provides detailed validation with specific error messages. Use the [`getConfigSummary()`](src/fuzzing/fuzzingConfig.js:240) function to debug configuration issues:

```javascript
// Check current configuration
const summary = fuzzingConfig.getConfigSummary();
console.log(summary);
```

## Related Documentation

- [Task Provider Documentation](TASK_PROVIDER.md) - Complete guide to CodeForge tasks
- [Port Forwarding Documentation](PORT_FORWARDING.md) - Docker port forwarding setup
- [VSCode Settings Documentation](https://code.visualstudio.com/docs/getstarted/settings) - Official VSCode settings guide

## Support

For issues or questions about fuzzing configuration:

1. Check the troubleshooting section above
2. Review the CodeForge output channel for validation errors
3. Verify configuration with the examples provided
4. Submit an issue on the [GitHub repository](https://github.com/tuliptreetech/codeforge/issues)
