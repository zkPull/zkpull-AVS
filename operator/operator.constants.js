/**
 * Configuration and constants for zkTLS Operator
 */

require("dotenv").config();

const CONFIG = {
  rpcUrl: process.env.MANTLE_SEPOLIA_RPC_URL,
  privateKey: process.env.OPERATOR_PRIVATE_KEY,
  avsAddress: process.env.AVS_CONTRACT_ADDRESS,
  endpoint: process.env.OPERATOR_ENDPOINT || "http://localhost:3000",
  pollInterval: parseInt(process.env.POLL_INTERVAL) || 30000,
  zkTLSApiUrl:
    process.env.ZKTLS_API_URL || "https://zkpull-services.up.railway.app",
};

const AVS_ABI = [
  "function pickTask(uint256 taskId) external",
  "function submitValidation(uint256 taskId, bool isValid, bytes zkProof) external",
  "function getTask(uint256 taskId) external view returns (tuple(uint256 taskId, uint256 issueId, uint256 claimIndex, string prLink, address developer, uint256 createdAt, uint8 status, address assignedOperator, bytes zkProof))",
  "function getOperatorTasks(address operator) external view returns (uint256[])",
  "function registerOperator(string endpoint) external payable",
  "function issuesClaimContract() external view returns (address)",
  "event TaskCreated(uint256 indexed taskId, uint256 issueId, uint256 claimIndex)",
  "event TaskAssigned(uint256 indexed taskId, address indexed operator)",
];

const ISSUES_CLAIM_ABI = [
  "function claims(uint256,uint256) view returns (string, bool, address, bool, uint256, string)",
];

const TASK_STATUS = {
  PENDING: 0,
  ASSIGNED: 1,
  VALIDATED: 2,
};

const TIMEOUTS = {
  TASK_DETAILS: 10000,
  ZKTLS_API: 120000,
  AUTO_ASSIGNMENT_WAIT: 3000,
};

const GAS_LIMITS = {
  PICK_TASK: 500000,
};

const ERROR_CODES = {
  TASK_ALREADY_ASSIGNED: ["TaskAlreadyAssigned", "0x48780f5a", "0x27e1f1e5"],
};

module.exports = {
  CONFIG,
  AVS_ABI,
  ISSUES_CLAIM_ABI,
  TASK_STATUS,
  TIMEOUTS,
  GAS_LIMITS,
  ERROR_CODES,
};
