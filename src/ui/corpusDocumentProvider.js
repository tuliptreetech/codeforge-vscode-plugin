const vscode = require("vscode");
const { CorpusReportService } = require("../fuzzing/corpusReportService");
const dockerOperations = require("../core/dockerOperations");
const path = require("path");

/**
 * Read-only corpus document provider for viewing corpus files
 * Creates virtual documents that cannot be edited or saved
 */
class CorpusDocumentProvider {
  constructor(resourceManager = null) {
    this.onDidChangeEmitter = new vscode.EventEmitter();
    this.onDidChange = this.onDidChangeEmitter.event;

    // Cache for corpus content to avoid regenerating
    this.contentCache = new Map();

    // Corpus report service for generating content
    this.corpusReportService = new CorpusReportService(resourceManager);
    this.resourceManager = resourceManager;

    // Map of fuzzer corpus directories being watched
    // Key: cacheKey (workspacePath:fuzzerName), Value: FileSystemWatcher
    this.watchers = new Map();

    // Debounce timer for file change events
    this.refreshTimers = new Map();
  }

  /**
   * Provide document content for virtual corpus documents
   * @param {vscode.Uri} uri - Virtual URI for the corpus document
   * @returns {Promise<string>} The corpus viewer content
   */
  async provideTextDocumentContent(uri) {
    try {
      // Parse the URI to get the fuzzer name and workspace path
      const query = new URLSearchParams(uri.query);
      const fuzzerName = query.get("fuzzer");
      const workspacePath = query.get("workspacePath");

      if (!fuzzerName) {
        throw new Error("Fuzzer name not provided in URI");
      }

      if (!workspacePath) {
        throw new Error("Workspace path not provided in URI");
      }

      const cacheKey = `${workspacePath}:${fuzzerName}`;

      // Start watching the corpus directory if not already watching
      this.startWatching(fuzzerName, workspacePath);

      // Check cache first
      if (this.contentCache.has(cacheKey)) {
        return this.contentCache.get(cacheKey);
      }

      // Get the Docker image name for the workspace
      const imageName = dockerOperations.generateContainerName(workspacePath);

      // Generate corpus report using the Docker command
      const content = await this.corpusReportService.generateCorpusReport(
        workspacePath,
        fuzzerName,
        imageName,
      );

      // Cache the content
      this.contentCache.set(cacheKey, content);

      return content;
    } catch (error) {
      // Return error content if something goes wrong
      return `ERROR: Failed to generate corpus viewer\n${error.message}\n\nThis document is read-only and cannot be edited.`;
    }
  }

  /**
   * Create a virtual URI for a corpus document
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {string} workspacePath - Path to workspace root
   * @returns {vscode.Uri} Virtual URI for the corpus document
   */
  static createCorpusUri(fuzzerName, workspacePath) {
    const queryParams = {
      fuzzer: fuzzerName,
      workspacePath: workspacePath,
    };

    const query = new URLSearchParams(queryParams);

    // Create virtual URI with corpus viewer scheme
    return vscode.Uri.parse(
      `codeforge-corpus:${fuzzerName}-corpus.txt?${query.toString()}`,
    );
  }

  /**
   * Clear the content cache for a specific fuzzer or all fuzzers
   * @param {string} fuzzerName - Optional fuzzer name to clear cache for
   */
  clearCache(fuzzerName = null) {
    if (fuzzerName) {
      // Clear cache for specific fuzzer
      for (const [key, _] of this.contentCache.entries()) {
        if (key.includes(`:${fuzzerName}`)) {
          this.contentCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.contentCache.clear();
    }
  }

  /**
   * Refresh a corpus document by clearing cache and triggering update
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {string} workspacePath - Path to workspace root
   */
  refresh(fuzzerName, workspacePath) {
    const cacheKey = `${workspacePath}:${fuzzerName}`;
    this.contentCache.delete(cacheKey);

    // Trigger document update
    const uri = CorpusDocumentProvider.createCorpusUri(
      fuzzerName,
      workspacePath,
    );
    this.onDidChangeEmitter.fire(uri);
  }

  /**
   * Start watching a corpus directory for changes
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {string} workspacePath - Path to workspace root
   */
  startWatching(fuzzerName, workspacePath) {
    const cacheKey = `${workspacePath}:${fuzzerName}`;

    // Already watching this corpus directory
    if (this.watchers.has(cacheKey)) {
      return;
    }

    // Get the corpus directory path
    const corpusDir = path.join(
      workspacePath,
      ".codeforge",
      "fuzzing",
      `${fuzzerName}-output`,
      "corpus",
    );

    // Create a file system watcher for the corpus directory
    // Watch for file creation, deletion, and changes
    const pattern = new vscode.RelativePattern(corpusDir, "*");
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // Debounced refresh function to avoid excessive updates
    const debouncedRefresh = () => {
      // Clear existing timer if any
      const existingTimer = this.refreshTimers.get(cacheKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new timer to refresh after 500ms of no changes
      const timer = setTimeout(() => {
        this.refresh(fuzzerName, workspacePath);
        this.refreshTimers.delete(cacheKey);
      }, 500);

      this.refreshTimers.set(cacheKey, timer);
    };

    // Register event handlers
    watcher.onDidCreate(debouncedRefresh);
    watcher.onDidChange(debouncedRefresh);
    watcher.onDidDelete(debouncedRefresh);

    // Store the watcher
    this.watchers.set(cacheKey, watcher);
  }

  /**
   * Stop watching a corpus directory
   * @param {string} fuzzerName - Name of the fuzzer
   * @param {string} workspacePath - Path to workspace root
   */
  stopWatching(fuzzerName, workspacePath) {
    const cacheKey = `${workspacePath}:${fuzzerName}`;

    // Clear any pending refresh timer
    const timer = this.refreshTimers.get(cacheKey);
    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(cacheKey);
    }

    // Dispose the watcher if it exists
    const watcher = this.watchers.get(cacheKey);
    if (watcher) {
      watcher.dispose();
      this.watchers.delete(cacheKey);
    }
  }

  /**
   * Stop watching all corpus directories
   */
  stopAllWatching() {
    // Clear all timers
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();

    // Dispose all watchers
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
  }

  /**
   * Dispose of the provider
   */
  dispose() {
    this.stopAllWatching();
    this.clearCache();
    this.onDidChangeEmitter.dispose();
  }
}

module.exports = { CorpusDocumentProvider };
