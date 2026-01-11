/**
 * Repository layer for blockchain interactions
 * Handles all contract read/write operations
 */

const { ethers } = require("ethers");
const {
  CONFIG,
  AVS_ABI,
  ISSUES_CLAIM_ABI,
  GAS_LIMITS,
  TIMEOUTS,
} = require("./operator.constants");

class OperatorRepository {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.avsContract = new ethers.Contract(
      CONFIG.avsAddress,
      AVS_ABI,
      wallet
    );
    this.issuesClaimContract = null;
  }

  /**
   * Initialize IssuesClaim contract
   * Lazy loading pattern to avoid unnecessary initialization
   */
  async initIssuesClaimContract() {
    if (!this.issuesClaimContract) {
      const issuesClaimAddress = await this.avsContract.issuesClaimContract();
      this.issuesClaimContract = new ethers.Contract(
        issuesClaimAddress,
        ISSUES_CLAIM_ABI,
        this.provider
      );
    }
    return this.issuesClaimContract;
  }

  async getOperatorTasks(operatorAddress) {
    return await this.avsContract.getOperatorTasks(operatorAddress);
  }

  async getTask(taskId) {
    const taskPromise = this.avsContract.getTask(taskId);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Timeout getting task details")),
        TIMEOUTS.TASK_DETAILS
      )
    );
    return await Promise.race([taskPromise, timeoutPromise]);
  }

  async pickTask(taskId) {
    const tx = await this.avsContract.pickTask(taskId, {
      gasLimit: GAS_LIMITS.PICK_TASK,
    });
    return await tx.wait();
  }

  async submitValidation(taskId, isValid, zkProof) {
    const tx = await this.avsContract.submitValidation(
      taskId,
      isValid,
      zkProof
    );
    return await tx.wait();
  }

  async getClaim(issueId, claimIndex) {
    const contract = await this.initIssuesClaimContract();
    const issueIdBN = ethers.BigNumber.from(issueId);
    const claimIndexBN = ethers.BigNumber.from(claimIndex);
    return await contract.claims(issueIdBN, claimIndexBN);
  }

  /**
   * Subscribe to contract events
   */
  onTaskCreated(callback) {
    this.avsContract.on("TaskCreated", callback);
  }

  onTaskAssigned(callback) {
    this.avsContract.on("TaskAssigned", callback);
  }
}

module.exports = { OperatorRepository };
