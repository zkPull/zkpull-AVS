```
        _    ____       _ _    ___                       _                  __     ____  
  ____ | | _|  _ \ _   _| | |  / _ \ _ __   ___ _ __ __ _| |_ ___  _ __     / \   \ \  / / ___
 |_  / | |/ / |_) | | | | | | | | | | '_ \ / _ \ '__/ _` | __/ _ \| '__|   / _ \   \ \/ / / __|
  / /  |   <|  __/| |_| | | | | |_| | |_) |  __/ | | (_| | || (_) | |     / ___ \   \  /  \__ \
 /___| |_|\_\_|    \__,_|_|_|  \___/| .__/ \___|_|  \__,_|\__\___/|_|    /_/   \_\   \/   |___/
                                    |_|                                                          
```

# zkTLS AVS Operator Bot

Automated validator bot for zkPull protocol using AVS (Actively Validated Service) by EigenLayer.

## Overview

The operator bot automatically:
1. Listens for new validation tasks
2. Verifies GitHub PR merge status using zkTLS
3. Submits validation results to the AVS contract
4. Earns rewards for successful validations

## Prerequisites

- Node.js >= 16.0.0
- Mantle USD tokens for stake
- zkTLS API access (optional, has fallback)

## Installation

```bash
cd operator
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Fill in your configuration:
```env
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz
OPERATOR_PRIVATE_KEY=0x...
AVS_CONTRACT_ADDRESS=0x...
OPERATOR_ENDPOINT=https://your-operator.com
STAKE_AMOUNT=0.1
ZKTLS_API_URL=https://api.zktls.io
ZKTLS_API_KEY=your_api_key_here
```

## Usage

### 1. Register as Operator

```bash
npm run register
```

This will:
- Register your address as an operator
- Stake the specified amount of MNT
- Set your endpoint URL

### 2. Start the Bot

```bash
npm start
```

The bot will:
- Listen for new validation tasks
- Automatically pick up and process tasks
- Submit validation results
- Run continuously until stopped (Ctrl+C)

### 3. Deregister (Optional)

```bash
npm run deregister
```

This will:
- Deregister your operator
- Return your staked MNT

## How It Works

### Task Flow

```
1. New Claim Submitted
   ↓
2. AVS Creates Task
   ↓
3. Bot Picks Up Task
   ↓
4. Bot Verifies PR with zkTLS
   ↓
5. Bot Submits Validation
   ↓
6. AVS Executes Validation on IssuesClaim
   ↓
7. Developer Receives Reward (if valid)
```

### Verification Process

1. **zkTLS Verification** (Primary):
   - Calls zkTLS API to verify PR merge status
   - Generates cryptographic proof
   - Submits proof with validation

2. **Fallback Verification**:
   - If zkTLS API fails, uses GitHub API directly
   - Less secure but ensures system availability
   - Marked as fallback in proof data

## Monitoring

The bot logs all activities:

```
🚀 Starting zkTLS Operator Bot...
📍 Operator Address: 0x...
📍 AVS Contract: 0x...
✅ Bot started successfully!
👂 Listening for new tasks...

📬 New task created: #1
   Issue: 0, Claim: 0
🎯 Attempting to pick task #1...
✅ Task #1 picked successfully

🔍 Processing task #1...
   PR Link: https://github.com/user/repo/pull/123
   Developer: 0x...
   🔐 Verifying with zkTLS...
   Validation Result: ✅ VALID
   📤 Submitting validation...
   ⏳ Waiting for confirmation...
   ✅ Validation submitted (tx: 0x...)
✅ Task #1 completed
```

## Rewards

Operators earn rewards through:
- Task completion fees
- Staking rewards
- Protocol incentives

## Slashing

Operators can be slashed for:
- Submitting false validations
- Being offline for extended periods
- Malicious behavior

## Troubleshooting

### Bot won't start

```bash
# Check if registered
node -e "
const { ethers } = require('ethers');
const provider = new ethers.providers.JsonRpcProvider(process.env.MANTLE_SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY, provider);
console.log('Operator Address:', wallet.address);
"
```

### Tasks not being picked up

1. Check if other operators are faster
2. Increase poll interval
3. Check network connectivity
4. Verify AVS contract address

### Validation failures

1. Check zkTLS API key
2. Verify GitHub PR link format
3. Check network connectivity
4. Review bot logs for errors

## Development

### Run in development mode

```bash
node operator.js
```

### Test verification

```bash
node -e "
const bot = require('./operator.js');
const instance = new bot.ZKTLSOperatorBot();
instance.verifyPRWithZKTLS('https://github.com/user/repo/pull/123')
  .then(result => console.log(result));
"
```

## Production Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start operator.js --name zkpull-operator

# Monitor
pm2 logs zkpull-operator

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Using Docker

```bash
# Build image
docker build -t zkpull-operator .

# Run container
docker run -d \
  --name zkpull-operator \
  --env-file .env \
  --restart unless-stopped \
  zkpull-operator
```

### Using systemd

```bash
# Create service file
sudo nano /etc/systemd/system/zkpull-operator.service

# Add:
[Unit]
Description=zkPull Operator Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/operator
ExecStart=/usr/bin/node operator.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# Enable and start
sudo systemctl enable zkpull-operator
sudo systemctl start zkpull-operator
sudo systemctl status zkpull-operator
```

## Security Best Practices

1. **Private Key Security**:
   - Never commit private keys
   - Use hardware wallets for production
   - Rotate keys regularly

2. **API Keys**:
   - Keep zkTLS API keys secure
   - Use environment variables
   - Rotate keys periodically

3. **Network Security**:
   - Use HTTPS for all endpoints
   - Implement rate limiting
   - Monitor for suspicious activity

4. **Monitoring**:
   - Set up alerts for failures
   - Monitor stake balance
   - Track validation success rate

## License

MIT
