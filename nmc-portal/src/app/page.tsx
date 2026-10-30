"use client";

import { useState, useEffect, Suspense } from "react";
import { ethers } from "ethers";
import { ShieldCheck, UserCheck, Stethoscope, Clock, CheckCircle, Award } from "lucide-react";
import { useSearchParams } from 'next/navigation';

// ABI for MedicalConsent (Doctor + Researcher Verification)
const CONTRACT_ABI = [
  "function applyForVerification(string memory _username, string memory _name, string memory _licenseNumber) external",
  "function approveDoctor(string memory _username) external",
  "function rejectDoctor(string memory _username) external",
  "function getAllDoctors() external view returns (string[] memory)",
  "function doctorProfiles(string) public view returns (string username, string name, string licenseNumber, bool hasApplied, bool isApproved, bool isRejected)",
  "function applyForResearcherVerification(string memory _username, string memory _name, string memory _institution, string memory _researchId) external",
  "function approveResearcher(string memory _username) external",
  "function rejectResearcher(string memory _username) external",
  "function getAllResearchers() external view returns (string[] memory)",
  "function researcherProfiles(string) public view returns (string username, string name, string institution, string researchId, bool hasApplied, bool isApproved, bool isRejected)",
  "event DoctorApplied(string username, string name, string licenseNumber)",
  "event DoctorVerified(string username)",
  "event DoctorRejected(string username)",
  "event ResearcherApplied(string username, string name, string institution, string researchId)",
  "event ResearcherVerified(string username)",
  "event ResearcherRejected(string username)",
  "event DevDataReset()"
];

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 

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
  const researcherUsername = searchParams.get('researcher');

  const [account, setAccount] = useState<string>("");
  const [contract, setContract] = useState<any>(null);
  
  // Doctor Apply State
  const [applyForm, setApplyForm] = useState({ name: "", licenseNumber: "" });
  const [hasApplied, setHasApplied] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [isRejected, setIsRejected] = useState(false);

  // Researcher Apply State
  const [researcherApplyForm, setResearcherApplyForm] = useState({ name: "", institution: "", researchId: "" });
  const [resHasApplied, setResHasApplied] = useState(false);
  const [resIsApproved, setResIsApproved] = useState(false);
  const [resIsRejected, setResIsRejected] = useState(false);
  
  // Admin State
  const [adminTab, setAdminTab] = useState<"doctors" | "researchers">("doctors");
  const [pendingDoctors, setPendingDoctors] = useState<any[]>([]);
  const [pendingResearchers, setPendingResearchers] = useState<any[]>([]);

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
        checkDoctorStatus();
      }
      if (researcherUsername) {
        checkResearcherStatus();
      }
      if (isAdminUrl) {
        fetchPendingDoctors();
        fetchPendingResearchers();
      }
      
      const onDocApplied = () => {
        if (isAdminUrl) fetchPendingDoctors();
        else if (doctorUsername) checkDoctorStatus();
      };
      
      const onDocVerified = (username: string) => {
        if (doctorUsername && username.toLowerCase() === doctorUsername.toLowerCase()) {
          setIsApproved(true);
          setIsRejected(false);
        }
        if (isAdminUrl) fetchPendingDoctors();
      };

      const onDocRejected = (username: string) => {
        if (doctorUsername && username.toLowerCase() === doctorUsername.toLowerCase()) {
          setIsRejected(true);
          setIsApproved(false);
        }
        if (isAdminUrl) fetchPendingDoctors();
      };

      const onResApplied = () => {
        if (isAdminUrl) fetchPendingResearchers();
        else if (researcherUsername) checkResearcherStatus();
      };

      const onResVerified = (username: string) => {
        if (researcherUsername && username.toLowerCase() === researcherUsername.toLowerCase()) {
          setResIsApproved(true);
          setResIsRejected(false);
        }
        if (isAdminUrl) fetchPendingResearchers();
      };

      const onResRejected = (username: string) => {
        if (researcherUsername && username.toLowerCase() === researcherUsername.toLowerCase()) {
          setResIsRejected(true);
          setResIsApproved(false);
        }
        if (isAdminUrl) fetchPendingResearchers();
      };

      const onReset = () => {
        window.location.reload();
      };
      
      contract.on("DoctorApplied", onDocApplied);
      contract.on("DoctorVerified", onDocVerified);
      contract.on("DoctorRejected", onDocRejected);
      contract.on("ResearcherApplied", onResApplied);
      contract.on("ResearcherVerified", onResVerified);
      contract.on("ResearcherRejected", onResRejected);
      contract.on("DevDataReset", onReset);

      return () => {
        contract.off("DoctorApplied", onDocApplied);
        contract.off("DoctorVerified", onDocVerified);
        contract.off("DoctorRejected", onDocRejected);
        contract.off("ResearcherApplied", onResApplied);
        contract.off("ResearcherVerified", onResVerified);
        contract.off("ResearcherRejected", onResRejected);
        contract.off("DevDataReset", onReset);
      };
    }
  }, [contract, account, isAdminUrl, doctorUsername, researcherUsername]);

  const checkDoctorStatus = async () => {
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

  const checkResearcherStatus = async () => {
    if (!researcherUsername) return;
    try {
      const profile = await contract.researcherProfiles(researcherUsername);
      setResHasApplied(profile.hasApplied);
      setResIsApproved(profile.isApproved);
      setResIsRejected(profile.isRejected);
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

  const fetchPendingResearchers = async () => {
    try {
      const usernames = await contract.getAllResearchers();
      const pending = [];
      for (let i = 0; i < usernames.length; i++) {
        const username = usernames[i];
        const profile = await contract.researcherProfiles(username);
        if (profile.hasApplied && !profile.isApproved && !profile.isRejected) {
          pending.push({
            username: username,
            name: profile.name,
            institution: profile.institution,
            researchId: profile.researchId
          });
        }
      }
      setPendingResearchers(pending);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyDoctor = async () => {
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

  const handleApplyResearcher = async () => {
    if (!researcherApplyForm.name || !researcherApplyForm.institution || !researcherApplyForm.researchId || !researcherUsername) {
      return alert("Fill all fields");
    }
    try {
      const tx = await contract.applyForResearcherVerification(
        researcherUsername,
        researcherApplyForm.name,
        researcherApplyForm.institution,
        researcherApplyForm.researchId
      );
      await tx.wait();
      setResHasApplied(true);
      alert("Researcher Application submitted to ICMR / Review Board!");
    } catch (e) {
      console.error(e);
      alert("Transaction failed");
    }
  };

  const handleApproveDoctor = async (docUsername: string) => {
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

  const handleRejectDoctor = async (docUsername: string) => {
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

  const handleApproveResearcher = async (resUsername: string) => {
    try {
      const tx = await contract.approveResearcher(resUsername);
      await tx.wait();
      alert("Researcher Approved!");
      fetchPendingResearchers();
    } catch (e) {
      console.error(e);
      alert("Approval failed");
    }
  };

  const handleRejectResearcher = async (resUsername: string) => {
    try {
      const tx = await contract.rejectResearcher(resUsername);
      await tx.wait();
      alert("Researcher Rejected.");
      fetchPendingResearchers();
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
            <h1 className="text-2xl font-bold tracking-tight">National Medical & Research Commission</h1>
            <p className="text-blue-200 text-sm">Official Blockchain Verification Authority (NMC & ICMR / IRB)</p>
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
            <h2 className="text-3xl font-bold text-slate-800 mb-4">Welcome to the Verification Authority Portal</h2>
            <p className="text-slate-500 mb-8 max-w-lg mx-auto">
              This portal handles official decentralized Web3 verification for Doctors (NMC) and Clinical Researchers (ICMR / Institutional Review Boards).
            </p>
            <button onClick={connectWallet} className="bg-blue-900 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-800 transition-colors shadow-lg">
              Connect MetaMask to Continue
            </button>
          </div>
        ) : isAdminUrl ? (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2"><UserCheck className="text-blue-600"/> Authority Administration</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setAdminTab("doctors")}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${adminTab === "doctors" ? "bg-blue-900 text-white shadow" : "bg-white text-slate-700 border border-slate-200"}`}
                >
                  Doctor Applications ({pendingDoctors.length})
                </button>
                <button
                  onClick={() => setAdminTab("researchers")}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${adminTab === "researchers" ? "bg-blue-900 text-white shadow" : "bg-white text-slate-700 border border-slate-200"}`}
                >
                  Researcher Applications ({pendingResearchers.length})
                </button>
              </div>
            </div>

            {adminTab === "doctors" ? (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <span className="font-semibold text-slate-700">Pending Doctors (NMC Medical Board)</span>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-bold">{pendingDoctors.length} Pending</span>
                </div>
                {pendingDoctors.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <CheckCircle size={48} className="mx-auto mb-4 text-emerald-400 opacity-50" />
                    <p>All caught up! No pending doctor applications.</p>
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
                            onClick={() => handleRejectDoctor(doc.username)}
                            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                          >
                            Reject
                          </button>
                          <button 
                            onClick={() => handleApproveDoctor(doc.username)}
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
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <span className="font-semibold text-slate-700">Pending Researchers (ICMR / IRB Ethics Board)</span>
                  <span className="text-xs bg-purple-100 text-purple-800 px-2.5 py-1 rounded-full font-bold">{pendingResearchers.length} Pending</span>
                </div>
                {pendingResearchers.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <CheckCircle size={48} className="mx-auto mb-4 text-emerald-400 opacity-50" />
                    <p>All caught up! No pending researcher applications.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {pendingResearchers.map((res, idx) => (
                      <li key={idx} className="p-6 hover:bg-slate-50 transition-colors flex justify-between items-center">
                        <div>
                          <h3 className="font-bold text-lg">{res.name}</h3>
                          <p className="text-sm text-slate-600 mt-1 font-medium">Institution / Org: <span className="text-slate-800 font-semibold">{res.institution}</span></p>
                          <p className="text-sm text-slate-500 mt-0.5">IRB / Research ID: <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{res.researchId}</span></p>
                          <p className="text-xs text-slate-400 mt-1 font-mono">Username: {res.username}</p>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleRejectResearcher(res.username)}
                            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                          >
                            Reject
                          </button>
                          <button 
                            onClick={() => handleApproveResearcher(res.username)}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-sm"
                          >
                            Approve Researcher
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2"><Stethoscope className="text-blue-600"/> Apply for Doctor Verification</h2>
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
                    onClick={handleApplyDoctor}
                    className="w-full bg-blue-900 text-white font-medium py-3 rounded-lg hover:bg-blue-800 transition-colors shadow-md mt-4"
                  >
                    Submit Application via Blockchain
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : researcherUsername ? (
          <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-xl border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-purple-700"></div>
            {resHasApplied ? (
              <div className="text-center py-8">
                {resIsApproved ? (
                  <div className="w-20 h-20 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_15px_rgba(147,51,234,0.3)]">
                    <Award size={40} />
                  </div>
                ) : resIsRejected ? (
                  <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                    <span className="text-3xl font-bold">X</span>
                  </div>
                ) : (
                  <div className="w-20 h-20 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Clock size={40} className="animate-pulse" />
                  </div>
                )}
                
                <h3 className="text-2xl font-bold text-slate-800 mb-2">
                  {resIsApproved ? "Researcher Verified!" : resIsRejected ? "Application Rejected" : "Application Received"}
                </h3>
                
                <p className="text-slate-600 mb-6">
                  {resIsApproved 
                    ? "Your research credentials and IRB institution have been approved on-chain. You have full access to deploy Federated AI models and create Data Bounties."
                    : resIsRejected
                    ? "Your application was rejected by the Review Board."
                    : "Your application has been submitted to the Institutional Review Board and is currently awaiting approval."}
                </p>

                <div className="space-y-4 max-w-sm mx-auto mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">✓</div>
                    <div className="text-sm font-medium text-slate-700">Application Submitted</div>
                  </div>
                  <div className="w-0.5 h-6 bg-slate-200 ml-4"></div>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${resIsApproved ? 'bg-purple-600 text-white' : resIsRejected ? 'bg-red-500 text-white' : 'bg-purple-400 text-white animate-pulse'}`}>
                      {resIsApproved ? '✓' : resIsRejected ? 'X' : '⏳'}
                    </div>
                    <div className={`text-sm font-medium ${resIsRejected ? 'text-red-600' : 'text-slate-700'}`}>Ethics Board Review</div>
                  </div>
                  <div className="w-0.5 h-6 bg-slate-200 ml-4"></div>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${resIsApproved ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {resIsApproved ? '✓' : '3'}
                    </div>
                    <div className={`text-sm font-medium ${resIsApproved ? 'text-slate-700' : 'text-slate-400'}`}>Verified on Blockchain</div>
                  </div>
                </div>

                <div className="mt-8 p-4 bg-slate-50 rounded-lg text-sm text-slate-500 border border-slate-100">
                  {resIsApproved ? "You can close this window and enter the AEGIS-AI Research Hub!" : resIsRejected ? "Please contact the Ethics Review committee for details." : "You can close this window. Your verified status will automatically unlock features in the main Research Dashboard once approved."}
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 text-purple-900"><Award className="text-purple-600"/> Apply for Researcher Verification</h2>
                <p className="text-slate-500 mb-8 text-sm">Submit your scientific credentials, institution, and IRB ID to obtain authorization for Federated Learning & Data Marketplace bounty creation.</p>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Lead Researcher / PI Name</label>
                    <input 
                      type="text" 
                      placeholder="Dr. Alan Turing / Prof. Alice"
                      value={researcherApplyForm.name}
                      onChange={e => setResearcherApplyForm({...researcherApplyForm, name: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Institution / University / BioTech Org</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Stanford AI Health Lab / IISc Bangalore"
                      value={researcherApplyForm.institution}
                      onChange={e => setResearcherApplyForm({...researcherApplyForm, institution: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">IRB / ICMR Clinical Trial ID</label>
                    <input 
                      type="text" 
                      placeholder="IRB-CTRI-2024-0091"
                      value={researcherApplyForm.researchId}
                      onChange={e => setResearcherApplyForm({...researcherApplyForm, researchId: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <button 
                    onClick={handleApplyResearcher}
                    className="w-full bg-purple-700 text-white font-medium py-3 rounded-lg hover:bg-purple-800 transition-colors shadow-md mt-4"
                  >
                    Submit Researcher Application via Blockchain
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
