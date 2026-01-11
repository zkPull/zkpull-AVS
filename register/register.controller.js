/**
 * Controller for operator registration flow
 * Orchestrates the complete registration process
 */

const { ethers } = require("ethers");
const { RegisterRepository } = require("./register.repository");
const { RegisterService } = require("./register.service");
const { CONFIG, REQUIRED_ENV_VARS } = require("./register.constants");

class RegisterController {
  constructor() {
    this._validateEnvironment();

    this.provider = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
    this.wallet = new ethers.Wallet(CONFIG.privateKey, this.provider);
    this.repository = new RegisterRepository(this.provider, this.wallet);
    this.service = new RegisterService(this.repository, this.wallet.address);
  }

  async execute() {
    // Display ASCII art banner
    console.log("\n");
    console.log(`   ░███    ░██    ░██   ░██████        ░██████                                                ░██                        
  ░██░██   ░██    ░██  ░██   ░██      ░██   ░██                                               ░██                        
 ░██  ░██  ░██    ░██ ░██            ░██     ░██ ░████████   ░███████  ░██░████  ░██████   ░████████  ░███████  ░██░████ 
░█████████ ░██    ░██  ░████████     ░██     ░██ ░██    ░██ ░██    ░██ ░███           ░██     ░██    ░██    ░██ ░███     
░██    ░██  ░██  ░██          ░██    ░██     ░██ ░██    ░██ ░█████████ ░██       ░███████     ░██    ░██    ░██ ░██      
░██    ░██   ░██░██    ░██   ░██      ░██   ░██  ░███   ░██ ░██        ░██      ░██   ░██     ░██    ░██    ░██ ░██      
░██    ░██    ░███      ░██████        ░██████   ░██░█████   ░███████  ░██       ░█████░██     ░████  ░███████  ░██      
                                                 ░██                                                                     
                                                 ░██                                                                     
                                                                                                                         `)
    console.log("\n");
    console.log("🚀 Registering as zkTLS Operator...\n");

    await this._displayConfiguration();

    const tokenInfo = await this.service.getTokenInfo();
    console.log(`🪙 Stake Token: ${tokenInfo.symbol} (${tokenInfo.address})\n`);

    const existing = await this._checkExistingRegistration(tokenInfo.symbol);
    if (existing) {
      return;
    }

    await this._validateBalance(tokenInfo.symbol);
    await this._ensureAllowance(tokenInfo.symbol);
    await this._register(tokenInfo.symbol);
  }

  /**
   * Validate required environment variables
   */
  _validateEnvironment() {
    const missing = REQUIRED_ENV_VARS.filter((varName) => !process.env[varName]);

    if (missing.length > 0) {
      console.error("❌ Missing required environment variables");
      console.error(`Required: ${missing.join(", ")}`);
      process.exit(1);
    }
  }

  /**
   * Display configuration
   */
  async _displayConfiguration() {
    console.log(`📍 Operator Address: ${this.wallet.address}`);
    console.log(`📍 AVS Contract: ${CONFIG.avsAddress}`);
    console.log(`📍 Endpoint: ${CONFIG.endpoint}`);
    console.log(`💰 Stake Amount: ${CONFIG.stakeAmount} mUSD\n`);
  }

  /**
   * Check if already registered
   */
  async _checkExistingRegistration(tokenSymbol) {
    const { isRegistered, operator } =
      await this.service.checkExistingRegistration();

    if (isRegistered) {
      console.log("✅ Already registered as operator!");
      console.log(
        `   Stake: ${ethers.utils.formatEther(operator.stake)} ${tokenSymbol}`
      );
      console.log(`   Tasks Completed: ${operator.tasksCompleted}`);
      console.log(`   Tasks Rejected: ${operator.tasksRejected}`);
      return true;
    }

    return false;
  }

  /**
   * Validate token balance
   */
  async _validateBalance(tokenSymbol) {
    const { hasEnough, balance, required } =
      await this.service.validateBalance(CONFIG.stakeAmount);

    console.log(
      `💰 Your ${tokenSymbol} balance: ${ethers.utils.formatEther(balance)}`
    );

    if (!hasEnough) {
      console.error(`\n❌ Insufficient ${tokenSymbol} balance!`);
      console.error(`   Required: ${CONFIG.stakeAmount} ${tokenSymbol}`);
      console.error(
        `   Available: ${ethers.utils.formatEther(balance)} ${tokenSymbol}`
      );
      process.exit(1);
    }
  }

  /**
   * Ensure token allowance
   */
  async _ensureAllowance(tokenSymbol) {
    console.log(`\n📝 Checking ${tokenSymbol} allowance...`);

    const result = await this.service.ensureAllowance(CONFIG.stakeAmount);

    if (result.alreadyApproved) {
      console.log("✅ Allowance already approved");
    } else {
      console.log(`⏳ Approval transaction: ${result.transactionHash}`);
      console.log("✅ Approval confirmed");
    }
  }

  /**
   * Register operator
   */
  async _register(tokenSymbol) {
    try {
      console.log("\n📝 Registering operator...");
      console.log("   Waiting for confirmation...");

      const receipt = await this.service.register(
        CONFIG.endpoint,
        CONFIG.stakeAmount
      );

      console.log("\n✅ Successfully registered as operator!");
      console.log(`   Transaction: ${receipt.transactionHash}`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Staked: ${CONFIG.stakeAmount} ${tokenSymbol}`);
      console.log("\n🎉 You can now start the operator bot:");
      console.log("   npm start");
    } catch (error) {
      console.error("\n❌ Registration failed:", error.message);
      throw error;
    }
  }
}

module.exports = { RegisterController };
