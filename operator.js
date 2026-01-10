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
  zkTLSApiUrl: process.env.ZKTLS_API_URL || 'https://api.zktls.io',
};

// ABIs
const AVS_ABI = [
  'function pickTask(uint256 taskId) external',
  'function submitValidation(uint256 taskId, bool isValid, bytes zkProof) external',
  'function getTask(uint256 taskId) external view returns (tuple(uint256 taskId, uint256 issueId, uint256 claimIndex, string prLink, address developer, uint256 createdAt, uint8 status, address assignedOperator, bytes zkProof))',
  'function getOperatorTasks(address operator) external view returns (uint256[])',
  'function registerOperator(string endpoint) external payable',
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
      
      // Try to pick up the task
      await this.pickUpTask(taskId);
    });
    
    this.avsContract.on('TaskAssigned', async (taskId, operator) => {
      if (operator.toLowerCase() === this.wallet.address.toLowerCase()) {
        console.log(`\n✅ Task #${taskId} assigned to me`);
        await this.processTask(taskId);
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
      console.log(`🎯 Attempting to pick task #${taskId}...`);
      
      // Check if task is still pending
      const task = await this.avsContract.getTask(taskId);
      if (task.status !== 0) { // 0 = Pending
        console.log(`⏭️  Task #${taskId} already assigned or completed, skipping...`);
        return;
      }
      
      const tx = await this.avsContract.pickTask(taskId);
      await tx.wait();
      
      console.log(`✅ Task #${taskId} picked successfully`);
      
      await this.processTask(taskId);
    } catch (error) {
      // Ignore "already assigned" errors
      if (error.message.includes('TaskAlreadyAssigned') || error.message.includes('0x48780f5a')) {
        console.log(`⏭️  Task #${taskId} already assigned, skipping...`);
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
      return; // Already processing
    }
    
    this.processingTasks.add(taskIdStr);
    
    try {
      console.log(`\n🔍 Processing task #${taskId}...`);
      
      // Get task details
      const task = await this.avsContract.getTask(taskId);
      console.log(`   PR Link: ${task.prLink}`);
      console.log(`   Developer: ${task.developer}`);
      
      // Verify PR using zkTLS
      const { isValid, zkProof } = await this.verifyPRWithZKTLS(task.prLink);
      
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
  async verifyPRWithZKTLS(prLink) {
    try {
      console.log(`   🔐 Verifying with zkTLS...`);
      
      // Extract GitHub info from PR link
      const match = prLink.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
      if (!match) {
        throw new Error('Invalid GitHub PR link');
      }
      
      const [, owner, repo, prNumber] = match;
      
      // Call zkTLS API to verify PR merge status
      const response = await axios.post(`${config.zkTLSApiUrl}/verify-pr`, {
        owner,
        repo,
        prNumber,
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.ZKTLS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      
      const { merged, proof } = response.data;
      
      // Convert proof to bytes
      const zkProof = ethers.utils.hexlify(
        ethers.utils.toUtf8Bytes(JSON.stringify(proof))
      );
      
      return {
        isValid: merged === true,
        zkProof,
      };
    } catch (error) {
      console.error('   ❌ zkTLS verification failed:', error.message);
      
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
