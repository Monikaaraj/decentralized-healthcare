#!/bin/bash
echo "🚀 Starting Aegis-AI Local Environment..."

# Kill any existing hardhat/nextjs instances to prevent port conflicts
pkill -f "hardhat node"
pkill -f "next dev"

# 1. Start Hardhat node in the background
echo "📦 Booting up Local Blockchain (Hardhat)..."
cd contracts
npx hardhat node > hardhat.log 2>&1 &
NODE_PID=$!

# Wait for node to boot
sleep 3

# 2. Deploy contracts to local node
echo "⚙️ Deploying Smart Contracts to Localhost..."
HARDHAT_DISABLE_TELEMETRY=true npx hardhat run scripts/deploy.js --network localhost

echo "⛏️ Artificially mining 1000 blocks to prevent MetaMask caching errors..."
curl -s -X POST --data '{"jsonrpc":"2.0","method":"hardhat_mine","params":["0x3E8"],"id":1}' -H "Content-Type: application/json" http://127.0.0.1:8545 > /dev/null

# 3. Start Next.js frontend
echo "🌐 Starting Next.js Frontend Server..."
echo "👉 When it says 'Ready', open http://localhost:3000 in your browser!"
cd ../frontend
npm run dev

# Cleanup when user hits Ctrl+C
kill $NODE_PID
