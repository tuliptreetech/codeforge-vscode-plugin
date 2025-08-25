# CodeForge Extension Debugging Guide

## Testing Steps

### 1. Launch Extension Development Host

1. Open VSCode in the extension directory
2. Press `F5` or use "Run > Start Debugging"
3. Select "Run Extension" from the launch configuration
4. A new VSCode window (Extension Development Host) will open

### 2. Check Developer Console

1. In the Extension Development Host window, open Developer Tools:
   - Windows/Linux: `Ctrl+Shift+I` or `Help > Toggle Developer Tools`
   - Mac: `Cmd+Option+I` or `Help > Toggle Developer Tools`
2. Go to the Console tab
3. Look for these log messages:
   ```
   [CODEFORGE] extension.js FILE LOADED
   [CODEFORGE ACTIVATE] Function called!
   ```

### 3. Check Output Channel

1. In the Extension Development Host window
2. Open Output panel: `View > Output` or `Ctrl+Shift+U`
3. Select "CodeForge" from the dropdown
4. You should see:
   ```
   ============================
   CodeForge Extension Activated
   [REGISTRATION] Task provider registered successfully
   ```

### 4. Test the Extension

1. Run the test command:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "CodeForge: Test Activation"
   - Press Enter
2. You should see a notification: "CodeForge: Extension IS ACTIVE!"

### 5. Test Task Provider

1. Open Command Palette (`Ctrl+Shift+P`)
2. Type "Tasks: Run Task"
3. Look for tasks with type "codeforge"
4. Or check the tasks.json file is recognized

## What to Look For

### ✅ Success Indicators:

- Console shows `[CODEFORGE] extension.js FILE LOADED`
- Console shows `[CODEFORGE ACTIVATE] Function called!`
- Output channel shows registration success
- Test command shows success notification
- Tasks of type "codeforge" are available

### ❌ Failure Indicators:

- No console logs at all → Extension not loading
- File loaded but no activation → Activation events not triggered
- Activation but no registration → Task provider registration failed
- "No task provider registered" error → Registration not working

## Common Issues and Solutions

### Extension Not Loading

- Check package.json "main" field points to correct file
- Ensure no syntax errors in extension.js
- Check node_modules are installed

### Extension Not Activating

- With "\*" activation event, it should always activate
- Check for errors in Developer Console
- Ensure VSCode version compatibility

### Task Provider Not Registering

- Check the task type is consistently "codeforge" (lowercase)
- Ensure registerTaskProvider is called synchronously
- Check for errors in the output channel

## Debug Output Locations

1. **Developer Console** (`Ctrl+Shift+I`):
   - Shows console.log() statements
   - Shows JavaScript errors
   - Shows module loading issues

2. **Output Channel** (View > Output > CodeForge):
   - Shows extension-specific logs
   - Shows task provider registration status

3. **Extension Host Log**:
   - Help > Toggle Developer Tools > Console
   - Filter by "ExtHost" to see extension host messages

## Current Changes Made for Debugging

1. Added comprehensive logging at file load time
2. Added logging at activation start
3. Created test command "CodeForge: Test Activation"
4. Added "\*" to activationEvents (forces immediate activation)
5. Added visual feedback (notifications) for debugging
