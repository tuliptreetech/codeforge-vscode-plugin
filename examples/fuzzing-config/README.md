# CodeForge Fuzzing Configuration Examples

This directory contains example configurations for CodeForge's fuzzing system. These examples demonstrate different configuration scenarios and can be used as starting points for your own projects.

## Quick Start

1. **Copy the example settings**: Copy the contents of [`settings.json`](settings.json) to your project's `.vscode/settings.json` file
2. **Choose a configuration**: Uncomment the configuration section that best matches your use case
3. **Customize as needed**: Adjust parameters based on your specific requirements
4. **Start fuzzing**: Use CodeForge's fuzzing commands to begin testing

## Available Configurations

### 1. Development Configuration (Default)

**Use Case**: Regular development work, iterative testing, bug discovery

**Characteristics**:

- Balanced performance and thoroughness
- Preserves corpus between sessions for improved effectiveness
- Continues fuzzing after crashes to find multiple issues
- Moderate resource usage suitable for development machines

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 50,
  "codeforge.fuzzing.libfuzzer.jobs": 8,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 300,
  "codeforge.fuzzing.ignoreCrashes": true,
  "codeforge.fuzzing.preserveCorpus": true
}
```

### 2. Quick Testing Configuration

**Use Case**: Fast feedback during development, smoke testing, rapid iteration

**Characteristics**:

- Minimal runs for fast results
- Exits immediately on first crash found
- Lower resource usage
- Fresh start each time (no corpus preservation)

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 10,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 60,
  "codeforge.fuzzing.exitOnCrash": true,
  "codeforge.fuzzing.preserveCorpus": false
}
```

### 3. CI/CD Configuration

**Use Case**: Continuous integration, automated testing, regression detection

**Characteristics**:

- Moderate thoroughness suitable for automated environments
- Fails fast on any crash (treats crashes as test failures)
- Predictable runtime for CI pipelines
- No corpus preservation for reproducible results

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 100,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 600,
  "codeforge.fuzzing.exitOnCrash": true,
  "codeforge.fuzzing.preserveCorpus": false
}
```

### 4. Thorough Analysis Configuration

**Use Case**: Security audits, comprehensive testing, finding edge cases

**Characteristics**:

- High number of runs for comprehensive coverage
- Long runtime for deep analysis
- Continues through crashes to find all issues
- High resource usage for maximum effectiveness

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 500,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 3600,
  "codeforge.fuzzing.libfuzzer.jobs": 16,
  "codeforge.fuzzing.memoryLimit": 4096,
  "codeforge.fuzzing.ignoreCrashes": true
}
```

## Configuration Selection Guide

### Choose Based on Your Goal

| Goal                    | Recommended Configuration | Key Benefits                            |
| ----------------------- | ------------------------- | --------------------------------------- |
| **Quick feedback**      | Quick Testing             | Fast results, immediate crash detection |
| **Regular development** | Development (Default)     | Balanced performance, corpus building   |
| **Automated testing**   | CI/CD                     | Predictable, fail-fast behavior         |
| **Security audit**      | Thorough Analysis         | Comprehensive coverage, deep testing    |

### Choose Based on Available Time

| Available Time    | Recommended Configuration | Expected Results               |
| ----------------- | ------------------------- | ------------------------------ |
| **1-2 minutes**   | Quick Testing             | Basic smoke testing            |
| **5-10 minutes**  | Development               | Good coverage for common bugs  |
| **10-30 minutes** | CI/CD                     | Thorough automated testing     |
| **1+ hours**      | Thorough Analysis         | Comprehensive security testing |

### Choose Based on System Resources

| System Specs             | Recommended Jobs | Memory Limit | Notes                     |
| ------------------------ | ---------------- | ------------ | ------------------------- |
| **4 cores, 8GB RAM**     | 4 jobs           | 1024 MB      | Conservative settings     |
| **8 cores, 16GB RAM**    | 8 jobs           | 2048 MB      | Default settings          |
| **16+ cores, 32GB+ RAM** | 16 jobs          | 4096 MB      | High-performance settings |

## Customization Guidelines

### Adjusting for Your Target

**For Fast Targets** (simple parsing, quick execution):

```json
{
  "codeforge.fuzzing.timeoutPerRun": 10,
  "codeforge.fuzzing.libfuzzer.maxLen": 1024
}
```

**For Slow Targets** (complex processing, network operations):

```json
{
  "codeforge.fuzzing.timeoutPerRun": 60,
  "codeforge.fuzzing.libfuzzer.jobs": 4
}
```

**For Memory-Intensive Targets**:

```json
{
  "codeforge.fuzzing.memoryLimit": 4096,
  "codeforge.fuzzing.libfuzzer.jobs": 4
}
```

### Environment-Specific Adjustments

**Development Environment**:

```json
{
  "codeforge.fuzzing.outputDirectory": ".codeforge/dev-fuzz",
  "codeforge.fuzzing.preserveCorpus": true,
  "codeforge.fuzzing.ignoreCrashes": true
}
```

**CI Environment**:

```json
{
  "codeforge.fuzzing.outputDirectory": ".codeforge/ci-fuzz",
  "codeforge.fuzzing.preserveCorpus": false,
  "codeforge.fuzzing.exitOnCrash": true
}
```

**Production Testing**:

```json
{
  "codeforge.fuzzing.outputDirectory": "/tmp/fuzzing-results",
  "codeforge.fuzzing.libfuzzer.runs": 1000,
  "codeforge.fuzzing.libfuzzer.maxTotalTime": 7200
}
```

## Common Patterns

### Progressive Testing

Start with quick testing, then increase thoroughness:

1. **Initial Development**: Quick Testing (10 runs, 1 minute)
2. **Feature Complete**: Development (50 runs, 5 minutes)
3. **Pre-Release**: CI/CD (100 runs, 10 minutes)
4. **Security Review**: Thorough Analysis (500+ runs, 1+ hours)

### Team Collaboration

**Shared Team Settings** (`.vscode/settings.json`):

```json
{
  "codeforge.fuzzing.libfuzzer.runs": 50,
  "codeforge.fuzzing.libfuzzer.jobs": 8,
  "codeforge.fuzzing.outputDirectory": ".codeforge/team-fuzz",
  "codeforge.fuzzing.preserveCorpus": true
}
```

**Individual Overrides** (User Settings):

```json
{
  "codeforge.fuzzing.libfuzzer.jobs": 16, // Override for high-end machine
  "codeforge.fuzzing.memoryLimit": 4096 // Override for more memory
}
```

## Troubleshooting

### Performance Issues

**System becomes unresponsive**:

```json
{
  "codeforge.fuzzing.libfuzzer.jobs": 4, // Reduce parallel jobs
  "codeforge.fuzzing.memoryLimit": 1024 // Reduce memory per job
}
```

**Fuzzing is too slow**:

```json
{
  "codeforge.fuzzing.libfuzzer.maxLen": 1024, // Reduce input size
  "codeforge.fuzzing.timeoutPerRun": 10 // Reduce timeout
}
```

### Configuration Errors

**Validation failures**: Check parameter ranges in the [full documentation](../../docs/FUZZING_CONFIGURATION.md#troubleshooting)

**Settings not taking effect**:

1. Reload VSCode window (`Ctrl+Shift+P` → "Developer: Reload Window")
2. Check JSON syntax in settings file
3. Verify parameter names are correct (case-sensitive)

## Next Steps

1. **Read the full documentation**: [Fuzzing Configuration Documentation](../../docs/FUZZING_CONFIGURATION.md)
2. **Explore other examples**: Check out the [`examples/`](../) directory for more CodeForge examples
3. **Join the community**: Submit issues and feedback on the [GitHub repository](https://github.com/tuliptreetech/codeforge/issues)

## Related Files

- [`settings.json`](settings.json) - Complete example configurations
- [`../../docs/FUZZING_CONFIGURATION.md`](../../docs/FUZZING_CONFIGURATION.md) - Comprehensive documentation
- [`../tasks.json`](../tasks.json) - Example task configurations
- [`../../README.md`](../../README.md) - Main project documentation
