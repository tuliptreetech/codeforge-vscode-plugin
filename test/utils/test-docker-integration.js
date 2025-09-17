const dockerOperations = require('../../dockerOperations');
const path = require('path');

async function testDockerIntegration() {
  console.log('=== Testing Docker Integration for Fuzzing ===');
  
  const workspacePath = path.resolve(__dirname, '../../examples/fuzzing/codeforge-cmake');
  console.log(`Testing with workspace: ${workspacePath}`);
  
  try {
    // Test 1: Generate container name
    console.log('\n1. Testing container name generation...');
    const containerName = dockerOperations.generateContainerName(workspacePath);
    console.log(`Generated container name: ${containerName}`);
    
    // Test 2: Check if Docker image exists
    console.log('\n2. Testing Docker image check...');
    const imageName = `codeforge-${path.basename(workspacePath)}`;
    const imageExists = await dockerOperations.checkImageExists(imageName);
    console.log(`Image ${imageName} exists: ${imageExists}`);
    
    // Test 3: Test basic Docker command execution (if Docker is available)
    console.log('\n3. Testing Docker availability...');
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync('docker --version');
      console.log(`Docker version: ${stdout.trim()}`);
      console.log('Docker is available for fuzzing tests');
      
      // Test 4: Test if we can run a simple command
      console.log('\n4. Testing simple Docker command...');
      const { stdout: testOutput } = await execAsync('docker run --rm hello-world');
      console.log('Docker hello-world test successful');
      
    } catch (dockerError) {
      console.log(`Docker not available or not working: ${dockerError.message}`);
      console.log('Fuzzing tests will fail without Docker');
    }
    
    console.log('\n=== Docker Integration Test Completed ===');
    
  } catch (error) {
    console.error('\n=== Docker Integration Test Failed ===');
    console.error('Error:', error.message);
  }
}

// Run the test
testDockerIntegration().catch(console.error);