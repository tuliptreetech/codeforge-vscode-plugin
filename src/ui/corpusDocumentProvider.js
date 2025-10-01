const vscode = require("vscode");
const { CorpusViewerService } = require("../fuzzing/corpusViewerService");

/**
 * Read-only corpus document provider for viewing corpus files
 * Creates virtual documents that cannot be edited or saved
 */
class CorpusDocumentProvider {
  constructor() {
    this.onDidChangeEmitter = new vscode.EventEmitter();
    this.onDidChange = this.onDidChangeEmitter.event;

    // Cache for corpus content to avoid regenerating
    this.contentCache = new Map();

    // Corpus viewer service for generating content
    this.corpusViewerService = new CorpusViewerService();
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

      // Check cache first
      const cacheKey = `${workspacePath}:${fuzzerName}`;
      if (this.contentCache.has(cacheKey)) {
        return this.contentCache.get(cacheKey);
      }

      // Generate corpus viewer content
      const content =
        await this.corpusViewerService.generateCorpusViewerContent(
          workspacePath,
          fuzzerName,
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
   * Dispose of the provider
   */
  dispose() {
    this.clearCache();
    this.onDidChangeEmitter.dispose();
  }
}

module.exports = { CorpusDocumentProvider };
