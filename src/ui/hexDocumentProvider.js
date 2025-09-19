const vscode = require("vscode");
const fs = require("fs").promises;
const path = require("path");

/**
 * Read-only hex document provider for crash files
 * Creates virtual documents that cannot be edited or saved
 */
class HexDocumentProvider {
  constructor() {
    this.onDidChangeEmitter = new vscode.EventEmitter();
    this.onDidChange = this.onDidChangeEmitter.event;
    
    // Cache for hex content to avoid regenerating
    this.contentCache = new Map();
  }

  /**
   * Provide document content for virtual hex documents
   * @param {vscode.Uri} uri - Virtual URI for the hex document
   * @returns {Promise<string>} The hex dump content
   */
  async provideTextDocumentContent(uri) {
    try {
      // Parse the URI to get the original file path
      const query = new URLSearchParams(uri.query);
      const filePath = query.get('file');
      const crashId = query.get('crashId') || path.basename(filePath);
      
      if (!filePath) {
        throw new Error('File path not provided in URI');
      }

      // Check cache first
      const cacheKey = `${filePath}:${crashId}`;
      if (this.contentCache.has(cacheKey)) {
        return this.contentCache.get(cacheKey);
      }

      // Generate hex dump content
      const hexContent = await this.generateHexDump(filePath, crashId);
      
      // Cache the content
      this.contentCache.set(cacheKey, hexContent);
      
      return hexContent;
    } catch (error) {
      // Return error content if something goes wrong
      return `# ERROR: Failed to generate hex dump\n# ${error.message}\n\n# This document is read-only and cannot be edited.`;
    }
  }

  /**
   * Generate hex dump content for binary files
   * @param {string} filePath - Path to the file to dump
   * @param {string} crashId - Crash identifier for display
   * @param {number} maxSize - Maximum size to read (default 64KB)
   * @returns {Promise<string>} Hex dump content
   */
  async generateHexDump(filePath, crashId, maxSize = 1024 * 64) {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      const buffer = await fs.readFile(filePath);
      const truncated = buffer.length > maxSize;
      const data = truncated ? buffer.slice(0, maxSize) : buffer;
      
      // Header with read-only notice
      let hexDump = `# READ-ONLY HEX VIEW - CANNOT BE EDITED OR SAVED\n`;
      hexDump += `# This is a virtual document showing hex dump of crash file\n`;
      hexDump += `# Any changes made will be lost and cannot be saved\n\n`;
      hexDump += `Crash ID: ${crashId}\n`;
      hexDump += `File: ${path.basename(filePath)}\n`;
      hexDump += `Path: ${filePath}\n`;
      hexDump += `File Size: ${buffer.length} bytes${truncated ? ' (showing first 64KB)' : ''}\n`;
      hexDump += `Generated: ${new Date().toISOString()}\n\n`;
      
      if (data.length === 0) {
        hexDump += `# Empty file - no content to display\n`;
        return hexDump;
      }
      
      // Generate hex dump in standard format: offset | hex bytes | ASCII
      for (let i = 0; i < data.length; i += 16) {
        // Format offset (8 hex digits)
        const offset = i.toString(16).padStart(8, '0');
        
        // Get 16 bytes (or remaining bytes)
        const chunk = data.slice(i, i + 16);
        
        // Format hex bytes (2 hex digits per byte, space separated)
        let hexBytes = '';
        let asciiChars = '';
        
        for (let j = 0; j < 16; j++) {
          if (j < chunk.length) {
            const byte = chunk[j];
            hexBytes += byte.toString(16).padStart(2, '0');
            
            // ASCII representation (printable chars or dot)
            if (byte >= 32 && byte <= 126) {
              asciiChars += String.fromCharCode(byte);
            } else {
              asciiChars += '.';
            }
          } else {
            hexBytes += '  '; // Empty space for missing bytes
            asciiChars += ' ';
          }
          
          // Add space after every byte, extra space after 8 bytes
          if (j < 15) {
            hexBytes += ' ';
            if (j === 7) {
              hexBytes += ' ';
            }
          }
        }
        
        // Format: offset  hex_bytes  |ascii_chars|
        hexDump += `${offset}  ${hexBytes}  |${asciiChars}|\n`;
      }
      
      if (truncated) {
        hexDump += `\n... (file truncated at ${maxSize} bytes for display)\n`;
        hexDump += `Total file size: ${buffer.length} bytes\n`;
        hexDump += `\n# This is a read-only view - document cannot be edited or saved\n`;
      }
      
      return hexDump;
    } catch (error) {
      throw new Error(`Failed to generate hex dump: ${error.message}`);
    }
  }

  /**
   * Create a virtual URI for a hex document
   * @param {string} filePath - Original file path
   * @param {string} crashId - Crash identifier
   * @returns {vscode.Uri} Virtual URI for the hex document
   */
  static createHexUri(filePath, crashId) {
    const query = new URLSearchParams({
      file: filePath,
      crashId: crashId
    });
    
    // Create virtual URI with hex scheme
    return vscode.Uri.parse(`codeforge-hex:${crashId}.hex?${query.toString()}`);
  }

  /**
   * Clear the content cache
   */
  clearCache() {
    this.contentCache.clear();
  }

  /**
   * Dispose of the provider
   */
  dispose() {
    this.clearCache();
    this.onDidChangeEmitter.dispose();
  }
}

module.exports = { HexDocumentProvider };