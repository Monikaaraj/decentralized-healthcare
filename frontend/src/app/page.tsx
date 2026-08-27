"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import PatientDashboard from "@/components/PatientDashboard";
import DoctorDashboard from "@/components/DoctorDashboard";
import ResearchDashboard from "@/components/ResearchDashboard";
import { Activity, ShieldCheck, Zap } from "lucide-react";

// Mock ABI for the MedicalConsent contract
const CONTRACT_ABI = [
  "function addRecord(string memory _cid) external",
  "function grantConsent(address _doctor) public",
  "function revokeConsent(address _doctor) public",
  "function hasConsent(address _patient, address _doctor) public view returns (bool)",
  "function getPatientRecords(address _patient) public view returns (string[] memory)"
];

const MARKETPLACE_ABI = [
  "function listData(string memory _ipfsCID, uint256 _price) public returns (uint256)",
  "function purchaseData(uint256 _listingId) public",
  "function listings(uint256) view returns (address patient, string ipfsCID, uint256 price, bool isActive)",
  "function nextListingId() view returns (uint256)",
  "event DataListed(uint256 indexed listingId, address indexed patient, string ipfsCID, uint256 price)"
];

const TOKEN_ABI = [
  "function requestTokens() public",
  "function approve(address spender, uint256 value) public returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Addresses from local hardhat deployment
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 
const TOKEN_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const MARKETPLACE_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

export default function Home() {
  const [account, setAccount] = useState<string>("");
  const [contract, setContract] = useState<any>(null);
  const [tokenContract, setTokenContract] = useState<any>(null);
  const [marketplaceContract, setMarketplaceContract] = useState<any>(null);
  const [activePortal, setActivePortal] = useState<"patient" | "doctor" | "research" | null>(null);

  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        // Force MetaMask to switch to Localhost 8545 (Chain ID 1337 / 0x539)
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x539' }], 
          });
        } catch (switchError: any) {
          // If the network is not added to MetaMask, add it automatically
          if (switchError.code === 4902) {
            await (window as any).ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: '0x539',
                  chainName: 'Localhost 8545',
                  rpcUrls: ['http://127.0.0.1:8545'],
                }
              ]
            });
          } else {
            throw switchError;
          }
        }

        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setAccount(address);

        setContract(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer));
        setTokenContract(new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer));
        setMarketplaceContract(new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer));
      } catch (err) {
        console.error("Failed to connect wallet", err);
      }
    } else {
      alert("Please install MetaMask to use this dApp!");
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          // Re-initialize contract with new signer
          const provider = new ethers.BrowserProvider((window as any).ethereum);
          provider.getSigner().then(signer => {
             setContract(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer));
             setTokenContract(new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer));
             setMarketplaceContract(new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer));
          });
        } else {
          setAccount("");
          setContract(null);
          setTokenContract(null);
          setMarketplaceContract(null);
        }
      };

      (window as any).ethereum.on("accountsChanged", handleAccountsChanged);
      
      // Also handle network changes by refreshing
      (window as any).ethereum.on("chainChanged", () => window.location.reload());

      return () => {
        (window as any).ethereum.removeListener("accountsChanged", handleAccountsChanged);
      };
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-white selection:bg-emerald-500/30 overflow-hidden relative">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-6xl mx-auto px-6 py-12 relative z-10">
        <header className="flex justify-between items-center mb-16">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
              AEGIS-AI
            </h1>
            <p className="text-gray-400 text-sm mt-1">Decentralized Healthcare Ecosystem</p>
          </div>
          
          <button 
            onClick={connectWallet}
            className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-medium transition-all shadow-lg shadow-black/50 backdrop-blur-md flex items-center space-x-2"
          >
            <div className={`w-2 h-2 rounded-full ${account ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            <span>{account ? `${account.substring(0,6)}...${account.substring(38)}` : "Connect Wallet"}</span>
          </button>
        </header>

        {account ? (
          <div className="space-y-8">
            <div className="flex justify-center mb-12">
              <div className="bg-white/5 p-1 rounded-full border border-white/10 flex space-x-1">
                <button 
                  onClick={() => setActivePortal("patient")}
                  className={`px-8 py-2 rounded-full text-sm font-medium transition-all duration-300 ${activePortal === "patient" ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'text-gray-400 hover:text-white'}`}
                >
                  Patient Portal
                </button>
                <button 
                  onClick={() => setActivePortal("doctor")}
                  className={`px-8 py-2 rounded-full text-sm font-medium transition-all duration-300 ${activePortal === "doctor" ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'text-gray-400 hover:text-white'}`}
                >
                  Doctor Portal
                </button>
                <button 
                  onClick={() => setActivePortal("research")}
                  className={`px-8 py-2 rounded-full text-sm font-medium transition-all duration-300 ${activePortal === "research" ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25' : 'text-gray-400 hover:text-white'}`}
                >
                  Research Portal
                </button>
              </div>
            </div>

            {activePortal === "patient" && <PatientDashboard contract={contract} marketplaceContract={marketplaceContract} account={account} />}
            {activePortal === "doctor" && <DoctorDashboard contract={contract} account={account} />}
            {activePortal === "research" && <ResearchDashboard marketplaceContract={marketplaceContract} tokenContract={tokenContract} account={account} />}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-24 h-24 mb-8 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-3xl border border-white/10 flex items-center justify-center">
              <svg className="w-12 h-12 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-4xl font-bold mb-4">Secure Medical Data</h2>
            <p className="text-gray-400 max-w-md text-lg">
              Connect your wallet to encrypt, anchor, and manage consent for your medical records on the blockchain.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
