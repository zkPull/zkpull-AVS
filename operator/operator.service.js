/**
 * Service layer for task processing business logic
 * Orchestrates validation flow and task management
 */

const { ethers } = require("ethers");
const {
  TASK_STATUS,
  TIMEOUTS,
  ERROR_CODES,
} = require("./operator.constants");

class OperatorService {
  constructor(repository, validator, operatorAddress) {
    this.repository = repository;
    this.validator = validator;
    this.operatorAddress = operatorAddress;
    this.processingTasks = new Set();
  }

  /**
   * Check if operator is registered in AVS
   */
  async checkRegistration() {
    const tasks = await this.repository.getOperatorTasks(this.operatorAddress);
    return { isRegistered: true, taskCount: tasks.length };
  }

  /**
   * Pick up a pending task
   */
  async pickUpTask(taskId) {
    const task = await this.repository.getTask(taskId);

    if (task.status !== TASK_STATUS.PENDING) {
      return await this._handleNonPendingTask(taskId, task);
    }

    console.log(`📝 Picking task #${taskId}...`);

    try {
      await this.repository.pickTask(taskId);
      console.log(`✅ Task #${taskId} picked successfully`);
      return { picked: true };
    } catch (error) {
      return await this._handlePickTaskError(taskId, error);
    }
  }

  /**
   * Process a validation task
   */
  async processTask(taskId) {
    const taskIdStr = taskId.toString();

    if (this.processingTasks.has(taskIdStr)) {
      console.log(`⏭️  Task #${taskId} already being processed, skipping...`);
      return;
    }

    this.processingTasks.add(taskIdStr);

    try {
      console.log(`\n🔍 Processing task #${taskId}...`);

      const task = await this.repository.getTask(taskId);
      this._logTaskDetails(task);

      const accessToken = await this._getAccessToken(task);
      console.log(
        `   Access Token: ${
          accessToken ? "***" + accessToken.slice(-4) : "(none)"
        }`
      );

      const { isValid, zkProof } = await this.validator.verifyPR(
        task.prLink,
        accessToken
      );

      console.log(
        `   Validation Result: ${isValid ? "✅ VALID" : "❌ INVALID"}`
      );

      await this._submitValidation(taskId, isValid, zkProof);

      console.log(`✅ Task #${taskId} completed`);
    } catch (error) {
      console.error(`❌ Error processing task #${taskId}:`, error.message);
      throw error;
    } finally {
      this.processingTasks.delete(taskIdStr);
    }
  }

  /**
   * Poll for assigned tasks
   */
  async pollAssignedTasks() {
    const tasks = await this.repository.getOperatorTasks(this.operatorAddress);

    const pendingTasks = [];
    for (const taskId of tasks) {
      if (!this.processingTasks.has(taskId.toString())) {
        const task = await this.repository.getTask(taskId);
        if (task.status === TASK_STATUS.ASSIGNED) {
          pendingTasks.push(taskId);
        }
      }
    }

    return pendingTasks;
  }

  /**
   * Check if task is assigned to this operator
   */
  isAssignedToMe(task) {
    return (
      task.assignedOperator.toLowerCase() === this.operatorAddress.toLowerCase()
    );
  }

  /**
   * Extract access token from claim data
   */
  async _getAccessToken(task) {
    const issueId = ethers.BigNumber.from(task.issueId);
    const claimIndex = ethers.BigNumber.from(task.claimIndex);

    console.log(
      `   Issue ID: ${issueId.toString()}, Claim Index: ${claimIndex.toString()}`
    );

    const claimResult = await this.repository.getClaim(issueId, claimIndex);

    // Access by index: [0]=prLink, [1]=isMerged, [2]=developer, [3]=isValidated, [4]=timestamp, [5]=accessToken
    return claimResult[5] || claimResult.accessToken || "";
  }

  /**
   * Submit validation result to AVS
   */
  async _submitValidation(taskId, isValid, zkProof) {
    console.log(`   📤 Operator AVS Submitting validation...`);

    const receipt = await this.repository.submitValidation(
      taskId,
      isValid,
      zkProof
    );

    console.log(`   ⏳ Waiting for confirmation...`);
    console.log(
      `   ✅ Validation submitted (Transaction Hash: ${receipt.transactionHash})`
    );
  }

  /**
   * Log task details
   */
  _logTaskDetails(task) {
    console.log(`   PR Link: ${task.prLink}`);
    console.log(`   Developer: ${task.developer}`);
  }

  /**
   * Handle task that is not in pending status
   */
  async _handleNonPendingTask(taskId, task) {
    console.log(
      `⏭️  Task #${taskId} already assigned (status: ${task.status})`
    );

    if (this.isAssignedToMe(task) && task.status === TASK_STATUS.ASSIGNED) {
      console.log(`✅ Task #${taskId} is assigned to me, processing...`);
      return { picked: false, shouldProcess: true };
    }

    return { picked: false, shouldProcess: false };
  }

  /**
   * Handle errors when picking up a task
   */
  async _handlePickTaskError(taskId, error) {
    const isAlreadyAssigned = ERROR_CODES.TASK_ALREADY_ASSIGNED.some((code) =>
      error.message.includes(code)
    );

    if (isAlreadyAssigned) {
      console.log(`⏭️  Task #${taskId} already assigned to another operator`);

      try {
        const task = await this.repository.getTask(taskId);
        if (this.isAssignedToMe(task)) {
          console.log(`✅ Task #${taskId} is assigned to me, processing...`);
          return { picked: false, shouldProcess: true };
        }
      } catch (checkError) {
        console.error(
          `❌ Error checking task assignment:`,
          checkError.message
        );
      }

      return { picked: false, shouldProcess: false };
    }

    console.error(`❌ Failed to pick task #${taskId}:`, error.message);
    throw error;
  }

  /**
   * Wait for auto-assignment to complete
   */
  async waitForAutoAssignment() {
    await this._sleep(TIMEOUTS.AUTO_ASSIGNMENT_WAIT);
  }

  /**
   * Sleep helper
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { OperatorService };
