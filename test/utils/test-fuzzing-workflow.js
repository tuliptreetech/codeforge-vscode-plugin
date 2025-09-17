const path = require('path');
const fuzzingOperations = require('../../src/fuzzing/fuzzingOperations');

// Mock output channel
const mockOutputChannel = {
  appendLine: (message) => console.log(message),
  show: () => console.log('[Output channel shown]')
};

// Mock progress callback
const mockProgressCallback = (message, progress) => {
  console.log(`Progress: ${progress}% - ${message}`);
};

async function testFuzzingWorkflow() {
  console.log('=== Testing Fuzzing Workflow ===');
  
  const workspacePath = path.resolve(__dirname, '../../examples/fuzzing/codeforge-cmake');
  console.log(`Testing with workspace: ${workspacePath}`);
  
  try {
    const results = await fuzzingOperations.runFuzzingTests(
      workspacePath,
      mockOutputChannel,
      mockProgressCallback,
      {}
    );
    
    console.log('\n=== Fuzzing Results ===');
    console.log('Results:', JSON.stringify(results, null, 2));
    console.log('\n=== Test Completed Successfully ===');
    
  } catch (error) {
    console.error('\n=== Fuzzing Test Failed ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    // This is expected if Docker is not available or other issues occur
    console.log('\nNote: This error may be expected if Docker is not available or configured.');
  }
}

// Run the test
testFuzzingWorkflow().catch(console.error);