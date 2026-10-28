#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "🚀 ========================================================"
echo "   AEGIS-AI: Decentralized Ecosystem & Federated Diagnostics"
echo "   Master Orchestration Launcher"
echo "============================================================"

# Clean up any lingering background servers
echo "🧹 Cleaning up existing ports (8545, 3000, 3001, 8000)..."
pkill -f "hardhat node" || true
pkill -f "next dev" || true
pkill -f "uvicorn" || true

# Trap Ctrl+C to cleanly kill all spawned child processes
cleanup() {
    echo ""
    echo "🛑 Shutting down AEGIS-AI ecosystem..."
    kill $(jobs -p) 2>/dev/null || true
    echo "✅ All services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 1. Start Hardhat Blockchain Node
echo "📦 [1/4] Booting Local Blockchain (Hardhat on http://127.0.0.1:8545)..."
cd "$PROJECT_ROOT/contracts"
npx hardhat node > hardhat.log 2>&1 &
HARDHAT_PID=$!
sleep 4

# Deploy Smart Contracts
echo "⚙️  Deploying Smart Contracts (MedicalConsent, HealthToken, DataMarketplace)..."
HARDHAT_DISABLE_TELEMETRY=true npx hardhat run scripts/deploy.js --network localhost

echo "⛏️  Mining 1000 blocks to prevent MetaMask cache issues..."
curl -s -X POST --data '{"jsonrpc":"2.0","method":"hardhat_mine","params":["0x3E8"],"id":1}' \
     -H "Content-Type: application/json" http://127.0.0.1:8545 > /dev/null

# 2. Start Federated AI Engine API (FastAPI)
echo "🧠 [2/4] Starting Federated AI Diagnostics Engine (http://127.0.0.1:8000)..."
cd "$PROJECT_ROOT/federated_engine"
"$PROJECT_ROOT/backend/venv/bin/uvicorn" node_api:app --host 0.0.0.0 --port 8000 > ai_engine.log 2>&1 &
AI_PID=$!
sleep 2

# 3. Start NMC Doctor Verification Portal
echo "🩺 [3/4] Starting NMC Doctor Verification Portal (http://localhost:3001)..."
cd "$PROJECT_ROOT/nmc-portal"
npm run dev > nmc.log 2>&1 &
NMC_PID=$!
sleep 2

# 4. Start Aegis-AI Main Frontend
echo "🌐 [4/4] Starting Main Web Application (http://localhost:3000)..."
echo ""
echo "✨ ========================================================"
echo "   All AEGIS-AI Services are Live:"
echo "   - Main App:           http://localhost:3000"
echo "   - NMC Portal:         http://localhost:3001"
echo "   - Federated AI API:   http://localhost:8000/docs"
echo "   - Blockchain RPC:     http://127.0.0.1:8545"
echo "   (Press Ctrl+C to stop all services)"
echo "============================================================"
echo ""

cd "$PROJECT_ROOT/frontend"
npm run dev
