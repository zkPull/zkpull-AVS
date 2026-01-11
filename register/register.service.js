/**
 * Service layer for operator registration business logic
 * Orchestrates registration flow
 */

const { ethers } = require("ethers");
const { CONFIG } = require("./register.constants");

class RegisterService {
  constructor(repository, operatorAddress) {
    this.repository = repository;
    this.operatorAddress = operatorAddress;
  }

  /**
   * Check if operator is already registered
   */
  async checkExistingRegistration() {
    try {
      const operator = await this.repository.getOperator(this.operatorAddress);
      return {
        isRegistered: operator.isActive,
        operator,
      };
    } catch (error) {
      return { isRegistered: false, operator: null };
    }
  }

  /**
   * Validate token balance for staking
   */
  async validateBalance(stakeAmount) {
    const balance = await this.repository.getTokenBalance(
      this.operatorAddress
    );
    const stakeAmountWei = ethers.utils.parseEther(stakeAmount);

    return {
      hasEnough: balance.gte(stakeAmountWei),
      balance,
      required: stakeAmountWei,
    };
  }

  /**
   * Ensure token allowance is sufficient
   */
  async ensureAllowance(stakeAmount) {
    const stakeAmountWei = ethers.utils.parseEther(stakeAmount);
    const allowance = await this.repository.getTokenAllowance(
      this.operatorAddress,
      CONFIG.avsAddress
    );

    if (allowance.lt(stakeAmountWei)) {
      return await this.repository.approveToken(
        CONFIG.avsAddress,
        stakeAmountWei
      );
    }

    return { alreadyApproved: true };
  }

  /**
   * Register operator with AVS
   */
  async register(endpoint, stakeAmount) {
    const stakeAmountWei = ethers.utils.parseEther(stakeAmount);
    return await this.repository.registerOperator(endpoint, stakeAmountWei);
  }

  /**
   * Get token information
   */
  async getTokenInfo() {
    const address = await this.repository.getStakeTokenAddress();
    const symbol = await this.repository.getTokenSymbol();
    return { address, symbol };
  }
}

module.exports = { RegisterService };
