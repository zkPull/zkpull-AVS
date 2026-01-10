#!/usr/bin/env node

/**
 * zkTLS Operator Bot
 * Automated validator for zkPull protocol using AVS
 */

const { ethers } = require('ethers');
const axios = require('axios');
require('dotenv').config();

// Configuration
const config = {
  rpcUrl: process.env.MANTLE_SEPOLIA_RPC_URL,
  privateKey: process.env.OPERATOR_PRIVATE_KEY,
  avsAddress: process.env.AVS_CONTRACT_ADDRESS,
  endpoint: process.env.OPERATOR_ENDPOINT || 'http://localhost:3000',
  pollInterval: parseInt(process.env.POLL_INTERVAL) || 30000, // 30 seconds
  zkTLSApiUrl: process.env.ZKTLS_API_URL || 'https://zkpull-services.up.railway.app',
};

// ABIs
const AVS_ABI = [
  'function pickTask(uint256 taskId) external',
  'function submitValidation(uint256 taskId, bool isValid, bytes zkProof) external',
  'function getTask(uint256 taskId) external view returns (tuple(uint256 taskId, uint256 issueId, uint256 claimIndex, string prLink, address developer, uint256 createdAt, uint8 status, address assignedOperator, bytes zkProof))',
  'function getOperatorTasks(address operator) external view returns (uint256[])',
  'function registerOperator(string endpoint) external payable',
  'function issuesClaimContract() external view returns (address)',
  'event TaskCreated(uint256 indexed taskId, uint256 issueId, uint256 claimIndex)',
  'event TaskAssigned(uint256 indexed taskId, address indexed operator)',
];

class ZKTLSOperatorBot {
  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.avsContract = new ethers.Contract(config.avsAddress, AVS_ABI, this.wallet);
    this.isRunning = false;
    this.processingTasks = new Set();
  }

  async start() {
    console.log('🚀 Starting zkTLS Operator Bot...');
    console.log(`📍 Operator Address: ${this.wallet.address}`);
    console.log(`📍 AVS Contract: ${config.avsAddress}`);
    console.log(`📍 Endpoint: ${config.endpoint}`);
    
    // Check if operator is registered
    try {
      const tasks = await this.avsContract.getOperatorTasks(this.wallet.address);
      console.log(`✅ Operator registered with ${tasks.length} tasks`);
    } catch (error) {
      console.log('⚠️  Operator not registered. Please register first.');
      console.log('Run: node operator/register.js');
      process.exit(1);
    }
    
    this.isRunning = true;
    
    // Listen for new tasks
    this.listenForTasks();
    
    // Poll for pending tasks
    this.pollPendingTasks();
    
    console.log('✅ Bot started successfully!');
  }

  async stop() {
    console.log('🛑 Stopping bot...');
    this.isRunning = false;
  }

  /**
   * Listen for TaskCreated events
   */
  listenForTasks() {
    console.log('👂 Listening for new tasks...');
    
    this.avsContract.on('TaskCreated', async (taskId, issueId, claimIndex) => {
      console.log(`\n📬 New task created: #${taskId}`);
      console.log(`   Issue: ${issueId}, Claim: ${claimIndex}`);
      
      // Wait a bit for auto-assignment to complete
      await this.sleep(3000);
      
      // Check if task is assigned to us
      try {
        const task = await this.avsContract.getTask(taskId);
        
        if (task.assignedOperator.toLowerCase() === this.wallet.address.toLowerCase()) {
          console.log(`✅ Task #${taskId} auto-assigned to me`);
          await this.processTask(taskId);
        } else if (task.status === 0) {
          // Still pending, try to pick it up
          console.log(`🎯 Task #${taskId} still pending, attempting to pick...`);
          await this.pickUpTask(taskId);
        } else {
          console.log(`⏭️  Task #${taskId} assigned to another operator`);
        }
      } catch (error) {
        console.error(`❌ Error checking task #${taskId}:`, error.message);
      }
    });
    
    this.avsContract.on('TaskAssigned', async (taskId, operator) => {
      if (operator.toLowerCase() === this.wallet.address.toLowerCase()) {
        console.log(`\n✅ Task #${taskId} assigned to me via event`);
        
        // Check if we're already processing this task
        if (!this.processingTasks.has(taskId.toString())) {
          await this.processTask(taskId);
        }
      }
    });
  }

  /**
   * Poll for pending tasks
   */
  async pollPendingTasks() {
    while (this.isRunning) {
      try {
        const tasks = await this.avsContract.getOperatorTasks(this.wallet.address);
        
        for (const taskId of tasks) {
          if (!this.processingTasks.has(taskId.toString())) {
            const task = await this.avsContract.getTask(taskId);
            
            // Status: 1 = Assigned, not yet validated
            if (task.status === 1) {
              await this.processTask(taskId);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error polling tasks:', error.message);
      }
      
      // Wait before next poll
      await this.sleep(config.pollInterval);
    }
  }

  /**
   * Pick up a task
   */
  async pickUpTask(taskId) {
    try {
      // Check if task is still pending
      const task = await this.avsContract.getTask(taskId);
      if (task.status !== 0) { // 0 = Pending
        console.log(`⏭️  Task #${taskId} already assigned (status: ${task.status})`);
        
        // If assigned to us, process it
        if (task.assignedOperator.toLowerCase() === this.wallet.address.toLowerCase() && task.status === 1) {
          console.log(`✅ Task #${taskId} is assigned to me, processing...`);
          await this.processTask(taskId);
        }
        return;
      }
      
      console.log(`📝 Picking task #${taskId}...`);
      const tx = await this.avsContract.pickTask(taskId, {
        gasLimit: 500000 // Set explicit gas limit
      });
      await tx.wait();
      
      console.log(`✅ Task #${taskId} picked successfully`);
      
      await this.processTask(taskId);
    } catch (error) {
      // Ignore "already assigned" errors
      if (error.message.includes('TaskAlreadyAssigned') || 
          error.message.includes('0x48780f5a') || 
          error.message.includes('0x27e1f1e5')) {
        console.log(`⏭️  Task #${taskId} already assigned to another operator`);
        
        // Check if it's assigned to us
        try {
          const task = await this.avsContract.getTask(taskId);
          if (task.assignedOperator.toLowerCase() === this.wallet.address.toLowerCase()) {
            console.log(`✅ Task #${taskId} is assigned to me, processing...`);
            await this.processTask(taskId);
          }
        } catch (checkError) {
          console.error(`❌ Error checking task assignment:`, checkError.message);
        }
      } else {
        console.error(`❌ Failed to pick task #${taskId}:`, error.message);
      }
    }
  }

  /**
   * Process a validation task
   */
  async processTask(taskId) {
    const taskIdStr = taskId.toString();
    
    if (this.processingTasks.has(taskIdStr)) {
      console.log(`⏭️  Task #${taskId} already being processed, skipping...`);
      return; // Already processing
    }
    
    this.processingTasks.add(taskIdStr);
    
    try {
      console.log(`\n🔍 Processing task #${taskId}...`);
      
      // Get task details with timeout
      const taskPromise = this.avsContract.getTask(taskId);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout getting task details')), 10000)
      );
      
      const task = await Promise.race([taskPromise, timeoutPromise]);
      
      console.log(`   PR Link: ${task.prLink}`);
      console.log(`   Developer: ${task.developer}`);
      
      // Get claim data to retrieve accessToken
      const issuesClaimAddress = await this.avsContract.issuesClaimContract();
      const issuesClaimABI = [
        'function claims(uint256,uint256) view returns (string, bool, address, bool, uint256, string)'
      ];
      const issuesClaimContract = new ethers.Contract(
        issuesClaimAddress,
        issuesClaimABI,
        this.provider
      );
      
      // Use BigNumber directly, don't convert to number
      const issueId = ethers.BigNumber.from(task.issueId);
      const claimIndex = ethers.BigNumber.from(task.claimIndex);
      
      console.log(`   Issue ID: ${issueId.toString()}, Claim Index: ${claimIndex.toString()}`);
      
      // Call claims and get raw result (array format)
      const claimResult = await issuesClaimContract.claims(issueId, claimIndex);
      
      // Access by index: [0]=prLink, [1]=isMerged, [2]=developer, [3]=isValidated, [4]=timestamp, [5]=accessToken
      const accessToken = claimResult[5] || claimResult.accessToken || '';
      
      console.log(`   Access Token: ${accessToken ? '***' + accessToken.slice(-4) : '(none)'}`);
      
      // Verify PR using zkTLS with accessToken
      const { isValid, zkProof } = await this.verifyPRWithZKTLS(task.prLink, accessToken);
      
      console.log(`   Validation Result: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
      
      // Submit validation
      await this.submitValidation(taskId, isValid, zkProof);
      
      console.log(`✅ Task #${taskId} completed`);
    } catch (error) {
      console.error(`❌ Error processing task #${taskId}:`, error.message);
    } finally {
      this.processingTasks.delete(taskIdStr);
    }
  }

  /**
   * Verify PR merge status using zkTLS
   */
  async verifyPRWithZKTLS(prLink, accessToken) {
    try {
      console.log(`   🔐 Verifying with zkTLS...`);
      
      // Validate PR link
      const match = prLink.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
      if (!match) {
        throw new Error('Invalid GitHub PR link');
      }
      
      console.log(`   📡 Calling zkTLS API...`);
      console.log(`      URL: ${prLink}`);
      console.log(`      Token: ${accessToken ? '***' + accessToken.slice(-4) : '(none)'}`);
      
      // Call zkTLS API with GET request to /generate-proof endpoint
      const response = await axios.get(
        `${config.zkTLSApiUrl}/generate-proof?url=${encodeURIComponent(prLink)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken || process.env.ZKTLS_ACCESS_TOKEN || ''}`,
          },
          timeout: 120000, // 2 minutes timeout for proof generation
        }
      );
      
      console.log(`   📦 Response received (status: ${response.status})`);
      
      const { prProofData, userProofData } = response.data;
      
      if (!prProofData || !userProofData) {
        console.log(`   ❌ Invalid response structure`);
        console.log(`      Expected: { prProofData, userProofData }`);
        console.log(`      Got keys:`, Object.keys(response.data));
        throw new Error('Invalid response format from zkTLS API');
      }
      
      // Extract and verify data from zkTLS proof (same logic as frontend)
      console.log(`   🔍 Verifying proof data...`);
      
      // Parse contexts from proof data (same as frontend)
      const proofString = JSON.stringify({ prProofData, userProofData });
      
      // Extract context strings using regex (same as frontend)
      const contextRegex = /"context":\s*"({.*?})"/g;
      const matches = [...proofString.matchAll(contextRegex)];
      
      if (matches.length < 2) {
        throw new Error('Could not extract context from proof data');
      }
      
      // Parse extracted contexts (same as frontend)
      const parseJSONSafely = (jsonString) => {
        try {
          const cleanedString = jsonString.replace(/\\"/g, '"');
          return JSON.parse(cleanedString);
        } catch (error) {
          console.error('Error parsing JSON:', error);
          return {};
        }
      };
      
      const prProofDataContext = parseJSONSafely(matches[0][1]);
      const userProofDataContext = parseJSONSafely(matches[1][1]);
      
      // Convert to strings for regex matching (same as frontend)
      const prProofString = JSON.stringify(prProofDataContext);
      const userProofString = JSON.stringify(userProofDataContext);
      
      // Parse extracted parameters using regex (same as frontend)
      const mergedRegex = /"merged"\s*:\s*"(\w+)"/;
      const loginRegex = /"login"\s*:\s*"([^"]+)"/;
      const idRegex = /"id"\s*:\s*"(\d+)"/;
      
      const prMergedMatch = prProofString.match(mergedRegex);
      const prLoginMatch = prProofString.match(loginRegex);
      const prIdMatch = prProofString.match(idRegex);
      const userLoginMatch = userProofString.match(loginRegex);
      const userIdMatch = userProofString.match(idRegex);
      
      // Validation results (same as frontend)
      const isMerged = prMergedMatch ? prMergedMatch[1] === 'true' : false;
      const isValidUser = (prLoginMatch && userLoginMatch) 
        ? prLoginMatch[1] === userLoginMatch[1] 
        : false;
      const isValidId = (prIdMatch && userIdMatch) 
        ? prIdMatch[1] === userIdMatch[1] 
        : false;
      
      // Extract values for logging
      const githubUsername = prLoginMatch ? prLoginMatch[1] : 'unknown';
      const githubUserId = prIdMatch ? prIdMatch[1] : 'unknown';
      const userLogin = userLoginMatch ? userLoginMatch[1] : 'unknown';
      const userId = userIdMatch ? userIdMatch[1] : 'unknown';
      
      console.log(`   ✅ zkTLS Verification:`);
      console.log(`      - isMerged: ${isMerged}`);
      console.log(`      - isValidUser: ${isValidUser} (PR: ${githubUsername}, User: ${userLogin})`);
      console.log(`      - isValidId: ${isValidId} (PR: ${githubUserId}, User: ${userId})`);
      
      // Overall validation: all three must be true
      const isValid = isMerged && isValidUser && isValidId;
      
      console.log(`      - Overall Valid: ${isValid ? '✅' : '❌'}`);
      
      // Convert full proof to bytes for storage
      const zkProof = ethers.utils.hexlify(
        ethers.utils.toUtf8Bytes(JSON.stringify({
          prProof: prProofData,
          userProof: userProofData,
          verified: {
            isMerged,
            isValidUser,
            isValidId,
            githubUsername,
            githubUserId,
            userLogin,
            userId,
            timestamp: Date.now()
          }
        }))
      );
      
      return {
        isValid,
        zkProof,
        metadata: {
          isMerged,
          isValidUser,
          isValidId,
          githubUsername,
          githubUserId
        }
      };
    } catch (error) {
      console.error('   ❌ zkTLS verification failed:', error.message);
      if (error.response) {
        console.error('   📄 Response status:', error.response.status);
        console.error('   📄 Response data:', JSON.stringify(error.response.data, null, 2));
      }
      
      // Fallback to GitHub API
      return await this.fallbackVerification(prLink);
    }
  }

  /**
   * Fallback verification using GitHub API
   */
  async fallbackVerification(prLink) {
    try {
      console.log('   ⚠️  Using fallback verification...');
      
      const match = prLink.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
      if (!match) {
        return { isValid: false, zkProof: '0x' };
      }
      
      const [, owner, repo, prNumber] = match;
      
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'zkPull-Operator-Bot',
          },
        }
      );
      
      const merged = response.data.merged === true;
      
      return {
        isValid: merged,
        zkProof: ethers.utils.hexlify(
          ethers.utils.toUtf8Bytes(JSON.stringify({ fallback: true, merged }))
        ),
      };
    } catch (error) {
      console.error('   ❌ Fallback verification failed:', error.message);
      return { isValid: false, zkProof: '0x' };
    }
  }

  /**
   * Submit validation result to AVS
   */
  async submitValidation(taskId, isValid, zkProof) {
    try {
      console.log(`   📤 Submitting validation...`);
      
      const tx = await this.avsContract.submitValidation(
        taskId,
        isValid,
        zkProof
      );
      
      console.log(`   ⏳ Waiting for confirmation...`);
      const receipt = await tx.wait();
      
      console.log(`   ✅ Validation submitted (tx: ${receipt.transactionHash})`);
    } catch (error) {
      console.error(`   ❌ Failed to submit validation:`, error.message);
      throw error;
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const bot = new ZKTLSOperatorBot();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Received SIGINT, shutting down...');
    await bot.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Received SIGTERM, shutting down...');
    await bot.stop();
    process.exit(0);
  });
  
  // Start the bot
  await bot.start();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { ZKTLSOperatorBot };
