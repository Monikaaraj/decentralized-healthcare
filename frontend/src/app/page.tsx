"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import PatientDashboard from "@/components/PatientDashboard";
import DoctorDashboard from "@/components/DoctorDashboard";
import ResearchDashboard from "@/components/ResearchDashboard";
import { Activity, ShieldCheck, Zap, Globe, ChevronDown } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import Hero3D from "@/components/Hero3D";
import MerkleBatchUI from "@/components/MerkleBatchUI";
import FederatedLearningUI from "@/components/FederatedLearningUI";
import MarketplaceUI from "@/components/MarketplaceUI";

// Mock ABI for the MedicalConsent contract
const CONTRACT_ABI = [
  "function addRecord(string memory _cid) external",
  "function addRecordForPatient(address _patient, string memory _cid, string memory _doctorUsername) external",
  "function commitMerkleBatch(bytes32 _merkleRoot, address[] calldata _patients, string[] calldata _cids, string calldata _doctorUsername) external",
  "function verifyPrescriptionProof(bytes32 _merkleRoot, bytes32[] calldata _proof, address _patient, string calldata _cid, uint256 _timestamp) external view returns (bool)",
  "function grantConsent(address _doctor) public",
  "function revokeConsent(address _doctor) public",
  "function hasConsent(address _patient, address _doctor) public view returns (bool)",
  "function getPatientRecords(address _patient) public view returns (string[] memory)",
  "function getRecord(address _patient, uint256 _recordId) external view returns (string memory cid, address uploader, uint256 timestamp)",
  "function getRecordCount(address _patient) external view returns (uint256)",
  "function doctorProfiles(string) public view returns (string username, string name, string licenseNumber, bool hasApplied, bool isApproved, bool isRejected)",
  "function researcherProfiles(string) public view returns (string username, string name, string institution, string researchId, bool hasApplied, bool isApproved, bool isRejected)",
  "function resetDevData() external",
  "event DoctorApplied(string username, string name, string licenseNumber)",
  "event DoctorVerified(string username)",
  "event DoctorRejected(string username)",
  "event ResearcherApplied(string username, string name, string institution, string researchId)",
  "event ResearcherVerified(string username)",
  "event ResearcherRejected(string username)",
  "event DevDataReset()"
];

const MARKETPLACE_ABI = [
  "function createBounty(string memory _description, uint256 _reward, uint256 _totalEscrow) public returns (uint256)",
  "function fulfillBounty(uint256 _bountyId, string memory _ipfsCID) public",
  "function cancelBounty(uint256 _bountyId) public",
  "function nextBountyId() public view returns (uint256)",
  "function bounties(uint256) public view returns (address creator, string description, uint256 rewardPerFulfillment, uint256 remainingEscrow, bool isActive)",
  "function DOCTOR_ROYALTY_BPS() public view returns (uint256)",
  "event BountyCreated(uint256 indexed bountyId, address indexed creator, string description, uint256 reward, uint256 totalEscrow)",
  "event BountyFulfilled(uint256 indexed bountyId, address indexed fulfiller, string ipfsCID, uint256 reward, address indexed doctor, uint256 doctorRoyalty)"
];

const TOKEN_ABI = [
  "function requestTokens() public",
  "function approve(address spender, uint256 value) public returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Contract addresses — set via env vars (Vercel/production) or fallback to local Hardhat
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS ?? "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

export default function Home() {
  const [account, setAccount] = useState<string>("");
  const [contract, setContract] = useState<any>(null);
  const [tokenContract, setTokenContract] = useState<any>(null);
  const [marketplaceContract, setMarketplaceContract] = useState<any>(null);
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  
  // Auth State
  const [loggedInUser, setLoggedInUser] = useState<any>(null);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authForm, setAuthForm] = useState({ username: "", password: "", role: "patient", walletAddress: "" });
  const [docVerifStatus, setDocVerifStatus] = useState<"none" | "pending" | "verified">("none");

  const { language, setLanguage, t } = useLanguage();
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "hi", label: "Hindi (हिंदी)" },
    { code: "ta", label: "Tamil (தமிழ்)" },
    { code: "te", label: "Telugu (తెలుగు)" },
    { code: "bn", label: "Bengali (বাংলা)" },
    { code: "mr", label: "Marathi (मराठी)" },
    { code: "kn", label: "Kannada (ಕನ್ನಡ)" }
  ];

  useEffect(() => {
    // Check for existing session
    const session = localStorage.getItem("aegis_session");
    if (session) {
      setLoggedInUser(JSON.parse(session));
    }
  }, []);

  // Removed docVerifStatus from login page; it will be handled inside DoctorDashboard.
  
  useEffect(() => {
    const fetchBalance = async () => {
      if (tokenContract && account) {
        try {
          const balance = await tokenContract.balanceOf(account);
          setTokenBalance(ethers.formatUnits(balance, 18));
        } catch (e) {
          console.error("Failed to fetch balance", e);
        }
      }
    };
    
    fetchBalance();
    
    // Set up an interval to refresh balance every 10 seconds
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [tokenContract, account]);

  const handleRegister = () => {
    if (!authForm.username || !authForm.password || !authForm.walletAddress) return alert("Fill all fields");
    const users = JSON.parse(localStorage.getItem("aegis_users") || "{}");
    if (users[authForm.username]) return alert("Username already exists");
    
    users[authForm.username] = authForm;
    localStorage.setItem("aegis_users", JSON.stringify(users));
    
    // Auto login
    localStorage.setItem("aegis_session", JSON.stringify(authForm));
    setLoggedInUser(authForm);
    
    if (authForm.role === 'doctor') {
      window.open(`http://localhost:3001?doctor=${authForm.username}`, "_blank");
    } else if (authForm.role === 'researcher') {
      window.open(`http://localhost:3001?researcher=${authForm.username}`, "_blank");
    }
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

  const handleResetDevData = async () => {
    if (confirm("Are you sure you want to delete all registered accounts in this browser?")) {
      let activeContract = contract;
      
      // If wallet is not connected, try to get the signer directly
      if (!activeContract && typeof window !== "undefined" && (window as any).ethereum) {
        try {
          await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
          const provider = new ethers.BrowserProvider((window as any).ethereum);
          const signer = await provider.getSigner();
          activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        } catch (e) {
          console.error("Could not connect wallet for reset", e);
        }
      }

      if (activeContract) {
        try {
          const tx = await activeContract.resetDevData();
          await tx.wait();
        } catch (e) {
          console.warn("Silent failure: Blockchain reset failed (likely due to MetaMask block cache), but local accounts will still be cleared.");
        }
      } else {
        alert("Warning: MetaMask is not connected. The blockchain data cannot be reset!");
      }
      
      localStorage.removeItem("aegis_users");
      localStorage.removeItem("aegis_session");
      window.location.reload();
    }
  };

  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        // Request account access first
        await (window as any).ethereum.request({ method: 'eth_requestAccounts' });

        // Force MetaMask to switch to Hardhat Localhost (Chain ID 1337 / 0x539)
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x539' }], 
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await (window as any).ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: '0x539',
                  chainName: 'Hardhat Localhost',
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
    <main className="min-h-screen bg-[#0A0A0A] text-white selection:bg-emerald-500/30 overflow-hidden relative font-sans">
      <Hero3D />
      
      {/* Background Gradients (Kept for depth) */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-600/10 rounded-full blur-[150px] pointer-events-none z-0" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none z-0" />
      
      <div className="max-w-6xl mx-auto px-6 py-12 relative z-10 pointer-events-auto">
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex justify-between items-center mb-16"
        >
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
              {t("aegis_ai")}
            </h1>
            <p className="text-gray-400 text-sm mt-1 font-medium">{t("decentralized_healthcare")}</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Premium Language Selector */}
            <div className="relative">
              <button 
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                className="flex items-center gap-2 px-4 py-2.5 bg-black/40 hover:bg-black/60 border border-white/10 shadow-sm rounded-full font-medium transition-all backdrop-blur-md text-sm text-gray-300"
              >
                <Globe size={16} className="text-emerald-400" />
                <span className="hidden sm:inline">{LANGUAGES.find(l => l.code === language)?.label || t("language")}</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isLangMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isLangMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-black/90 border border-white/10 rounded-xl shadow-xl py-2 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-xl">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setLanguage(lang.code as any);
                        setIsLangMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${language === lang.code ? 'bg-emerald-500/20 text-emerald-400 font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {account && tokenContract && (
              <div className="text-emerald-400 font-bold bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20 text-sm flex items-center gap-2 shadow-sm">
                💰 {tokenBalance} HLTH
              </div>
            )}
            {loggedInUser && (
              <div className="text-gray-400 text-sm hidden md:block">
                {t("logged_in_as")} <span className="text-white font-bold">{loggedInUser.username}</span> ({t(loggedInUser.role)})
              </div>
            )}
            {loggedInUser && (
              <button 
                onClick={handleLogout}
                className="px-4 py-2 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-full font-medium transition-all text-sm"
              >
                {t("logout")}
              </button>
            )}
            <button 
              onClick={connectWallet}
              className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-full font-medium transition-all shadow-sm hover:bg-white/10 text-white flex items-center space-x-2"
            >
              <div className={`w-2 h-2 rounded-full ${account ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span>{account ? `${account.substring(0,6)}...${account.substring(38)}` : t("connect_your_wallet")}</span>
            </button>
          </div>
        </motion.header>

        <AnimatePresence mode="wait">
          {!loggedInUser ? (
            <motion.div 
              key="login"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
              className="max-w-md mx-auto bg-white/5 border border-white/10 shadow-2xl rounded-2xl p-8 backdrop-blur-2xl relative overflow-hidden group text-white"
            >
              {/* Animated soft border effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 blur-xl pointer-events-none" />
            <div className="text-center mb-8 relative z-10">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-2xl border border-white/10 flex items-center justify-center shadow-inner">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">{isLoginMode ? t("welcome_back") : t("create_account")}</h2>
              <p className="text-gray-400 text-sm mt-2 font-medium">
                {isLoginMode ? t("login_subtitle") : t("register_subtitle")}
              </p>
            </div>

            <div className="space-y-4 relative z-10">
              <input 
                type="text" 
                placeholder={t("username_placeholder")} 
                value={authForm.username}
                onChange={(e) => setAuthForm({...authForm, username: e.target.value.toLowerCase()})}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm placeholder-gray-500"
              />
              <input 
                type="password" 
                placeholder={t("password_placeholder")} 
                value={authForm.password}
                onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm placeholder-gray-500"
              />
              
              {!isLoginMode && (
                <>
                  <select 
                    value={authForm.role}
                    onChange={(e) => setAuthForm({...authForm, role: e.target.value})}
                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm appearance-none cursor-pointer"
                  >
                    <option value="patient">{t("patient")}</option>
                    <option value="doctor">{t("doctor")}</option>
                    <option value="researcher">{t("researcher")}</option>
                  </select>
                  <input 
                    type="text" 
                    placeholder={t("wallet_placeholder")} 
                    value={authForm.walletAddress}
                    onChange={(e) => setAuthForm({...authForm, walletAddress: e.target.value})}
                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm text-sm placeholder-gray-500"
                  />
                </>
              )}

              {authForm.username === 'admin' ? (
                <a 
                  href="http://localhost:3001?admin=true"
                  className="block w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg font-medium hover:opacity-90 transition-opacity text-white mt-4 text-center shadow-lg shadow-blue-500/25"
                >
                  Sign in to NMC Portal (Admin)
                </a>
              ) : (
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={isLoginMode ? handleLogin : handleRegister}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg font-medium hover:opacity-90 transition-opacity text-white mt-4 shadow-lg shadow-emerald-500/25"
                >
                  {isLoginMode ? t("sign_in") : (authForm.role === 'doctor' ? "Register & Verify via NMC" : t("register_account"))}
                </motion.button>
              )}
            </div>

            <div className="mt-6 text-center text-sm text-gray-400 space-y-4 relative z-10">
              <div>
                {isLoginMode ? "Don't have an account? " : "Already have an account? "}
                <button onClick={() => setIsLoginMode(!isLoginMode)} className="text-emerald-400 font-medium hover:underline">
                  {isLoginMode ? "Create one" : "Log in"}
                </button>
              </div>
              
              <button 
                onClick={handleResetDevData} 
                className="text-xs text-rose-400/70 hover:text-rose-400 font-medium transition-colors border border-rose-500/20 bg-rose-500/5 shadow-sm rounded-full px-3 py-1 hover:bg-rose-500/10"
              >
                Reset All Local Accounts (Dev)
              </button>
            </div>
            </motion.div>
          ) : !account ? (
             <motion.div 
               key="connect"
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -20 }}
               className="flex flex-col items-center justify-center py-32 text-center"
             >
            <div className="w-24 h-24 mb-8 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-3xl border border-white/10 flex items-center justify-center shadow-lg">
              <Zap className="w-12 h-12 text-emerald-400" />
            </div>
            <h2 className="text-4xl font-bold mb-4 text-white">{t("connect_your_wallet")}</h2>
            <p className="text-gray-400 max-w-md text-lg font-medium">
              {t("logged_in_as")} {loggedInUser.username}, {t("wallet_missing_desc") || "but we need your Web3 wallet connected to interact with the blockchain."}
            </p>
            </motion.div>
          ) : (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="space-y-8"
            >
            {loggedInUser.role === "patient" && <PatientDashboard contract={contract} marketplaceContract={marketplaceContract} account={account} />}
            {loggedInUser.role === "doctor" && <DoctorDashboard contract={contract} account={account} username={loggedInUser.username} />}
            {loggedInUser.role === "researcher" && <ResearchDashboard contract={contract} marketplaceContract={marketplaceContract} tokenContract={tokenContract} account={account} username={loggedInUser.username} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
