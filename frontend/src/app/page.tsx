"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import PatientDashboard from "@/components/PatientDashboard";
import DoctorDashboard from "@/components/DoctorDashboard";
import ResearchDashboard from "@/components/ResearchDashboard";
import { Activity, ShieldCheck, Zap, Globe, ChevronDown } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// Mock ABI for the MedicalConsent contract
const CONTRACT_ABI = [
  "function addRecord(string memory _cid) external",
  "function addRecordForPatient(address _patient, string memory _cid) external",
  "function grantConsent(address _doctor) public",
  "function revokeConsent(address _doctor) public",
  "function hasConsent(address _patient, address _doctor) public view returns (bool)",
  "function getPatientRecords(address _patient) public view returns (string[] memory)",
  "function getRecord(address _patient, uint256 _recordId) external view returns (string memory cid, address uploader, uint256 timestamp)",
  "function getRecordCount(address _patient) external view returns (uint256)",
  "function deleteRecord(uint256 _recordId) external"
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

// Addresses from Local Hardhat Node
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 
const TOKEN_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const MARKETPLACE_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

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
    <main className="min-h-screen bg-[#0A0A0A] text-white selection:bg-emerald-500/30 overflow-hidden relative">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-6xl mx-auto px-6 py-12 relative z-10">
        <header className="flex justify-between items-center mb-16">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
              {t("aegis_ai")}
            </h1>
            <p className="text-gray-400 text-sm mt-1">{t("decentralized_healthcare")}</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Premium Language Selector */}
            <div className="relative">
              <button 
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-medium transition-all shadow-lg backdrop-blur-md text-sm text-gray-300"
              >
                <Globe size={16} className="text-blue-400" />
                <span className="hidden sm:inline">{LANGUAGES.find(l => l.code === language)?.label || t("language")}</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isLangMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isLangMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-gray-900 border border-white/10 rounded-xl shadow-2xl py-2 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setLanguage(lang.code as any);
                        setIsLangMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${language === lang.code ? 'bg-blue-500/20 text-white font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {account && tokenContract && (
              <div className="text-emerald-400 font-bold bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20 text-sm flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
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
                className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-full font-medium transition-all text-sm"
              >
                {t("logout")}
              </button>
            )}
            <button 
              onClick={connectWallet}
              className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-medium transition-all shadow-lg shadow-black/50 backdrop-blur-md flex items-center space-x-2"
            >
              <div className={`w-2 h-2 rounded-full ${account ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              <span>{account ? `${account.substring(0,6)}...${account.substring(38)}` : t("connect_your_wallet")}</span>
            </button>
          </div>
        </header>

        {!loggedInUser ? (
          <div className="max-w-md mx-auto bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-2xl border border-white/10 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold">{isLoginMode ? t("welcome_back") : t("create_account")}</h2>
              <p className="text-gray-400 text-sm mt-2">
                {isLoginMode ? t("login_subtitle") : t("register_subtitle")}
              </p>
            </div>

            <div className="space-y-4">
              <input 
                type="text" 
                placeholder={t("username_placeholder")} 
                value={authForm.username}
                onChange={(e) => setAuthForm({...authForm, username: e.target.value.toLowerCase()})}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <input 
                type="password" 
                placeholder={t("password_placeholder")} 
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
                    <option value="patient">{t("patient")}</option>
                    <option value="doctor">{t("doctor")}</option>
                    <option value="researcher">{t("researcher")}</option>
                  </select>
                  <input 
                    type="text" 
                    placeholder={t("wallet_placeholder")} 
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
                {isLoginMode ? t("sign_in") : t("register_account")}
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
            <h2 className="text-4xl font-bold mb-4">{t("connect_your_wallet")}</h2>
            <p className="text-gray-400 max-w-md text-lg">
              {t("logged_in_as")} {loggedInUser.username}, {t("wallet_missing_desc") || "but we need your Web3 wallet connected to interact with the blockchain."}
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
