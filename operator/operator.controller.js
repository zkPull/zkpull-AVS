/**
 * Controller layer for operator bot
 * Orchestrates event listeners and polling mechanisms
 */

const { ethers } = require("ethers");
const { OperatorRepository } = require("./operator.repository");
const { OperatorService } = require("./operator.service");
const { ZKTLSValidator } = require("./operator.validator");
const { CONFIG } = require("./operator.constants");

class ZKTLSOperatorBot {
  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
    this.wallet = new ethers.Wallet(CONFIG.privateKey, this.provider);

    this.repository = new OperatorRepository(this.provider, this.wallet);
    this.validator = new ZKTLSValidator();
    this.service = new OperatorService(
      this.repository,
      this.validator,
      this.wallet.address
    );

    this.isRunning = false;
  }

  async start() {
    console.log("🚀 Starting zkTLS Operator Bot...");
    console.log(`📍 Operator Address: ${this.wallet.address}`);
    console.log(`📍 AVS Contract: ${CONFIG.avsAddress}`);
    console.log(`📍 Endpoint: ${CONFIG.endpoint}`);

    await this._verifyRegistration();

    this.isRunning = true;

    this._startEventListeners();
    this._startTaskPolling();

    console.log("✅ Bot started successfully!");
  }

  async stop() {
    console.log("🛑 Stopping bot...");
    this.isRunning = false;
  }

  /**
   * Verify operator is registered
   */
  async _verifyRegistration() {
    try {
      const { taskCount } = await this.service.checkRegistration();
      console.log(`✅ Operator registered with ${taskCount} tasks`);
    } catch (error) {
      console.log("⚠️  Operator not registered. Please register first.");
      console.log("Run: node operator/register.js");
      process.exit(1);
    }
  }

  /**
   * Start event listeners for blockchain events
   */
  _startEventListeners() {
    console.log("👂 Listening for new tasks...");

    this.repository.onTaskCreated(
      async (taskId, issueId, claimIndex) =>
        await this._handleTaskCreated(taskId, issueId, claimIndex)
    );

    this.repository.onTaskAssigned(
      async (taskId, operator) => await this._handleTaskAssigned(taskId, operator)
    );
  }

  /**
   * Start polling for pending tasks
   */
  async _startTaskPolling() {
    while (this.isRunning) {
      try {
        const pendingTasks = await this.service.pollAssignedTasks();

        for (const taskId of pendingTasks) {
          await this.service.processTask(taskId);
        }
      } catch (error) {
        console.error("❌ Error polling tasks:", error.message);
      }

      await this._sleep(CONFIG.pollInterval);
    }
  }

  /**
   * Handle TaskCreated event
   */
  async _handleTaskCreated(taskId, issueId, claimIndex) {
    console.log(`\n📬 New task created: #${taskId}`);
    console.log(`   Issue: ${issueId}, Claim: ${claimIndex}`);

    await this.service.waitForAutoAssignment();

    try {
      const task = await this.repository.getTask(taskId);

      if (this.service.isAssignedToMe(task)) {
        console.log(`✅ Task #${taskId} auto-assigned to me`);
        await this.service.processTask(taskId);
      } else if (task.status === 0) {
        console.log(`🎯 Task #${taskId} still pending, attempting to pick...`);
        const result = await this.service.pickUpTask(taskId);
        if (result.picked || result.shouldProcess) {
          await this.service.processTask(taskId);
        }
      } else {
        console.log(`⏭️  Task #${taskId} assigned to another operator`);
      }
    } catch (error) {
      console.error(`❌ Error checking task #${taskId}:`, error.message);
    }
  }

  /**
   * Handle TaskAssigned event
   */
  async _handleTaskAssigned(taskId, operator) {
    if (operator.toLowerCase() === this.wallet.address.toLowerCase()) {
      console.log(`\n✅ Task #${taskId} assigned to me via event`);

      if (!this.service.processingTasks.has(taskId.toString())) {
        await this.service.processTask(taskId);
      }
    }
  }

  /**
   * Sleep helper
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { ZKTLSOperatorBot };
