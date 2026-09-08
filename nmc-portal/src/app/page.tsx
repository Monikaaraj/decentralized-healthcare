"use client";

import { useState, useEffect, Suspense } from "react";
import { ethers } from "ethers";
import { ShieldCheck, UserCheck, Stethoscope, Clock, CheckCircle } from "lucide-react";
import { useSearchParams } from 'next/navigation';

// Mock ABI for MedicalConsent
const CONTRACT_ABI = [
  "function applyForVerification(string memory _username, string memory _name, string memory _licenseNumber) external",
  "function approveDoctor(string memory _username) external",
  "function rejectDoctor(string memory _username) external",
  "function getAllDoctors() external view returns (string[] memory)",
  "function doctorProfiles(string) public view returns (string username, string name, string licenseNumber, bool hasApplied, bool isApproved, bool isRejected)",
  "event DoctorApplied(string username, string name, string licenseNumber)",
  "event DoctorVerified(string username)",
  "event DoctorRejected(string username)",
  "event DevDataReset()"
];

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 
// Note: Hardhat Account #0 is typically the deployer/owner.
const ADMIN_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266".toLowerCase();

export default function NMCPortal() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
      <NMCContent />
    </Suspense>
  );
}

function NMCContent() {
  const searchParams = useSearchParams();
  const isAdminUrl = searchParams.get('admin') === 'true';
  const doctorUsername = searchParams.get('doctor');

  const [account, setAccount] = useState<string>("");
  const [contract, setContract] = useState<any>(null);
  
  // Doctor Apply State
  const [applyForm, setApplyForm] = useState({ name: "", licenseNumber: "" });
  const [hasApplied, setHasApplied] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  
  // Admin State
  const [pendingDoctors, setPendingDoctors] = useState<any[]>([]);

  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setAccount(address.toLowerCase());
        setContract(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer));
      } catch (err) {
        console.error("Failed to connect wallet", err);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  useEffect(() => {
    if (contract) {
      if (doctorUsername) {
        checkStatus();
      }
      if (isAdminUrl) {
        fetchPendingDoctors();
      }
      
      const onApplied = () => {
        if (isAdminUrl) fetchPendingDoctors();
        else if (doctorUsername) checkStatus();
      };
      
      const onVerified = (username: string) => {
        if (doctorUsername && username.toLowerCase() === doctorUsername.toLowerCase()) {
          setIsApproved(true);
          setIsRejected(false);
        }
        if (isAdminUrl) fetchPendingDoctors();
      }

      const onRejected = (username: string) => {
        if (doctorUsername && username.toLowerCase() === doctorUsername.toLowerCase()) {
          setIsRejected(true);
          setIsApproved(false);
        }
        if (isAdminUrl) fetchPendingDoctors();
      }

      const onReset = () => {
        window.location.reload();
      }
      
      contract.on("DoctorApplied", onApplied);
      contract.on("DoctorVerified", onVerified);
      contract.on("DoctorRejected", onRejected);
      contract.on("DevDataReset", onReset);
      return () => {
        contract.off("DoctorApplied", onApplied);
        contract.off("DoctorVerified", onVerified);
        contract.off("DoctorRejected", onRejected);
        contract.off("DevDataReset", onReset);
      }
    }
  }, [contract, account, isAdminUrl, doctorUsername]);

  const checkStatus = async () => {
    if (!doctorUsername) return;
    try {
      const profile = await contract.doctorProfiles(doctorUsername);
      setHasApplied(profile.hasApplied);
      setIsApproved(profile.isApproved);
      setIsRejected(profile.isRejected);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPendingDoctors = async () => {
    try {
      const usernames = await contract.getAllDoctors();
      const pending = [];
      for (let i = 0; i < usernames.length; i++) {
        const username = usernames[i];
        const profile = await contract.doctorProfiles(username);
        if (profile.hasApplied && !profile.isApproved && !profile.isRejected) {
          pending.push({
            username: username,
            name: profile.name,
            license: profile.licenseNumber
          });
        }
      }
      setPendingDoctors(pending);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApply = async () => {
    if (!applyForm.name || !applyForm.licenseNumber || !doctorUsername) return alert("Fill all fields");
    try {
      const tx = await contract.applyForVerification(doctorUsername, applyForm.name, applyForm.licenseNumber);
      await tx.wait();
      setHasApplied(true);
      alert("Application submitted to NMC!");
    } catch (e) {
      console.error(e);
      alert("Transaction failed");
    }
  };

  const handleApprove = async (docUsername: string) => {
    try {
      const tx = await contract.approveDoctor(docUsername);
      await tx.wait();
      alert("Doctor Approved!");
      fetchPendingDoctors();
    } catch (e) {
      console.error(e);
      alert("Approval failed");
    }
  };

  const handleReject = async (docUsername: string) => {
    try {
      const tx = await contract.rejectDoctor(docUsername);
      await tx.wait();
      alert("Doctor Rejected.");
      fetchPendingDoctors();
    } catch (e) {
      console.error(e);
      alert("Rejection failed");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-blue-900 text-white p-6 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          <ShieldCheck size={32} className="text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">National Medical Commission</h1>
            <p className="text-blue-200 text-sm">Official Blockchain Verification Portal</p>
          </div>
        </div>
        <button 
          onClick={connectWallet}
          className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-full font-medium transition-colors shadow-inner border border-blue-400/30"
        >
          {account ? `${account.substring(0,6)}...${account.substring(38)}` : "Connect Wallet"}
        </button>
      </header>

      <div className="max-w-4xl mx-auto py-12 px-6">
        {!account ? (
          <div className="text-center py-20">
            <h2 className="text-3xl font-bold text-slate-800 mb-4">Welcome to the NMC Portal</h2>
            <p className="text-slate-500 mb-8 max-w-lg mx-auto">
              This is the official portal for doctors to apply for Web3 medical verification, and for NMC administrators to approve applications.
            </p>
            <button onClick={connectWallet} className="bg-blue-900 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-800 transition-colors shadow-lg">
              Connect MetaMask to Continue
            </button>
          </div>
        ) : isAdminUrl ? (
          <div>
            <div className="mb-8 flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2"><UserCheck className="text-blue-600"/> Admin Dashboard</h2>
              <div className="bg-blue-100 text-blue-800 px-4 py-1 rounded-full text-sm font-semibold border border-blue-200">
                {pendingDoctors.length} Pending Applications
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {pendingDoctors.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <CheckCircle size={48} className="mx-auto mb-4 text-emerald-400 opacity-50" />
                  <p>All caught up! No pending applications.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {pendingDoctors.map((doc, idx) => (
                    <li key={idx} className="p-6 hover:bg-slate-50 transition-colors flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-lg">{doc.name}</h3>
                        <p className="text-sm text-slate-500 mt-1">License: <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{doc.license}</span></p>
                        <p className="text-xs text-slate-400 mt-1 font-mono">Username: {doc.username}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleReject(doc.username)}
                          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                        >
                          Reject
                        </button>
                        <button 
                          onClick={() => handleApprove(doc.username)}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-sm"
                        >
                          Approve
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : doctorUsername ? (
          <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-xl border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-blue-900"></div>
            
            {hasApplied ? (
              <div className="text-center py-8">
                {isApproved ? (
                  <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                    <ShieldCheck size={40} />
                  </div>
                ) : isRejected ? (
                  <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                    <span className="text-3xl font-bold">X</span>
                  </div>
                ) : (
                  <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Clock size={40} className="animate-pulse" />
                  </div>
                )}
                
                <h3 className="text-2xl font-bold text-slate-800 mb-2">
                  {isApproved ? "Verification Complete!" : isRejected ? "Application Rejected" : "Application Received"}
                </h3>
                
                <p className="text-slate-600 mb-6">
                  {isApproved 
                    ? "Your NMC application has been approved. You are now officially verified on the blockchain."
                    : isRejected
                    ? "Your application was rejected by the NMC Administrator."
                    : "Your application has been submitted to the National Medical Commission and is currently under review."}
                </p>

                <div className="space-y-4 max-w-sm mx-auto mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold shadow-sm">✓</div>
                    <div className="text-sm font-medium text-slate-700">Application Submitted</div>
                  </div>
                  <div className="w-0.5 h-6 bg-slate-200 ml-4"></div>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${isApproved ? 'bg-emerald-500 text-white' : isRejected ? 'bg-red-500 text-white' : 'bg-blue-500 text-white animate-pulse'}`}>
                      {isApproved ? '✓' : isRejected ? 'X' : '⏳'}
                    </div>
                    <div className={`text-sm font-medium ${isRejected ? 'text-red-600' : 'text-slate-700'}`}>Admin Review</div>
                  </div>
                  <div className="w-0.5 h-6 bg-slate-200 ml-4"></div>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${isApproved ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {isApproved ? '✓' : '3'}
                    </div>
                    <div className={`text-sm font-medium ${isApproved ? 'text-slate-700' : 'text-slate-400'}`}>Verified on Blockchain</div>
                  </div>
                </div>

                <div className="mt-8 p-4 bg-slate-50 rounded-lg text-sm text-slate-500 border border-slate-100">
                  {isApproved ? "You can close this window and sign into the Aegis App!" : isRejected ? "Please contact support for more information." : "You can close this window. Your status will automatically update in the Aegis app once approved."}
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2"><Stethoscope className="text-blue-600"/> Apply for Verification</h2>
                <p className="text-slate-500 mb-8 text-sm">Submit your medical license details to the NMC to gain upload privileges on the Aegis network.</p>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Full Legal Name</label>
                    <input 
                      type="text" 
                      placeholder="Dr. Jane Doe"
                      value={applyForm.name}
                      onChange={e => setApplyForm({...applyForm, name: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Medical License Number</label>
                    <input 
                      type="text" 
                      placeholder="NMC-2023-8912"
                      value={applyForm.licenseNumber}
                      onChange={e => setApplyForm({...applyForm, licenseNumber: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <button 
                    onClick={handleApply}
                    className="w-full bg-blue-900 text-white font-medium py-3 rounded-lg hover:bg-blue-800 transition-colors shadow-md mt-4"
                  >
                    Submit Application via Blockchain
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-20 text-slate-500">
             Please access this portal through the Aegis Main App.
          </div>
        )}
      </div>
    </main>
  );
}
