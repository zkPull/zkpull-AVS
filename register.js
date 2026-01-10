#!/usr/bin/env node

/**
 * Register as zkTLS Operator
 */

const { ethers } = require('ethers');
require('dotenv').config();

const AVS_ABI = [
  'function registerOperator(string endpoint, uint256 stakeAmount) external',
  'function getOperator(address operator) external view returns (tuple(address operatorAddress, string endpoint, uint256 stake, bool isActive, uint256 tasksCompleted, uint256 tasksRejected, uint256 registeredAt))',
  'function stakeToken() external view returns (address)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function symbol() external view returns (string)',
];

async function main() {
  console.log('🚀 Registering as zkTLS Operator...\n');
  
  // Configuration
  const rpcUrl = process.env.MANTLE_SEPOLIA_RPC_URL;
  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  const avsAddress = process.env.AVS_CONTRACT_ADDRESS;
  const endpoint = process.env.OPERATOR_ENDPOINT || 'http://localhost:3000';
  const stakeAmount = process.env.STAKE_AMOUNT || '100'; // 100 mUSD
  
  if (!rpcUrl || !privateKey || !avsAddress) {
    console.error('❌ Missing required environment variables');
    console.error('Required: MANTLE_SEPOLIA_RPC_URL, OPERATOR_PRIVATE_KEY, AVS_CONTRACT_ADDRESS');
    process.exit(1);
  }
  
  // Setup
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const avsContract = new ethers.Contract(avsAddress, AVS_ABI, wallet);
  
  console.log(`📍 Operator Address: ${wallet.address}`);
  console.log(`📍 AVS Contract: ${avsAddress}`);
  console.log(`📍 Endpoint: ${endpoint}`);
  console.log(`💰 Stake Amount: ${stakeAmount} mUSD\n`);
  
  // Get stake token address
  const stakeTokenAddress = await avsContract.stakeToken();
  const stakeToken = new ethers.Contract(stakeTokenAddress, ERC20_ABI, wallet);
  const tokenSymbol = await stakeToken.symbol();
  
  console.log(`🪙 Stake Token: ${tokenSymbol} (${stakeTokenAddress})\n`);
  
  // Check if already registered
  try {
    const operator = await avsContract.getOperator(wallet.address);
    if (operator.isActive) {
      console.log('✅ Already registered as operator!');
      console.log(`   Stake: ${ethers.utils.formatEther(operator.stake)} ${tokenSymbol}`);
      console.log(`   Tasks Completed: ${operator.tasksCompleted}`);
      console.log(`   Tasks Rejected: ${operator.tasksRejected}`);
      return;
    }
  } catch (error) {
    // Not registered yet
  }
  
  // Check token balance
  const balance = await stakeToken.balanceOf(wallet.address);
  const stakeAmountWei = ethers.utils.parseEther(stakeAmount);
  
  console.log(`💰 Your ${tokenSymbol} balance: ${ethers.utils.formatEther(balance)}`);
  
  if (balance.lt(stakeAmountWei)) {
    console.error(`\n❌ Insufficient ${tokenSymbol} balance!`);
    console.error(`   Required: ${stakeAmount} ${tokenSymbol}`);
    console.error(`   Available: ${ethers.utils.formatEther(balance)} ${tokenSymbol}`);
    process.exit(1);
  }
  
  // Check and approve token spending
  const allowance = await stakeToken.allowance(wallet.address, avsAddress);
  
  if (allowance.lt(stakeAmountWei)) {
    console.log(`\n📝 Approving ${tokenSymbol} spending...`);
    
    const approveTx = await stakeToken.approve(avsAddress, stakeAmountWei);
    console.log(`⏳ Approval transaction: ${approveTx.hash}`);
    await approveTx.wait();
    console.log('✅ Approval confirmed');
  }
  
  // Register
  try {
    console.log('\n📝 Registering operator...');
    
    const tx = await avsContract.registerOperator(endpoint, stakeAmountWei);
    
    console.log(`⏳ Transaction sent: ${tx.hash}`);
    console.log('   Waiting for confirmation...');
    
    const receipt = await tx.wait();
    
    console.log(`\n✅ Successfully registered as operator!`);
    console.log(`   Transaction: ${receipt.transactionHash}`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Staked: ${stakeAmount} ${tokenSymbol}`);
    console.log(`\n🎉 You can now start the operator bot:`);
    console.log(`   npm start`);
  } catch (error) {
    console.error('\n❌ Registration failed:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
