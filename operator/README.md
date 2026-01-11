# zkTLS Operator Bot Architecture

## Overview
Modular implementation of the zkTLS Operator Bot following SOLID principles and clean architecture patterns.

## Directory Structure

```
/operator
├── index.js                    # Entry point and main execution
├── operator.controller.js      # Bot orchestration and event handling
├── operator.service.js         # Business logic and task processing
├── operator.repository.js      # Blockchain contract interactions
├── operator.validator.js       # zkTLS verification logic
└── operator.constants.js       # Configuration and constants
```

## Architecture Layers

### 1. Constants Layer (`operator.constants.js`)
- Configuration management
- Contract ABIs
- Status codes and timeouts
- No dependencies on other modules

### 2. Repository Layer (`operator.repository.js`)
**Responsibility**: Blockchain data access
- Contract initialization
- Read/write operations to AVS and IssuesClaim contracts
- Event subscription management
- **Dependencies**: constants

### 3. Validator Layer (`operator.validator.js`)
**Responsibility**: zkTLS proof verification
- API communication with zkTLS service
- Proof extraction and validation
- Data parsing and verification logic
- **Dependencies**: constants

### 4. Service Layer (`operator.service.js`)
**Responsibility**: Business logic orchestration
- Task lifecycle management
- Validation workflow coordination
- Task state tracking
- **Dependencies**: constants, repository, validator

### 5. Controller Layer (`operator.controller.js`)
**Responsibility**: Application control flow
- Bot initialization and lifecycle
- Event listener setup
- Polling mechanism
- Dependency injection and wiring
- **Dependencies**: repository, service, validator, constants

### 6. Entry Point (`index.js`)
**Responsibility**: Application bootstrap
- Process signal handling
- Error boundary
- Main execution

## Design Principles Applied

### Single Responsibility Principle
Each module has one clear purpose:
- Repository: data access only
- Validator: verification only
- Service: business logic only
- Controller: orchestration only

### Open/Closed Principle
- Easy to extend with new validators or repositories
- Core logic remains unchanged when adding features

### Dependency Inversion
- High-level modules (controller, service) depend on abstractions
- Low-level modules (repository, validator) are injected
- Dependencies flow from controller → service → repository/validator

### Interface Segregation
- Each module exposes only necessary methods
- No module depends on unused functionality

## Data Flow

```
Event/Poll → Controller → Service → Repository/Validator → Blockchain/API
                ↓            ↓
            Orchestration  Business Logic
```

## Error Handling Strategy

- Repository layer: throws on blockchain errors
- Validator layer: throws on verification failures (no fallback)
- Service layer: catches and logs, releases task lock
- Controller layer: handles graceful degradation

## State Management

- `processingTasks` Set in Service layer prevents duplicate processing
- No global state
- All state is instance-based

## Extension Points

To add new features:
1. New validators: implement in `operator.validator.js`
2. New contracts: extend `operator.repository.js`
3. New business rules: modify `operator.service.js`
4. New events: add handlers in `operator.controller.js`
