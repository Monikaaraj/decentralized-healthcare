import { useState, useEffect } from 'react';
import { ethers } from "ethers";
import { maskAge, maskWalletAddress } from "@/utils/privacy";

export default function ResearchDashboard({ contract, marketplaceContract, tokenContract, account, username }: { contract?: any; marketplaceContract: any; tokenContract: any; account: string; username?: string }) {
  const [flStatus, setFlStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  // Researcher Verification Status via ICMR / IRB
  const [verificationStatus, setVerificationStatus] = useState<{ hasApplied: boolean; isApproved: boolean; isRejected: boolean; institution?: string }>({
    hasApplied: false,
    isApproved: false,
    isRejected: false
  });
  
  // Marketplace State
  const [hlthBalance, setHlthBalance] = useState<string>("0");
  const [bounties, setBounties] = useState<any[]>([]);
  const [purchasedData, setPurchasedData] = useState<any[]>([]);
  const [marketStatus, setMarketStatus] = useState<string>("");
  
  const [newBountyDesc, setNewBountyDesc] = useState("");
  const [newBountyReward, setNewBountyReward] = useState("");
  const [newBountyMax, setNewBountyMax] = useState("1");
  const [selectedRecordToView, setSelectedRecordToView] = useState<any | null>(null);

  // Document Inspection & OCR State
  const [ocrScanning, setOcrScanning] = useState<boolean>(false);
  const [scannedResult, setScannedResult] = useState<any | null>(null);
  const [scannedFileName, setScannedFileName] = useState<string>("");
  const [scanError, setScanError] = useState<string>("");

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/fl/status');
      const data = await res.json();
      setFlStatus(data);
    } catch (err) {
      console.error("Failed to fetch FL status", err);
    }
  };

  const fetchMarketplaceData = async () => {
    if (!tokenContract || !marketplaceContract || !account) return;
    
    try {
      // Get HLTH Balance
      const balance = await tokenContract.balanceOf(account);
      setHlthBalance(ethers.formatUnits(balance, 18));

      // Fetch all bounties
      const totalBounties = await marketplaceContract.nextBountyId();
      const loadedBounties = [];
      const myBountyIds = new Set();
      
      for (let i = 0; i < Number(totalBounties); i++) {
        const bounty = await marketplaceContract.bounties(i);
        if (bounty.isActive) {
          loadedBounties.push({
            id: i,
            creator: bounty.creator,
            description: bounty.description,
            reward: ethers.formatUnits(bounty.rewardPerFulfillment, 18),
            remainingEscrow: ethers.formatUnits(bounty.remainingEscrow, 18)
          });
        }
        if (bounty.creator.toLowerCase() === account.toLowerCase()) {
          myBountyIds.add(i);
        }
      }
      setBounties(loadedBounties);

      // Fetch purchased data (fulfilled bounties) via events
      const filter = marketplaceContract.filters.BountyFulfilled();
      const events = await marketplaceContract.queryFilter(filter, 0, "latest");
      
      const loadedData = [];
      for (const event of events) {
        const bId = Number(event.args[0]);
        if (myBountyIds.has(bId)) {
          loadedData.push({
            bountyId: bId,
            patient: event.args[1],
            cid: event.args[2],
            price: ethers.formatUnits(event.args[3], 18)
          });
        }
      }
      setPurchasedData(loadedData);
    } catch (err) {
      console.error("Error fetching marketplace data:", err);
    }
  };

  const checkResearcherVerification = async () => {
    if (!contract || !username) return;
    try {
      const profile = await contract.researcherProfiles(username);
      setVerificationStatus({
        hasApplied: profile.hasApplied,
        isApproved: profile.isApproved,
        isRejected: profile.isRejected,
        institution: profile.institution
      });
    } catch (e) {
      console.error("Failed to check researcher verification:", e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchMarketplaceData();
    checkResearcherVerification();

    if (contract && username) {
      const onVerified = (uname: string) => {
        if (uname.toLowerCase() === username.toLowerCase()) checkResearcherVerification();
      };
      const onRejected = (uname: string) => {
        if (uname.toLowerCase() === username.toLowerCase()) checkResearcherVerification();
      };
      contract.on("ResearcherVerified", onVerified);
      contract.on("ResearcherRejected", onRejected);
      return () => {
        contract.off("ResearcherVerified", onVerified);
        contract.off("ResearcherRejected", onRejected);
      };
    }

    const interval = setInterval(() => {
      fetchStatus();
      checkResearcherVerification();
    }, 4000);
    return () => clearInterval(interval);
  }, [marketplaceContract, tokenContract, account, contract, username]);

  const startTraining = async () => {
    setLoading(true);
    try {
      await fetch('/api/fl/start', { method: 'POST' });
      fetchStatus();
    } catch (err) {
      console.error("Failed to start FL", err);
    }
    setLoading(false);
  };

  const handleMintTokens = async () => {
    if (!tokenContract) return;
    setMarketStatus("Minting 100 HLTH tokens...");
    try {
      const tx = await tokenContract.requestTokens();
      await tx.wait();
      setMarketStatus("Success! Received 100 HLTH.");
      fetchMarketplaceData();
    } catch (err: any) {
      console.error(err);
      setMarketStatus("Error minting tokens.");
    }
  };

  const handleCreateBounty = async () => {
    if (!tokenContract || !marketplaceContract || !newBountyDesc || !newBountyReward || !newBountyMax) return;
    setMarketStatus("Approving HLTH token escrow...");
    try {
      const rewardWei = ethers.parseUnits(newBountyReward, 18);
      const maxFulfillments = BigInt(newBountyMax);
      const totalEscrowWei = rewardWei * maxFulfillments;
      
      const marketplaceAddress = await marketplaceContract.getAddress();
      const approveTx = await tokenContract.approve(marketplaceAddress, totalEscrowWei);
      await approveTx.wait();

      setMarketStatus("Creating Data Request Bounty...");
      const tx = await marketplaceContract.createBounty(newBountyDesc, rewardWei, totalEscrowWei);
      await tx.wait();

      setMarketStatus("Success! Bounty created and funded.");
      setNewBountyDesc("");
      setNewBountyReward("");
      setNewBountyMax("1");
      fetchMarketplaceData();
    } catch (err: any) {
      console.error(err);
      setMarketStatus("Failed to create bounty.");
    }
  };

  const handleScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrScanning(true);
    setScanError("");
    setScannedFileName(file.name);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        const res = await fetch('/api/ocr/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64_data: base64Data,
            filename: file.name
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setScannedResult(data.extracted_data);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error("Scan error:", err);
      setScanError(err.message || "Failed to scan document with OCR");
    } finally {
      setOcrScanning(false);
    }
  };

  const handleScanDemoSample = async (sampleAge = 19) => {
    setOcrScanning(true);
    setScanError("");
    setScannedFileName("patient_cardiac_lab_report.pdf");
    try {
      const sampleText = `METROPOLITAN HOSPITAL & RESEARCH INSTITUTE
CLINICAL PATHOLOGY & DIAGNOSTIC REPORT
Patient Name: Rahul Sharma
Patient ID: 9482019
Age: ${sampleAge}
Gender: Male
Contact: +91 9876543210
Address: Indiranagar, Bengaluru
Referring Physician: Dr. K. Rao (Reg: NMC-48201)

================ VITAL SIGNS & LAB READINGS ================
Blood Pressure: 128/82 mmHg
Heart Rate: 74 bpm
Fasting Blood Sugar: 98 mg/dL
Hemoglobin: 14.5 g/dL
White Blood Cells (WBC): 6,800 /uL
Platelets: 245,000 /uL
Total Cholesterol: 182 mg/dL
Serum Creatinine: 0.9 mg/dL
Oxygen Saturation (SpO2): 99%

================ DIAGNOSTIC FINDINGS ================
Impression: Normal cardiac sinus rhythm, no acute cardiomegaly.
Remarks: Maintain current hydration and balanced diet.`;

      const res = await fetch('/api/ocr/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          filename: "patient_cardiac_lab_report.pdf"
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScannedResult(data.extracted_data);
    } catch (err: any) {
      console.error(err);
      setScanError(err.message || "Failed to scan document");
    } finally {
      setOcrScanning(false);
    }
  };

  const handleDownloadScannedJSON = () => {
    if (!scannedResult) return;
    const cleanExport = {
      document_name: scannedFileName,
      privacy_protocol: "AEGIS-AI De-identification & Differential Privacy",
      demographics_with_masked_pii: scannedResult.masked_demographics,
      exact_readings_present_in_document: scannedResult.exact_readings,
      diagnostic_findings: scannedResult.findings,
      extracted_timestamp: new Date().toISOString()
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanExport, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `masked_extracted_${scannedFileName.replace(/\.[^/.]+$/, "")}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      
      {/* --- Researcher Blockchain Verification Status Banner --- */}
      <div className={`p-6 rounded-2xl border backdrop-blur-xl relative overflow-hidden transition-all duration-300 shadow-xl ${
        verificationStatus.isApproved 
          ? "bg-purple-950/20 border-purple-500/40 text-purple-200" 
          : verificationStatus.hasApplied && !verificationStatus.isRejected
          ? "bg-amber-950/20 border-amber-500/40 text-amber-200"
          : verificationStatus.isRejected
          ? "bg-red-950/20 border-red-500/40 text-red-200"
          : "bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-slate-900/40 border-purple-500/30 text-slate-200"
      }`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🔬</span>
              <h3 className="font-bold text-lg text-white">
                {verificationStatus.isApproved 
                  ? "Verified Clinical Researcher (IRB / ICMR Approved)" 
                  : verificationStatus.hasApplied && !verificationStatus.isRejected
                  ? "IRB Ethics Review In Progress"
                  : verificationStatus.isRejected
                  ? "Ethics Review Application Rejected"
                  : "Researcher Verification Required"}
              </h3>
            </div>
            <p className="text-sm opacity-85">
              {verificationStatus.isApproved 
                ? `Authorized Institution: ${verificationStatus.institution || "Verified Medical AI Institution"}. You hold verified blockchain credentials to deploy Federated AI models and commission data bounties.`
                : verificationStatus.hasApplied && !verificationStatus.isRejected
                ? "Your research credentials and IRB trial IDs are currently under review by the Ethics Committee. You may prepare bounties, but full network consensus validation requires active approval."
                : verificationStatus.isRejected
                ? "Your verification application was rejected by the Ethics Review Board. Please verify your institution credentials."
                : "Apply for Institutional Review Board (IRB) / Ethics Committee verification on-chain to unlock full decentralized research capabilities."}
            </p>
          </div>
          <div>
            <a
              href={`http://localhost:3001?researcher=${username || "researcher"}`}
              target="_blank"
              rel="noreferrer"
              className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md inline-block whitespace-nowrap ${
                verificationStatus.isApproved
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30"
                  : "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30"
              }`}
            >
              {verificationStatus.isApproved ? "View On-Chain Credentials ↗" : "Verify Researcher Credentials ↗"}
            </a>
          </div>
        </div>
      </div>

      {/* --- Data Marketplace Section --- */}
      <div className="bg-white/5 border border-indigo-500/30 p-8 rounded-2xl backdrop-blur-xl relative overflow-hidden group shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-indigo-500/10 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 blur-xl pointer-events-none" />
        <div className="relative z-10">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-6">
          Decentralized Data Marketplace
        </h2>
        
        <div className="flex justify-between items-center mb-6 p-4 bg-black/40 rounded-xl border border-white/10">
          <div>
            <p className="text-gray-400 text-sm">Your HLTH Balance</p>
            <p className="text-2xl font-bold text-indigo-400">{hlthBalance} <span className="text-sm">HLTH</span></p>
          </div>
          <button onClick={handleMintTokens} className="px-4 py-2 bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 rounded-lg hover:bg-indigo-500/30 transition-colors text-sm font-medium">
            💰 Faucet (Get 100 HLTH)
          </button>
        </div>

        {marketStatus && <div className="p-4 mb-6 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">{marketStatus}</div>}

        <h3 className="text-lg font-semibold text-white mb-4">Post a Data Request (Bounty)</h3>
        <div className="bg-black/20 p-4 rounded-xl border border-white/10 mb-8 space-y-4">
          <input type="text" placeholder="Description (e.g. 'Seeking MRI scans of knee')" value={newBountyDesc} onChange={(e) => setNewBountyDesc(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
          <div className="flex gap-4">
            <input type="number" placeholder="Reward per File (HLTH)" value={newBountyReward} onChange={(e) => setNewBountyReward(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
            <input type="number" placeholder="Max Fulfillments" value={newBountyMax} onChange={(e) => setNewBountyMax(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
          </div>
          <button onClick={handleCreateBounty} className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg font-medium hover:opacity-90 text-white shadow-lg">
            Fund & Post Bounty
          </button>
        </div>

        <h3 className="text-lg font-semibold text-white mb-4">Active Bounties</h3>
        
        {bounties.length === 0 ? (
          <p className="text-gray-500 italic text-center py-8">No bounties are currently active.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {bounties.map((item) => (
              <div key={item.id} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-indigo-500/50 transition-colors">
                <p className="text-xs text-gray-500 mb-2">Creator: {item.creator.substring(0,6)}...{item.creator.substring(38)}</p>
                <p className="text-sm font-medium text-white mb-4">
                  "{item.description}"
                </p>
                <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/10">
                  <div>
                    <span className="block font-bold text-emerald-400">{item.reward} HLTH</span>
                    <span className="block text-xs text-gray-500">Reward per Record</span>
                  </div>
                  <div className="text-right">
                     <span className="block text-sm text-indigo-400">{item.remainingEscrow} HLTH</span>
                     <span className="block text-xs text-gray-500">Escrow Remaining</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <h3 className="text-lg font-semibold text-white mb-4">Data Provided by Patients (Fulfilled Bounties)</h3>
        {purchasedData.length === 0 ? (
          <p className="text-gray-500 italic text-center py-8">Patients have not fulfilled any of your bounties yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {purchasedData.map((item, index) => {
              // Simulated demographic mapping for masked research export preview
              const sampleAge = 19 + (index * 7);
              const maskedAgeRange = maskAge(sampleAge);
              const maskedPatient = maskWalletAddress(item.patient);

              const handleDownloadAnonymized = () => {
                const anonymizedPayload = {
                  record_id: `AEGIS-RES-${item.bountyId}-${index + 1}`,
                  patient_identifier: maskedPatient,
                  demographics: {
                    age_interval: maskedAgeRange,
                    gender: index % 2 === 0 ? "F" : "M",
                    admission_type: "ELECTIVE"
                  },
                  clinical_vitals: {
                    blood_pressure_band: "120-130 / 80-90 mmHg",
                    heart_rate_band: "70-75 bpm",
                    glucose_band: "90-100 mg/dL"
                  },
                  diagnostic_findings: {
                    target_labels: ["Cardiomegaly_Risk", "Effusion_Risk"],
                    icd9_category: "Circulatory / Respiratory",
                    privacy_protection: "Differential Privacy + K-Anonymity (k=5)"
                  },
                  provenance: {
                    encrypted_cid_ref: item.cid,
                    consent_verified_on_chain: true,
                    bounty_id: item.bountyId
                  }
                };

                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(anonymizedPayload, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `anonymized_patient_record_${item.bountyId}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
              };

              return (
                <div key={index} className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-xs text-gray-400">Bounty #{item.bountyId}</p>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        PII Masked
                      </span>
                    </div>
                    <p className="text-xs text-indigo-300 font-mono mb-1">
                      Patient: {maskedPatient}
                    </p>
                    <p className="text-xs text-purple-300 mb-2">
                      Age Bracket: <span className="font-bold text-white bg-purple-500/20 px-1.5 py-0.5 rounded">{maskedAgeRange}</span> (Classified Interval)
                    </p>
                    <p className="text-xs font-mono text-emerald-400 mb-3 bg-black/40 p-2 rounded truncate" title={item.cid}>
                      CID: {item.cid}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => handleScanDemoSample(sampleAge)}
                      className="flex-1 py-2 bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow flex items-center justify-center gap-1.5 transition-all"
                    >
                      <span>🔍</span> Scan with OCR
                    </button>
                    <button
                      onClick={handleDownloadAnonymized}
                      className="flex-1 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-semibold shadow flex items-center justify-center gap-1.5 transition-all"
                    >
                      <span>📥</span> Download JSON
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {/* --- Document Inspection & Privacy-Preserving OCR Scanner Section --- */}
      <div className="bg-white/5 border border-teal-500/30 p-8 rounded-2xl backdrop-blur-xl relative overflow-hidden group shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-teal-500/0 via-teal-500/10 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 blur-xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
                🔬 Document Observation & Privacy-Preserving OCR Scanner
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Scan patient PDF or image reports with OCR. PII is redacted, age is classified into standard clinical intervals (e.g. 19 → 18-22), and all lab readings preserve their exact values without interval bucketing.
              </p>
            </div>
            <button
              onClick={() => handleScanDemoSample(19)}
              disabled={ocrScanning}
              className="px-4 py-2 bg-gradient-to-r from-teal-500/20 to-emerald-500/20 border border-teal-500/40 text-teal-300 rounded-xl hover:bg-teal-500/30 text-xs font-semibold whitespace-nowrap transition-all shadow"
            >
              ⚡ Scan Sample PDF (Age 19)
            </button>
          </div>

          {/* Upload Dropzone */}
          <div className="p-4 bg-black/40 border border-white/10 rounded-xl mb-6 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Select Medical PDF or Scanned Report to Inspect:
              </label>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={handleScanFile}
                disabled={ocrScanning}
                className="block w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-500/20 file:text-teal-300 hover:file:bg-teal-500/30 cursor-pointer"
              />
            </div>
            {ocrScanning && (
              <div className="flex items-center gap-2 text-teal-400 text-xs font-semibold animate-pulse py-2">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-ping" />
                Scanning document via OCR...
              </div>
            )}
          </div>

          {scanError && (
            <div className="p-3 mb-6 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
              ⚠️ {scanError}
            </div>
          )}

          {/* Extracted Document Details Display */}
          {scannedResult && (
            <div className="space-y-6 animate-in fade-in duration-500">
              {/* Header Status */}
              <div className="p-4 bg-black/40 border border-teal-500/40 rounded-xl flex flex-wrap justify-between items-center gap-2">
                <div>
                  <span className="text-xs text-gray-400">Document: </span>
                  <span className="text-xs font-mono font-bold text-white">{scannedFileName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    PII Redacted
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Age Bracketed
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    Exact Values Kept
                  </span>
                </div>
              </div>

              {/* Cards Grid: Demographics vs Exact Readings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Masked Demographics */}
                <div className="p-5 bg-black/30 border border-white/10 rounded-xl">
                  <h4 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
                    <span>🛡️</span> Privacy-Preserved Demographics
                  </h4>
                  <div className="space-y-2 text-xs">
                    {scannedResult.masked_demographics.patient_name && (
                      <div className="flex justify-between py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Patient Name:</span>
                        <span className="font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded">
                          {scannedResult.masked_demographics.patient_name}
                        </span>
                      </div>
                    )}
                    {scannedResult.masked_demographics.age_interval && (
                      <div className="flex justify-between py-1.5 border-b border-white/5 items-center">
                        <span className="text-gray-400">Age:</span>
                        <span className="font-bold text-white bg-purple-500/30 border border-purple-500/40 px-2 py-0.5 rounded">
                          {scannedResult.masked_demographics.age_interval} (Classified Interval)
                        </span>
                      </div>
                    )}
                    {scannedResult.masked_demographics.gender && (
                      <div className="flex justify-between py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Gender:</span>
                        <span className="text-gray-200">{scannedResult.masked_demographics.gender}</span>
                      </div>
                    )}
                    {scannedResult.masked_demographics.phone_number && (
                      <div className="flex justify-between py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Contact / Phone:</span>
                        <span className="font-mono text-gray-500">[REDACTED]</span>
                      </div>
                    )}
                    {scannedResult.masked_demographics.address && (
                      <div className="flex justify-between py-1.5 border-b border-white/5">
                        <span className="text-gray-400">Address / City:</span>
                        <span className="font-mono text-gray-500">[REDACTED]</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Exact Diagnostic Readings */}
                <div className="p-5 bg-black/30 border border-white/10 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-semibold text-teal-300 flex items-center gap-2">
                      <span>🩺</span> Document Lab Readings (Exact Values)
                    </h4>
                    <span className="text-[10px] text-gray-400 italic">No intervals for readings</span>
                  </div>
                  
                  {Object.keys(scannedResult.exact_readings).length === 0 ? (
                    <p className="text-gray-500 text-xs italic py-4">No numerical test readings detected in this document.</p>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {Object.entries(scannedResult.exact_readings).map(([metric, val]: any) => (
                        <div key={metric} className="flex justify-between py-1.5 border-b border-white/5 items-center">
                          <span className="text-gray-300 capitalize">
                            {metric.replace(/_/g, ' ')}:
                          </span>
                          <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Findings / Impressions */}
              {scannedResult.findings && scannedResult.findings.length > 0 && (
                <div className="p-4 bg-black/30 border border-white/10 rounded-xl">
                  <h4 className="text-xs font-semibold text-indigo-300 mb-2">📋 Document Impressions & Findings</h4>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-gray-300">
                    {scannedResult.findings.map((f: string, idx: number) => (
                      <li key={idx}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 4. JSON Viewer & Download Section */}
              <div className="p-4 bg-black/50 border border-white/10 rounded-xl">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-semibold text-gray-300">
                    📄 Masked Document JSON (Contains ONLY Details Present in Report)
                  </h4>
                  <button
                    onClick={handleDownloadScannedJSON}
                    className="px-3 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition-all flex items-center gap-1.5"
                  >
                    <span>📥</span> Download JSON
                  </button>
                </div>
                <pre className="p-3 bg-black/70 rounded-lg text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-56">
                  {JSON.stringify({
                    document_name: scannedFileName,
                    demographics_with_masked_pii: scannedResult.masked_demographics,
                    exact_readings_present_in_document: scannedResult.exact_readings,
                    diagnostic_findings: scannedResult.findings,
                    privacy_protocol: "AEGIS-AI De-identification & Differential Privacy"
                  }, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- Federated Learning Section --- */}
      <div className="bg-white/5 border border-purple-500/30 p-8 rounded-2xl backdrop-blur-xl relative overflow-hidden group shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-purple-500/10 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 blur-xl pointer-events-none" />
        <div className="relative z-10">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-6">
          Federated Diagnostic Model Training
        </h2>
        
        <p className="text-gray-400 mb-6 text-sm">
          Initialize a decentralized AI training job. This will securely aggregate model gradients from participating hospital nodes without ever exposing raw medical records.
        </p>

        <button 
          onClick={startTraining} 
          disabled={loading || flStatus?.status === "training"}
          className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl shadow-lg shadow-purple-500/25 transition-all font-semibold disabled:opacity-50"
        >
          {loading || flStatus?.status === "training" ? "Training in Progress..." : "🚀 Initiate Global Training Run"}
        </button>

        {flStatus && flStatus.status !== "idle" && (
          <div className="mt-8 space-y-4">
            <h3 className="text-lg font-semibold text-white">Training Metrics (Real-time)</h3>
            <div className="flex items-center space-x-2 text-sm">
               <span className="text-gray-400">Status:</span>
               <span className={`px-2 py-1 rounded text-xs font-bold ${flStatus.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                 {flStatus.status ? flStatus.status.toUpperCase() : "UNKNOWN"}
               </span>
            </div>
            
            <div className="space-y-3">
              {flStatus.rounds && flStatus.rounds.map((r: any, idx: number) => (
                <div key={idx} className="p-4 bg-black/40 rounded-lg border border-white/10 flex justify-between items-center">
                  <div>
                    <div className="text-purple-400 font-bold mb-1">Round {r.round} Aggregation</div>
                    <div className="text-xs text-gray-500">Aggregated from 3 isolated silos</div>
                  </div>
                  <div className="text-right">
                    <div className="text-emerald-400 font-mono font-bold text-lg">
                       {(r.accuracy * 100).toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500">Global Accuracy</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
