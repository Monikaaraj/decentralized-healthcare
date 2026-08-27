# AEGIS-AI: Decentralized Ecosystem for Tokenized Medical Records and Federated AI Diagnostics

## Project Overview
* **Institution:** JSS Academy of Technical Education, Bengaluru (Affiliated with Visvesvaraya Technological University)
* **Team Members:** Monika C R (1JS23CI051), Rahul R (1JS23CI068)
* **Guide:** Ms. Sneha Y S
* **Panel Member:** Ms. Priyanka S

---

## Core Objectives & Problem Statement

* **Decentralized Health Identity (DID):** Implement a smart contract-based consent manager allowing patients to grant, revoke, and track access to their medical records in real time.
* **Privacy-Preserving Storage:** Integrate IPFS for off-chain storage of locally encrypted (AES-256) clinical files and scans, anchoring lightweight cryptographic hashes (CIDs) on the Polygon blockchain.
* **Federated Learning AI Engine:** Train local AI models across decentralized hospital nodes for anomaly detection and disease risk prediction without sharing raw patient records.
* **Data-to-Dignity Tokenization:** Monetize anonymized research data by converting research payments into hospital bill credits for low-income patients rather than speculative crypto tokens.
* **National Scalability:** Align directly with India's **Ayushman Bharat Digital Mission (ABDM)** for seamless, compliant deployment.

---

## System Architecture & End-to-End Working

The AEGIS-AI workflow coordinates data privacy, distributed storage, smart contract consent, and decentralized AI across several steps:

1. **Upload & Extract:** The patient uploads medical reports or scans via the Next.js/React web dashboard. Tesseract OCR processes and digitizes text data from the uploaded files.
2. **Encrypt & Store (Off-Chain):** Medical records are encrypted locally using AES-256 and uploaded to IPFS (InterPlanetary File System), ensuring raw health data stays off the main chain.
3. **Hash Generation & Blockchain Anchoring:** IPFS generates a unique Content Identifier (CID) hash. This hash and the patient's dynamic consent policies are anchored on the Polygon Layer-2 blockchain via Solidity smart contracts.
4. **Consent Management & Audit Trails:** The patient retains full authority over their data access registry, toggling permissions (grant/revoke) for specific doctors, hospitals, or research institutions. Every interaction is logged immutably on-chain.
5. **Authorized Retrieval:** When a doctor or researcher requests a file, the smart contract verifies authorization. Upon verification, the CID hash is released to fetch and decrypt the file from IPFS.
6. **Federated AI Diagnostics:** Hospital nodes train local machine learning models (TensorFlow/PyTorch) directly on their private Electronic Health Record (EHR) silos.
7. **Global Aggregation:** Only model weights and gradients are transmitted to the central Federated AI aggregator—raw patient data never leaves local hospital infrastructure.

---

## Technical Stack

* **Frontend:** React.js, Next.js (Patient, Doctor & Research Dashboards)
* **Blockchain & Web3:** Polygon (Layer-2), Hardhat, Solidity, Ethers.js, IPFS (Pinata), MetaMask (DID)
* **AI & Analytics:** TensorFlow, PyTorch, Tesseract OCR, Federated Learning Frameworks
* **Backend & Database:** FastAPI, Node.js, PostgreSQL, MongoDB

---

## Evaluation Plan & Baseline Comparisons

| Domain | Evaluation Metric | Baseline / Status Quo | AEGIS-AI Target |
| --- | --- | --- | --- |
| **Federated AI & Diagnostics** | Model Accuracy & F1-Score | Low accuracy/F1-score due to fragmented, single-institution data silos. | F1-Score matching centralized training with 100% privacy compliance and zero raw data transfer. |
| **Blockchain Efficiency** | Gas Fees & Transaction Latency | High Ethereum L1 fees ($5–$50+) and network congestion delays. | Polygon L2 execution with costs $\approx \$0.001$ per transaction and $<2$s block finality. |
| **Data Sovereignty & Consent** | Access Revocation Time & Auditability | Manual hospital ROI paperwork taking days or weeks. | Near-instant revocation ($<5$ seconds) with verifiable on-chain audit logs. |

---

## How to Run Locally

### 1. Start the Local Blockchain
```bash
cd contracts
npm install
npx hardhat node
```
*In a new terminal window:*
```bash
cd contracts
npx hardhat run scripts/deploy.js --network localhost
```

### 2. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser. Connect MetaMask to Localhost 8545 and import one of the Hardhat test accounts.
