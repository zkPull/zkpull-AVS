# Operator Registration Architecture

## Overview
Modular implementation of operator registration following SOLID principles and clean architecture patterns.

## Directory Structure

```
/register
├── index.js                    # Entry point
├── register.controller.js      # Registration flow orchestration
├── register.service.js         # Business logic
├── register.repository.js      # Blockchain contract interactions
└── register.constants.js       # Configuration and ABIs
```

## Architecture Layers

### 1. Constants Layer (`register.constants.js`)
- Environment configuration
- Contract ABIs (AVS, ERC20)
- Required environment variables
- No dependencies

### 2. Repository Layer (`register.repository.js`)
**Responsibility**: Blockchain data access
- AVS contract interactions
- ERC20 token operations (balance, allowance, approve)
- Contract initialization with lazy loading
- **Dependencies**: constants

### 3. Service Layer (`register.service.js`)
**Responsibility**: Business logic
- Registration eligibility checks
- Balance validation
- Allowance management
- Operator registration coordination
- **Dependencies**: constants, repository

### 4. Controller Layer (`register.controller.js`)
**Responsibility**: Flow orchestration
- Environment validation
- User interaction (console output)
- Step-by-step registration execution
- Error handling and exit codes
- **Dependencies**: repository, service, constants

### 5. Entry Point (`index.js`)
**Responsibility**: Application bootstrap
- Error boundary
- Main execution

## Registration Flow

```
Start
  ↓
Validate Environment
  ↓
Display Configuration
  ↓
Get Token Info
  ↓
Check Existing Registration → Already Registered? → Exit
  ↓ No
Validate Balance → Insufficient? → Exit with Error
  ↓ Sufficient
Ensure Allowance → Approve if needed
  ↓
Register Operator
  ↓
Display Success
```

## Design Principles

### Single Responsibility
- Repository: blockchain operations only
- Service: business rules only
- Controller: user flow only

### Dependency Inversion
- Controller depends on service abstraction
- Service depends on repository abstraction
- Dependencies injected via constructor

### Error Handling
- Repository: throws blockchain errors
- Service: propagates domain errors
- Controller: handles user-facing errors with proper exit codes

## Usage

```bash
# Using npm script
npm run register

# Direct execution
node register.js
```

## Required Environment Variables

```
MANTLE_SEPOLIA_RPC_URL      # RPC endpoint
OPERATOR_PRIVATE_KEY        # Private key
AVS_CONTRACT_ADDRESS        # AVS contract
OPERATOR_ENDPOINT           # Operator API endpoint
STAKE_AMOUNT               # Amount to stake (default: 100)
```
