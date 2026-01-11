/**
 * Repository layer for registration blockchain interactions
 * Handles all contract read/write operations
 */

const { ethers } = require("ethers");
const { CONFIG, AVS_ABI, ERC20_ABI } = require("./register.constants");

class RegisterRepository {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.avsContract = new ethers.Contract(
      CONFIG.avsAddress,
      AVS_ABI,
      wallet
    );
    this.stakeToken = null;
  }

  /**
   * Initialize stake token contract
   */
  async initStakeToken() {
    if (!this.stakeToken) {
      const stakeTokenAddress = await this.avsContract.stakeToken();
      this.stakeToken = new ethers.Contract(
        stakeTokenAddress,
        ERC20_ABI,
        this.wallet
      );
    }
    return this.stakeToken;
  }

  async getStakeTokenAddress() {
    return await this.avsContract.stakeToken();
  }

  async getTokenSymbol() {
    const token = await this.initStakeToken();
    return await token.symbol();
  }

  async getOperator(address) {
    return await this.avsContract.getOperator(address);
  }

  async getTokenBalance(address) {
    const token = await this.initStakeToken();
    return await token.balanceOf(address);
  }

  async getTokenAllowance(owner, spender) {
    const token = await this.initStakeToken();
    return await token.allowance(owner, spender);
  }

  async approveToken(spender, amount) {
    const token = await this.initStakeToken();
    const tx = await token.approve(spender, amount);
    return await tx.wait();
  }

  async registerOperator(endpoint, stakeAmount) {
    const tx = await this.avsContract.registerOperator(endpoint, stakeAmount);
    return await tx.wait();
  }
}

module.exports = { RegisterRepository };
