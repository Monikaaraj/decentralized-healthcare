const { ethers } = require("ethers");

const pk = "ab60cab60b025e91014f02829ac7a923b9677212e2daaf704511dcd94d73af1f";

const rpcs = {
  "Sepolia": "https://rpc.sepolia.org",
  "Polygon Amoy": "https://rpc-amoy.polygon.technology",
  "Arbitrum Sepolia": "https://sepolia-rollup.arbitrum.io/rpc",
  "Base Sepolia": "https://sepolia.base.org",
  "Optimism Sepolia": "https://sepolia.optimism.io"
};

async function check() {
  for (const [name, url] of Object.entries(rpcs)) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      const wallet = new ethers.Wallet(pk, provider);
      const balance = await provider.getBalance(wallet.address);
      console.log(`${name}: ${ethers.formatEther(balance)}`);
    } catch (e) {
      console.log(`${name}: Error ${e.message}`);
    }
  }
}
check();
