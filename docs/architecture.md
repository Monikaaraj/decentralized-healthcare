# System Architecture

## 1. System Overview
The Decentralized Healthcare system is a privacy-preserving platform that combines blockchain identity and consent, decentralized storage, and a federated AI ecosystem. It enables patients to maintain ownership of their medical records while securely participating in a tokenized research marketplace.

## 2. Component Architecture
The architecture is heavily decoupled into two main areas of responsibility:
- **Member 1**: Blockchain, IPFS, and Node.js backend.
- **Member 2**: Federated AI, FastAPI inference service, and React frontend.

## 3. Blockchain Layer
Deployed on Polygon, smart contracts handle access control, patient consent management, identity, and token economics for the research marketplace.

## 4. IPFS Storage Layer
Provides immutable, decentralized storage for encrypted medical records.

## 5. Encryption Layer
Ensures all medical data is encrypted on the client side before being uploaded to IPFS. Keys are managed securely off-chain and never exposed to the blockchain.

## 6. Node.js Backend
Serves as an off-chain bridge for the tokenized research marketplace, handling metadata, indexing, and facilitating secure off-chain operations.

## 7. Federated Learning Architecture
A decentralized machine learning framework (utilizing Flower) ensuring that raw training data never leaves its original location.

## 8. Hospital Clients
Simulated clients (Hospital A, Hospital B, Hospital C) each holding a local silo of synthetic patient data. They train local models on this private data.

## 9. Flower Aggregator
A central server that coordinates training rounds. It collects updated model parameters from Hospital clients, applies FedAvg (Federated Averaging), and broadcasts the updated weights. It NEVER sees raw hospital data.

## 10. Global AI Model
The resulting unified model trained collaboratively without data centralization.

## 11. FastAPI Inference Service
A completely separate component from the FL Aggregator. It loads the finalized Global Model and exposes REST APIs for the React frontend to request risk predictions and anomaly detection on user-provided data. It NEVER receives hospital training datasets.

## 12. React Frontend
The main user interface for Patients, Doctors, and Researchers. It interacts with the Polygon blockchain (via wallets), the Node.js backend, and the FastAPI Inference Service.

## 13. Marketplace
A tokenized environment where researchers can request access to specific encrypted records, compensating patients for their consent via smart contracts and the Node.js backend.

## 14. Data Flow
1. **Training**: Local Hospital Data -> Local FL Client -> Model Parameters -> Flower Aggregator -> Global Model.
2. **Storage**: Patient Data -> Encryption -> IPFS -> Hash to Polygon.
3. **Inference**: Patient/Doctor Dashboard -> AI Inference Request -> FastAPI -> Prediction Result -> Dashboard.

## 15. Security Boundaries
- Strict separation between raw data storage (IPFS/Hospitals) and parameter aggregation.
- Blockchain holds only access rights and references (IPFS hashes).
- Backend APIs handle off-chain marketplace logic without decrypting data.

## 16. What Data is Stored Where
- **On-chain Data**: Patient identity hashes, consent mappings, token balances, IPFS hashes of encrypted files.
- **Off-chain Encrypted Data**: IPFS holds the encrypted synthetic medical records.
- **Local Hospital Data**: Raw synthetic training data stored strictly locally at Hospital A, B, and C.
- **Model Parameters**: Exchanged between local Hospital FL Clients and the Flower Aggregator.
- **AI Inference Requests**: Sent directly from the React frontend to the FastAPI service at runtime.

## 17. What Data is NEVER Stored on Blockchain
- Raw medical records or datasets.
- Plaintext personal identifiable information (PII).
- Encryption keys or private keys.

## 18. Trust Boundaries
- **Trustless**: Polygon Smart Contracts, IPFS protocol.
- **Trusted**: Node.js Backend, FastAPI Inference Service, Flower Aggregator (trusted only with parameters, not data).

## 19. Development Environment
- Local hardhat node or Polygon Testnet (Mumbai/Amoy).
- Local IPFS node.
- Local Node.js Express server.
- Local Flower FL simulation with simulated hospital datasets.
- Local FastAPI server and React dev server.

## 20. Production/Demo Deployment Architecture
- Smart contracts on Polygon Mainnet/Testnet.
- IPFS via Infura/Pinata.
- Hosted Node.js Backend and FastAPI Service.
- React Frontend hosted on Vercel/Netlify.
- Simulated Hospital nodes running as isolated processes or containers.
