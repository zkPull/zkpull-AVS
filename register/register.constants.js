/**
 * Configuration and constants for operator registration
 */

require("dotenv").config();

const CONFIG = {
  rpcUrl: process.env.MANTLE_SEPOLIA_RPC_URL,
  privateKey: process.env.OPERATOR_PRIVATE_KEY,
  avsAddress: process.env.AVS_CONTRACT_ADDRESS,
  endpoint: process.env.OPERATOR_ENDPOINT || "http://localhost:3000",
  stakeAmount: process.env.STAKE_AMOUNT || "100",
};

const AVS_ABI = [
  "function registerOperator(string endpoint, uint256 stakeAmount) external",
  "function getOperator(address operator) external view returns (tuple(address operatorAddress, string endpoint, uint256 stake, bool isActive, uint256 tasksCompleted, uint256 tasksRejected, uint256 registeredAt))",
  "function stakeToken() external view returns (address)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
];

const REQUIRED_ENV_VARS = [
  "MANTLE_SEPOLIA_RPC_URL",
  "OPERATOR_PRIVATE_KEY",
  "AVS_CONTRACT_ADDRESS",
];

module.exports = {
  CONFIG,
  AVS_ABI,
  ERC20_ABI,
  REQUIRED_ENV_VARS,
};
