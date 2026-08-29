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

# 3. Start Next.js frontend
echo "🌐 Starting Next.js Frontend Server..."
echo "👉 When it says 'Ready', open http://localhost:3000 in your browser!"
cd ../frontend
npm run dev

# Cleanup when user hits Ctrl+C
kill $NODE_PID
