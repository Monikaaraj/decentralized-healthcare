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
  "function addRecordForPatient(address _patient, string memory _cid) external",
  "function grantConsent(address _doctor) public",
  "function revokeConsent(address _doctor) public",
  "function hasConsent(address _patient, address _doctor) public view returns (bool)",
  "function getPatientRecords(address _patient) public view returns (string[] memory)",
  "function getRecord(address _patient, uint256 _recordId) external view returns (string memory cid, address uploader, uint256 timestamp)",
  "function getRecordCount(address _patient) external view returns (uint256)"
];

const MARKETPLACE_ABI = [
  "function createBounty(string memory _description, uint256 _reward, uint256 _totalEscrow) public returns (uint256)",
  "function fulfillBounty(uint256 _bountyId, string memory _ipfsCID) public",
  "function cancelBounty(uint256 _bountyId) public",
  "function nextBountyId() public view returns (uint256)",
  "function bounties(uint256) public view returns (address creator, string description, uint256 rewardPerFulfillment, uint256 remainingEscrow, bool isActive)",
  "event BountyCreated(uint256 indexed bountyId, address indexed creator, string description, uint256 reward, uint256 totalEscrow)",
  "event BountyFulfilled(uint256 indexed bountyId, address indexed fulfiller, string ipfsCID, uint256 reward)"
];

const TOKEN_ABI = [
  "function requestTokens() public",
  "function approve(address spender, uint256 value) public returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Addresses from public Sepolia deployment
const CONTRACT_ADDRESS = "0x8aeECD13EAFed869e18655ba471D23a2906E5C62"; 
const TOKEN_ADDRESS = "0xcF57f721fc8a6C91ADdF1A014E1494eC700947Dc";
const MARKETPLACE_ADDRESS = "0xf0E5200c8A288Cd7EE5B0296bAeF5757fC983321";

export default function Home() {
  const [account, setAccount] = useState<string>("");
  const [contract, setContract] = useState<any>(null);
  const [tokenContract, setTokenContract] = useState<any>(null);
  const [marketplaceContract, setMarketplaceContract] = useState<any>(null);
  
  // Auth State
  const [loggedInUser, setLoggedInUser] = useState<any>(null);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authForm, setAuthForm] = useState({ username: "", password: "", role: "patient", walletAddress: "" });

  useEffect(() => {
    // Check for existing session
    const session = localStorage.getItem("aegis_session");
    if (session) {
      setLoggedInUser(JSON.parse(session));
    }
  }, []);

  const handleRegister = () => {
    if (!authForm.username || !authForm.password || !authForm.walletAddress) return alert("Fill all fields");
    const users = JSON.parse(localStorage.getItem("aegis_users") || "{}");
    if (users[authForm.username]) return alert("Username already exists");
    
    users[authForm.username] = authForm;
    localStorage.setItem("aegis_users", JSON.stringify(users));
    
    // Auto login
    localStorage.setItem("aegis_session", JSON.stringify(authForm));
    setLoggedInUser(authForm);
  };

  const handleLogin = () => {
    const users = JSON.parse(localStorage.getItem("aegis_users") || "{}");
    const user = users[authForm.username];
    if (user && user.password === authForm.password) {
      localStorage.setItem("aegis_session", JSON.stringify(user));
      setLoggedInUser(user);
    } else {
      alert("Invalid username or password");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("aegis_session");
    setLoggedInUser(null);
  };

  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        // Force MetaMask to switch to Sepolia (Chain ID 11155111 / 0xaa36a7)
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }], 
          });
        } catch (switchError: any) {
          // If the network is not added to MetaMask, add it automatically
          if (switchError.code === 4902) {
            await (window as any).ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: '0xaa36a7',
                  chainName: 'Sepolia test network',
                  rpcUrls: ['https://rpc.sepolia.org'],
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
        
        // Auto-fill wallet address for registration if they connect
        setAuthForm(prev => ({ ...prev, walletAddress: address }));

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
          
          <div className="flex items-center gap-4">
            {loggedInUser && (
              <div className="text-gray-400 text-sm hidden md:block">
                Logged in as <span className="text-white font-bold">{loggedInUser.username}</span> ({loggedInUser.role})
              </div>
            )}
            {loggedInUser && (
              <button 
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-full font-medium transition-all text-sm"
              >
                Logout
              </button>
            )}
            <button 
              onClick={connectWallet}
              className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-medium transition-all shadow-lg shadow-black/50 backdrop-blur-md flex items-center space-x-2"
            >
              <div className={`w-2 h-2 rounded-full ${account ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              <span>{account ? `${account.substring(0,6)}...${account.substring(38)}` : "Connect Wallet"}</span>
            </button>
          </div>
        </header>

        {!loggedInUser ? (
          <div className="max-w-md mx-auto bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-2xl border border-white/10 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold">{isLoginMode ? "Welcome Back" : "Create Account"}</h2>
              <p className="text-gray-400 text-sm mt-2">
                {isLoginMode ? "Log in to access your secure medical vault." : "Register to encrypt and store your records."}
              </p>
            </div>

            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Username (e.g. rahulr13)" 
                value={authForm.username}
                onChange={(e) => setAuthForm({...authForm, username: e.target.value.toLowerCase()})}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <input 
                type="password" 
                placeholder="Password" 
                value={authForm.password}
                onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
              
              {!isLoginMode && (
                <>
                  <select 
                    value={authForm.role}
                    onChange={(e) => setAuthForm({...authForm, role: e.target.value})}
                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors appearance-none"
                  >
                    <option value="patient">Patient</option>
                    <option value="doctor">Doctor</option>
                    <option value="researcher">Researcher</option>
                  </select>
                  <input 
                    type="text" 
                    placeholder="Wallet Address (Connect MetaMask to auto-fill)" 
                    value={authForm.walletAddress}
                    onChange={(e) => setAuthForm({...authForm, walletAddress: e.target.value})}
                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                  />
                </>
              )}

              <button 
                onClick={isLoginMode ? handleLogin : handleRegister}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg font-medium hover:opacity-90 transition-opacity text-white mt-4"
              >
                {isLoginMode ? "Sign In" : "Register Account"}
              </button>
            </div>

            <div className="mt-6 text-center text-sm text-gray-400">
              {isLoginMode ? "Don't have an account? " : "Already have an account? "}
              <button onClick={() => setIsLoginMode(!isLoginMode)} className="text-emerald-400 hover:underline">
                {isLoginMode ? "Create one" : "Log in"}
              </button>
            </div>
          </div>
        ) : !account ? (
           <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-24 h-24 mb-8 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-3xl border border-white/10 flex items-center justify-center">
              <Zap className="w-12 h-12 text-emerald-400" />
            </div>
            <h2 className="text-4xl font-bold mb-4">Connect Your Wallet</h2>
            <p className="text-gray-400 max-w-md text-lg">
              You are logged in as {loggedInUser.username}, but we need your Web3 wallet connected to interact with the blockchain.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {loggedInUser.role === "patient" && <PatientDashboard contract={contract} marketplaceContract={marketplaceContract} account={account} />}
            {loggedInUser.role === "doctor" && <DoctorDashboard contract={contract} account={account} />}
            {loggedInUser.role === "researcher" && <ResearchDashboard marketplaceContract={marketplaceContract} tokenContract={tokenContract} account={account} />}
          </div>
        )}
      </div>
    </main>
  );
}
