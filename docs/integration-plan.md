# Integration Plan

This document defines the step-by-step plan for integrating the components built by Member 1 and Member 2.

## Phase 1: Independent Development
- **Member 1**: Develops Solidity smart contracts, sets up IPFS encryption pipelines, and scaffolds the Node.js backend.
- **Member 2**: Generates synthetic datasets, builds the Flower FL simulation with local hospital clients, and creates the React frontend UI shells.

## Phase 2: API Contracts
- Both members finalize and agree upon the endpoints defined in `docs/api-contract.md`.
- Member 1 provides mock responses on the backend for Member 2 to build against.

## Phase 3: Smart Contract ABI Integration
- Member 1 deploys contracts to the Polygon testnet.
- Member 1 delivers the ABI files and contract addresses to Member 2.
- Member 2 integrates Web3/Ethers.js into the React frontend to interact with the deployed contracts.

## Phase 4: IPFS Integration
- Member 1 finalizes the data encryption schema and IPFS upload flow.
- Member 1 provides Member 2 with the exact JSON schema of the encrypted records.
- Member 2 implements the frontend logic to handle decentralized storage access.

## Phase 5: AI/FastAPI Integration
- Member 2 finalizes the federated training and exports the global model.
- Member 2 spins up the FastAPI inference service.
- The React frontend is wired to send inference requests to the FastAPI service using synthetic data.

## Phase 6: React Integration
- The React frontend is fully connected to all three external systems:
  1. Polygon (Smart Contracts via Web3)
  2. Node.js Backend (Marketplace/IPFS queries)
  3. FastAPI (AI Inference)

## Phase 7: End-to-End Testing
- Both members walk through the complete flow: 
  - Patient onboarding and consent -> Doctor requesting access -> AI running inference -> Marketplace token exchange.

---

## Deliverables

### What Member 1 Must Deliver to Member 2:
- Contract addresses
- ABIs
- Chain ID
- Backend URL
- API documentation
- IPFS record schema
- Authentication/authorization expectations
- Sample test data

### What Member 2 Must Deliver:
- Trained model
- Federated learning simulation
- FastAPI service
- OpenAPI specification
- React frontend
- AI integration tests

## Integration Checklist
- [ ] API contracts are finalized and mock endpoints provided.
- [ ] Smart contracts are deployed to Testnet.
- [ ] Contract addresses and ABIs are handed off to Member 2.
- [ ] IPFS encryption schema is handed off to Member 2.
- [ ] AI federated training round is completed successfully.
- [ ] FastAPI is running and serving predictions.
- [ ] React is connected to the Node.js Backend.
- [ ] React is connected to the Polygon contracts.
- [ ] React is connected to the FastAPI service.
- [ ] End-to-End demo flow is verified without exposing raw medical data on-chain.
