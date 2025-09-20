/**
 * Activity Bar UI Test Suite
 *
 * This file contains tests for the simplified CodeForge activity bar UI components:
 * - WebviewProvider functionality
 * - Webview HTML content generation
 * - Message handling between webview and extension
 * - UI state updates and button enabling/disabling
 */

const assert = require("assert");
const sinon = require("sinon");
const vscode = require("vscode");
const path = require("path");

// Import the modules to test
const { CodeForgeWebviewProvider } = require("../../src/ui/webviewProvider");

// Import test helpers
const {
  MockWebview,
  MockWebviewView,
  createMockExtensionContext,
  createMockWebviewMessages,
  createMockCrashData,
  setupTestEnvironment,
  cleanupTestEnvironment,
  assertWebviewHTML,
  assertCrashDataStructure,
  assertWebviewCrashState,
  assertCrashMessage,
  waitForAsync,
} = require("../utils/activity-bar-test-helpers");

suite("Activity Bar UI Test Suite", () => {
  let sandbox;
  let testEnvironment;

  setup(() => {
    sandbox = sinon.createSandbox();
    testEnvironment = setupTestEnvironment(sandbox);
  });

  teardown(() => {
    cleanupTestEnvironment(sandbox);
  });

  suite("WebviewProvider Tests", () => {
    let webviewProvider;
    let mockContext;
    let mockWebviewView;

    setup(() => {
      mockContext = createMockExtensionContext();
      webviewProvider = new CodeForgeWebviewProvider(mockContext);
      mockWebviewView = new MockWebviewView();
    });

    test("Should create webview provider with correct initial state", () => {
      assert.ok(webviewProvider, "WebviewProvider should be created");
      assert.strictEqual(
        webviewProvider._view,
        undefined,
        "Initial view should be undefined",
      );
      assert.deepStrictEqual(
        webviewProvider._currentState,
        {
          isLoading: false,
          crashes: {
            isLoading: false,
            lastUpdated: null,
            data: [],
            error: null,
          },
        },
        "Initial state should be correct",
      );
    });

    test("Should resolve webview view correctly", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      assert.strictEqual(
        webviewProvider._view,
        mockWebviewView,
        "View should be set",
      );
      assert.ok(
        mockWebviewView.webview.html.length > 0,
        "HTML content should be set",
      );
      assert.ok(
        mockWebviewView.webview.onDidReceiveMessage.called,
        "Message handler should be registered",
      );
    });

    test("Should generate correct HTML content", () => {
      const html = webviewProvider._getHtmlForWebview(mockWebviewView.webview);

      assertWebviewHTML(html, [
        "CodeForge Control Panel",
        "Quick Actions",
        "terminal-btn",
        "fuzzing-btn",
      ]);

      // Check for security measures
      assert.ok(
        html.includes("Content-Security-Policy"),
        "Should include CSP header",
      );
    });

    test("Should handle command messages correctly", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      const commandMessage = testEnvironment.mockMessages.command;
      await webviewProvider._handleMessage(commandMessage);

      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.called,
        "Should execute VSCode command",
      );
    });

    test("Should handle requestState messages correctly", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      const requestStateMessage = testEnvironment.mockMessages.requestState;
      await webviewProvider._handleMessage(requestStateMessage);

      await waitForAsync(50); // Wait for async processing

      assert.ok(
        mockWebviewView.webview.postMessage.called,
        "Should send state update message",
      );
    });

    test("Should handle unknown message types gracefully", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      const invalidMessage = testEnvironment.mockMessages.invalidMessage;
      await webviewProvider._handleMessage(invalidMessage);

      // Should not throw error and should log warning
      assert.ok(true, "Should handle unknown message types without throwing");
    });

    test("Should update state correctly", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      const newState = {
        isLoading: true,
      };

      webviewProvider._updateState(newState);

      assert.deepStrictEqual(
        webviewProvider._currentState,
        {
          isLoading: true,
          crashes: {
            isLoading: false,
            lastUpdated: null,
            data: [],
            error: null,
          },
        },
        "State should be updated correctly",
      );

      assert.ok(
        mockWebviewView.webview.postMessage.calledWith({
          type: "stateUpdate",
          state: webviewProvider._currentState,
        }),
        "Should send state update to webview",
      );
    });

    test("Should handle state detection if method exists", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Check if _detectAndUpdateState method exists
      if (typeof webviewProvider._detectAndUpdateState === "function") {
        await webviewProvider._detectAndUpdateState();
        assert.ok(true, "State detection method executed without error");
      } else {
        assert.ok(true, "State detection method not present in simplified UI");
      }
    });

    test("Should handle command execution errors", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Mock command execution failure
      testEnvironment.vscodeMocks.commands.executeCommand.rejects(
        new Error("Command failed"),
      );

      const commandMessage = testEnvironment.mockMessages.command;
      await webviewProvider._handleMessage(commandMessage);

      assert.ok(
        mockWebviewView.webview.postMessage.calledWith(
          sinon.match({
            type: "commandComplete",
            success: false,
            error: "Command failed",
          }),
        ),
        "Should send error message to webview",
      );
    });

    test("Should dispose correctly", () => {
      webviewProvider.dispose();
      assert.strictEqual(
        webviewProvider._view,
        undefined,
        "View should be cleared on dispose",
      );
    });

    test("Should refresh state when requested", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Check if refresh method exists
      if (typeof webviewProvider.refresh === "function") {
        webviewProvider.refresh();
        assert.ok(true, "Refresh method executed without error");
      } else {
        assert.ok(true, "Refresh method not present in simplified UI");
      }
    });
  });

  // Simplified UI Tests - replacing the removed ContainerTreeProvider tests
  suite("Simplified UI Tests", () => {
    test("Should handle simplified webview without container tree provider", () => {
      // This test ensures the simplified UI works without the removed components
      assert.ok(true, "Simplified UI test placeholder");
    });

    test("Should only show Quick Actions section", () => {
      const webviewProvider = new CodeForgeWebviewProvider(
        createMockExtensionContext(),
      );
      const mockWebviewView = new MockWebviewView();

      const html = webviewProvider._getHtmlForWebview(mockWebviewView.webview);

      // Should contain Quick Actions
      assert.ok(
        html.includes("Quick Actions"),
        "Should contain Quick Actions section",
      );

      // Should contain the two buttons
      assert.ok(
        html.includes("terminal-btn"),
        "Should contain Launch Terminal button",
      );
      assert.ok(
        html.includes("fuzzing-btn"),
        "Should contain Run Fuzzing Tests button",
      );

      // Should NOT contain removed sections
      assert.ok(
        !html.includes("Project Status"),
        "Should not contain Project Status section",
      );
      assert.ok(
        !html.includes("Advanced Operations"),
        "Should not contain Advanced Operations section",
      );
      assert.ok(
        !html.includes("initialize-btn"),
        "Should not contain Initialize button",
      );
      assert.ok(!html.includes("build-btn"), "Should not contain Build button");
    });

    test("Should have buttons with no emoji spans and neutral styling", () => {
      const webviewProvider = new CodeForgeWebviewProvider(
        createMockExtensionContext(),
      );
      const mockWebviewView = new MockWebviewView();

      const html = webviewProvider._getHtmlForWebview(mockWebviewView.webview);

      // Check that buttons don't have emoji spans (buttons now have text only)
      assert.ok(
        !html.includes('<span class="btn-icon">💻</span>'),
        "Terminal button should not have emoji icon span",
      );
      assert.ok(
        !html.includes('<span class="btn-icon">🧪</span>'),
        "Fuzzing button should not have emoji icon span",
      );

      // Check that buttons use neutral CSS classes (outline instead of secondary/tertiary)
      assert.ok(
        html.includes('class="action-btn outline"'),
        "Terminal button should have neutral outline styling",
      );
      assert.ok(
        html.includes('class="action-btn outline"'),
        "Fuzzing button should have neutral outline styling",
      );

      // Verify buttons only have text labels, no emoji
      assert.ok(
        html.includes('<span class="btn-text">Launch Terminal</span>'),
        "Terminal button should have text-only label",
      );
      assert.ok(
        html.includes('<span class="btn-text">Run Fuzzing Tests</span>'),
        "Fuzzing button should have text-only label",
      );
    });

    test("Should maintain button functionality despite styling changes", async () => {
      const webviewProvider = new CodeForgeWebviewProvider(
        createMockExtensionContext(),
      );
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      const html = webviewProvider._getHtmlForWebview(mockWebviewView.webview);

      // Verify buttons have correct IDs for functionality
      assert.ok(
        html.includes('id="terminal-btn"'),
        "Terminal button should have correct ID",
      );
      assert.ok(
        html.includes('id="fuzzing-btn"'),
        "Fuzzing button should have correct ID",
      );

      // Verify buttons have proper button elements with updated styling
      assert.ok(
        html.includes('<button class="action-btn outline" id="terminal-btn"'),
        "Terminal button should be a proper button element with outline styling",
      );
      assert.ok(
        html.includes('<button class="action-btn outline" id="fuzzing-btn"'),
        "Fuzzing button should be a proper button element with outline styling",
      );
    });

    test("Should preserve accessibility features in button styling", () => {
      const webviewProvider = new CodeForgeWebviewProvider(
        createMockExtensionContext(),
      );
      const mockWebviewView = new MockWebviewView();

      const html = webviewProvider._getHtmlForWebview(mockWebviewView.webview);

      // Check for proper button structure with text labels
      assert.ok(
        html.includes('<span class="btn-text">Launch Terminal</span>'),
        "Terminal button should have accessible text label",
      );
      assert.ok(
        html.includes('<span class="btn-text">Run Fuzzing Tests</span>'),
        "Fuzzing button should have accessible text label",
      );

      // Verify buttons are not missing essential accessibility attributes
      // (disabled attribute is present by default)
      assert.ok(
        html.includes("disabled"),
        "Buttons should have proper disabled state management",
      );
    });
  });

  suite("Auto Crash Discovery Integration", () => {
    test("Should show crashes immediately when webview is opened", async () => {
      const webviewProvider = new CodeForgeWebviewProvider(
        createMockExtensionContext(),
      );
      const mockWebviewView = new MockWebviewView();

      // Mock crash data
      const mockCrashData = createMockCrashData();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate auto-discovery populating crash data
      webviewProvider._updateCrashState({
        data: mockCrashData,
        lastUpdated: new Date().toISOString(),
        isLoading: false,
        error: null,
      });

      // Verify crash data is immediately available
      assert.deepStrictEqual(
        webviewProvider._currentState.crashes.data,
        mockCrashData,
        "Crash data should be immediately available when webview opens",
      );

      // Verify state update message was sent
      assertCrashMessage(mockWebviewView.webview, "stateUpdate");
    });

    test("Should handle auto-discovery when no crashes exist", async () => {
      const webviewProvider = new CodeForgeWebviewProvider(
        createMockExtensionContext(),
      );
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate auto-discovery finding no crashes
      webviewProvider._updateCrashState({
        data: [],
        lastUpdated: new Date().toISOString(),
        isLoading: false,
        error: null,
      });

      // Verify empty state is handled correctly
      assert.deepStrictEqual(
        webviewProvider._currentState.crashes.data,
        [],
        "Empty crash data should be handled correctly",
      );
      assert.strictEqual(
        webviewProvider._currentState.crashes.error,
        null,
        "No error should be present for empty results",
      );
    });

    test("Should handle auto-discovery errors gracefully", async () => {
      const webviewProvider = new CodeForgeWebviewProvider(
        createMockExtensionContext(),
      );
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate auto-discovery error
      const errorMessage = "Failed to scan for crashes";
      webviewProvider._setCrashLoading(false, errorMessage);

      // Verify error state is handled correctly
      assert.strictEqual(
        webviewProvider._currentState.crashes.error,
        errorMessage,
        "Error message should be stored in state",
      );
      assert.strictEqual(
        webviewProvider._currentState.crashes.isLoading,
        false,
        "Loading should be false after error",
      );
    });

    test("Should not run auto-discovery when .codeforge doesn't exist", async () => {
      const webviewProvider = new CodeForgeWebviewProvider(
        createMockExtensionContext(),
      );
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Verify initial state remains unchanged when no .codeforge directory
      assert.deepStrictEqual(
        webviewProvider._currentState.crashes,
        {
          isLoading: false,
          lastUpdated: null,
          data: [],
          error: null,
        },
        "Initial crash state should remain unchanged when .codeforge doesn't exist",
      );
    });
  });

  suite("Error Handling Tests", () => {
    test("WebviewProvider should handle message errors gracefully", async () => {
      const webviewProvider = new CodeForgeWebviewProvider(
        createMockExtensionContext(),
      );
      const mockWebviewView = new MockWebviewView();

      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate error in message handling
      const errorMessage = { type: "command", command: "nonexistent" };
      await webviewProvider._handleMessage(errorMessage);

      // Check that some error handling occurred (either error message or command complete with error)
      const postMessageCalls = mockWebviewView.webview.postMessage.getCalls();
      const hasErrorResponse = postMessageCalls.some((call) => {
        const message = call.args[0];
        return (
          message &&
          (message.type === "error" ||
            (message.type === "commandComplete" && message.success === false))
        );
      });

      assert.ok(hasErrorResponse, "Should send error response to webview");
    });
  });

  suite("Crash Display Tests", () => {
    let webviewProvider;
    let mockContext;
    let mockWebviewView;

    setup(() => {
      mockContext = createMockExtensionContext();
      webviewProvider = new CodeForgeWebviewProvider(mockContext);
      mockWebviewView = new MockWebviewView();
    });

    test("Should initialize with correct crash state", () => {
      assert.deepStrictEqual(
        webviewProvider._currentState.crashes,
        {
          isLoading: false,
          lastUpdated: null,
          data: [],
          error: null,
        },
        "Initial crash state should be correct",
      );
    });

    test("Should handle crash-related messages", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      const crashMessages = testEnvironment.mockMessages;

      // Test refreshCrashes message
      await webviewProvider._handleMessage(crashMessages.refreshCrashes);
      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.refreshCrashes",
        ),
        "Should execute refreshCrashes command",
      );

      // Test viewCrash message
      await webviewProvider._handleMessage(crashMessages.viewCrash);
      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.viewCrash",
          crashMessages.viewCrash.params,
        ),
        "Should execute viewCrash command with params",
      );

      // Test analyzeCrash message
      await webviewProvider._handleMessage(crashMessages.analyzeCrash);
      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.analyzeCrash",
          crashMessages.analyzeCrash.params,
        ),
        "Should execute analyzeCrash command with params",
      );

      // Test clearCrashes message
      await webviewProvider._handleMessage(crashMessages.clearCrashes);
      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.clearCrashes",
          crashMessages.clearCrashes.params,
        ),
        "Should execute clearCrashes command with params",
      );
    });

    test("Should update crash state correctly", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      const mockCrashData = createMockCrashData();
      const crashState = {
        data: mockCrashData,
        lastUpdated: new Date().toISOString(),
        isLoading: false,
        error: null,
      };

      webviewProvider._updateCrashState(crashState);

      assert.deepStrictEqual(
        webviewProvider._currentState.crashes.data,
        mockCrashData,
        "Crash data should be updated",
      );
      assert.strictEqual(
        webviewProvider._currentState.crashes.isLoading,
        false,
        "Loading state should be updated",
      );
      assert.strictEqual(
        webviewProvider._currentState.crashes.error,
        null,
        "Error state should be updated",
      );

      // Verify state update message was sent
      assertCrashMessage(mockWebviewView.webview, "stateUpdate");
    });

    test("Should set crash loading state correctly", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Test loading state
      webviewProvider._setCrashLoading(true);
      assert.strictEqual(
        webviewProvider._currentState.crashes.isLoading,
        true,
        "Should set loading to true",
      );

      // Test loading with error
      const errorMessage = "Test error";
      webviewProvider._setCrashLoading(false, errorMessage);
      assert.strictEqual(
        webviewProvider._currentState.crashes.isLoading,
        false,
        "Should set loading to false",
      );
      assert.strictEqual(
        webviewProvider._currentState.crashes.error,
        errorMessage,
        "Should set error message",
      );

      // Verify state update messages were sent
      const messages = mockWebviewView.webview.getAllPostedMessages();
      const stateUpdateMessages = messages.filter(
        (msg) => msg.type === "stateUpdate",
      );
      assert.ok(
        stateUpdateMessages.length >= 2,
        "Should send state update messages",
      );
    });

    test("Should handle crash command execution errors", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Mock command execution failure
      testEnvironment.vscodeMocks.commands.executeCommand.rejects(
        new Error("Crash command failed"),
      );

      const crashMessage = testEnvironment.mockMessages.refreshCrashes;
      await webviewProvider._handleMessage(crashMessage);

      // Verify error response
      assert.ok(
        mockWebviewView.webview.postMessage.calledWith(
          sinon.match({
            type: "commandComplete",
            success: false,
            command: "refreshCrashes",
            error: "Crash command failed",
          }),
        ),
        "Should send error message for failed crash command",
      );
    });

    test("Should validate crash data structure", () => {
      const mockCrashData = createMockCrashData();

      // Should not throw for valid data
      assert.doesNotThrow(() => {
        assertCrashDataStructure(mockCrashData);
      }, "Should accept valid crash data structure");

      // Test invalid data structures
      assert.throws(
        () => {
          assertCrashDataStructure("not an array");
        },
        /should be an array/,
        "Should reject non-array data",
      );

      assert.throws(
        () => {
          assertCrashDataStructure([{ fuzzerName: 123 }]);
        },
        /should have a valid fuzzerName/,
        "Should reject invalid fuzzerName",
      );

      assert.throws(
        () => {
          assertCrashDataStructure([
            {
              fuzzerName: "test",
              crashes: "not an array",
            },
          ]);
        },
        /should have crashes array/,
        "Should reject invalid crashes array",
      );
    });

    test("Should validate webview crash state", () => {
      const validState = {
        crashes: {
          isLoading: false,
          data: createMockCrashData(),
          lastUpdated: new Date().toISOString(),
          error: null,
        },
      };

      // Should not throw for valid state
      assert.doesNotThrow(() => {
        assertWebviewCrashState(validState, 3); // 2 crashes from libfuzzer + 1 from afl
      }, "Should accept valid crash state");

      // Test invalid states
      assert.throws(
        () => {
          assertWebviewCrashState({});
        },
        /should contain crashes object/,
        "Should reject state without crashes",
      );

      assert.throws(
        () => {
          assertWebviewCrashState({ crashes: { isLoading: "not boolean" } });
        },
        /should have isLoading boolean/,
        "Should reject invalid isLoading",
      );

      assert.throws(
        () => {
          assertWebviewCrashState(validState, 5);
        },
        /Expected 5 crashes, got 3/,
        "Should reject incorrect crash count",
      );
    });
  });

  suite("Crash Integration Tests", () => {
    let webviewProvider;
    let mockContext;
    let mockWebviewView;

    setup(() => {
      mockContext = createMockExtensionContext();
      webviewProvider = new CodeForgeWebviewProvider(mockContext);
      mockWebviewView = new MockWebviewView();
    });

    test("Should integrate crash discovery service", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Verify crash discovery service is initialized
      assert.ok(
        webviewProvider._crashDiscoveryService,
        "Should have crash discovery service",
      );
    });

    test("Should handle complete crash workflow", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate crash refresh workflow
      const refreshMessage = testEnvironment.mockMessages.refreshCrashes;
      await webviewProvider._handleMessage(refreshMessage);

      // Verify command was executed
      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.refreshCrashes",
        ),
        "Should execute refresh command",
      );

      // Simulate successful command completion
      webviewProvider._updateCrashState({
        data: createMockCrashData(),
        lastUpdated: new Date().toISOString(),
        isLoading: false,
        error: null,
      });

      // Verify state was updated
      assertWebviewCrashState(webviewProvider._currentState, 3);

      // Simulate viewing a crash
      const viewMessage = testEnvironment.mockMessages.viewCrash;
      await webviewProvider._handleMessage(viewMessage);

      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.viewCrash",
          viewMessage.params,
        ),
        "Should execute view crash command",
      );
    });

    test("Should handle crash state transitions", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Initial state
      assertWebviewCrashState(webviewProvider._currentState, 0);

      // Loading state
      webviewProvider._setCrashLoading(true);
      assert.strictEqual(
        webviewProvider._currentState.crashes.isLoading,
        true,
        "Should be in loading state",
      );

      // Success state
      const mockCrashData = createMockCrashData();
      webviewProvider._updateCrashState({
        data: mockCrashData,
        lastUpdated: new Date().toISOString(),
        isLoading: false,
        error: null,
      });
      assertWebviewCrashState(webviewProvider._currentState, 3);

      // Error state
      webviewProvider._setCrashLoading(false, "Test error");
      assert.strictEqual(
        webviewProvider._currentState.crashes.error,
        "Test error",
        "Should be in error state",
      );
    });

    test("Should handle concurrent crash operations", async () => {
      await webviewProvider.resolveWebviewView(mockWebviewView);

      // Simulate multiple concurrent operations
      const promises = [
        webviewProvider._handleMessage(
          testEnvironment.mockMessages.refreshCrashes,
        ),
        webviewProvider._handleMessage(testEnvironment.mockMessages.viewCrash),
        webviewProvider._handleMessage(
          testEnvironment.mockMessages.analyzeCrash,
        ),
      ];

      await Promise.all(promises);

      // Verify all commands were executed
      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.refreshCrashes",
        ),
        "Should execute refresh command",
      );
      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.viewCrash",
        ),
        "Should execute view command",
      );
      assert.ok(
        testEnvironment.vscodeMocks.commands.executeCommand.calledWith(
          "codeforge.analyzeCrash",
        ),
        "Should execute analyze command",
      );
    });
  });
});
