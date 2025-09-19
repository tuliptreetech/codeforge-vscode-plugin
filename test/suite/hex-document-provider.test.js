const assert = require('assert');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const { HexDocumentProvider } = require('../../src/ui/hexDocumentProvider');

suite('HexDocumentProvider Test Suite', () => {
  let testCrashFile;
  let hexProvider;

  suiteSetup(async () => {
    // Create a test crash file
    testCrashFile = path.join(__dirname, '..', 'fixtures', 'test-crash.bin');
    
    // Ensure fixtures directory exists
    const fixturesDir = path.dirname(testCrashFile);
    try {
      await fs.mkdir(fixturesDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Create test binary data
    const testData = Buffer.from([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
      0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F,
      0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
      0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F,
      // Add some ASCII characters
      0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0x57, 0x6F, // "Hello Wo"
      0x72, 0x6C, 0x64, 0x21, 0x00, 0x00, 0x00, 0x00, // "rld!"
      // Add some more binary data
      0xFF, 0xFE, 0xFD, 0xFC, 0xFB, 0xFA, 0xF9, 0xF8,
      0xF7, 0xF6, 0xF5, 0xF4, 0xF3, 0xF2, 0xF1, 0xF0
    ]);

    await fs.writeFile(testCrashFile, testData);

    // Create hex provider instance
    hexProvider = new HexDocumentProvider();
  });

  suiteTeardown(async () => {
    // Clean up test file
    try {
      await fs.unlink(testCrashFile);
    } catch (error) {
      // File might not exist
    }

    // Dispose provider
    if (hexProvider) {
      hexProvider.dispose();
    }
  });

  test('HexDocumentProvider should create virtual URI correctly', () => {
    const filePath = '/path/to/crash-file.bin';
    const crashId = 'crash-001';
    
    const uri = HexDocumentProvider.createHexUri(filePath, crashId);
    
    assert.strictEqual(uri.scheme, 'codeforge-hex');
    assert.strictEqual(uri.path, 'crash-001.hex');
    
    const query = new URLSearchParams(uri.query);
    assert.strictEqual(query.get('file'), filePath);
    assert.strictEqual(query.get('crashId'), crashId);
  });

  test('HexDocumentProvider should generate hex dump content', async () => {
    const crashId = 'test-crash-001';
    const uri = HexDocumentProvider.createHexUri(testCrashFile, crashId);
    
    const content = await hexProvider.provideTextDocumentContent(uri);
    
    // Verify content structure
    assert(content.includes('# READ-ONLY HEX VIEW - CANNOT BE EDITED OR SAVED'));
    assert(content.includes('# This is a virtual document showing hex dump of crash file'));
    assert(content.includes(`Crash ID: ${crashId}`));
    assert(content.includes(`File: ${path.basename(testCrashFile)}`));
    assert(content.includes(`Path: ${testCrashFile}`));
    
    // Verify hex dump format
    assert(content.includes('00000000  00 01 02 03 04 05 06 07  08 09 0a 0b 0c 0d 0e 0f  |................|'));
    assert(content.includes('00000010  10 11 12 13 14 15 16 17  18 19 1a 1b 1c 1d 1e 1f  |................|'));
    
    // Verify ASCII representation
    assert(content.includes('Hello World!'));
  });

  test('HexDocumentProvider should handle missing file gracefully', async () => {
    const nonExistentFile = '/path/to/nonexistent/file.bin';
    const crashId = 'missing-crash-001';
    const uri = HexDocumentProvider.createHexUri(nonExistentFile, crashId);
    
    const content = await hexProvider.provideTextDocumentContent(uri);
    
    // Should return error content
    assert(content.includes('# ERROR: Failed to generate hex dump'));
    assert(content.includes('# This document is read-only and cannot be edited.'));
  });

  test('HexDocumentProvider should cache content', async () => {
    const crashId = 'cache-test-001';
    const uri = HexDocumentProvider.createHexUri(testCrashFile, crashId);
    
    // First call
    const content1 = await hexProvider.provideTextDocumentContent(uri);
    
    // Second call should use cache
    const content2 = await hexProvider.provideTextDocumentContent(uri);
    
    assert.strictEqual(content1, content2);
    
    // Verify cache is working by checking internal cache
    const cacheKey = `${testCrashFile}:${crashId}`;
    assert(hexProvider.contentCache.has(cacheKey));
  });

  test('HexDocumentProvider should clear cache', async () => {
    const crashId = 'clear-cache-test-001';
    const uri = HexDocumentProvider.createHexUri(testCrashFile, crashId);
    
    // Generate content to populate cache
    await hexProvider.provideTextDocumentContent(uri);
    
    const cacheKey = `${testCrashFile}:${crashId}`;
    assert(hexProvider.contentCache.has(cacheKey));
    
    // Clear cache
    hexProvider.clearCache();
    
    assert(!hexProvider.contentCache.has(cacheKey));
  });

  test('HexDocumentProvider should handle empty files', async () => {
    // Create empty test file
    const emptyFile = path.join(__dirname, '..', 'fixtures', 'empty-crash.bin');
    await fs.writeFile(emptyFile, Buffer.alloc(0));
    
    try {
      const crashId = 'empty-crash-001';
      const uri = HexDocumentProvider.createHexUri(emptyFile, crashId);
      
      const content = await hexProvider.provideTextDocumentContent(uri);
      
      assert(content.includes('# Empty file - no content to display'));
      assert(content.includes('File Size: 0 bytes'));
    } finally {
      // Clean up
      try {
        await fs.unlink(emptyFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  test('HexDocumentProvider should truncate large files', async () => {
    // Create a large test file (larger than 64KB)
    const largeFile = path.join(__dirname, '..', 'fixtures', 'large-crash.bin');
    const largeData = Buffer.alloc(100 * 1024, 0xAA); // 100KB of 0xAA
    await fs.writeFile(largeFile, largeData);
    
    try {
      const crashId = 'large-crash-001';
      const uri = HexDocumentProvider.createHexUri(largeFile, crashId);
      
      const content = await hexProvider.provideTextDocumentContent(uri);
      
      assert(content.includes('File Size: 102400 bytes (showing first 64KB)'));
      assert(content.includes('... (file truncated at 65536 bytes for display)'));
      assert(content.includes('Total file size: 102400 bytes'));
    } finally {
      // Clean up
      try {
        await fs.unlink(largeFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });
});