"use client";
import { useState, useEffect, useCallback } from "react";
import { encryptData, uploadToIPFS, fetchFromIPFS, decryptData, derivePatientKey } from "@/utils/crypto";
import { FileSearch, LockOpen, UploadCloud, ShieldAlert, FileText, Trash2, ShieldQuestion, Share2, Shield } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import ReactMarkdown from "react-markdown";

import { ethers } from "ethers";

export default function PatientDashboard({ contract, marketplaceContract, account }: { contract: any; marketplaceContract: any; account: string }) {
  const [fileData, setFileData] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [doctorAddress, setDoctorAddress] = useState<string>("");
  const [sellCID, setSellCID] = useState<string>("");
  const [sellPrice, setSellPrice] = useState<string>("");
  
  // Tab Navigation
  const [activeTab, setActiveTab] = useState<"upload" | "view" | "marketplace">("upload");
  
  // For viewing records
  const [records, setRecords] = useState<{id: number, cid: string, uploader: string}[]>([]);
  const [decryptedData, setDecryptedData] = useState<string | null>(null);
  
  // Marketplace Bounties
  const [bounties, setBounties] = useState<any[]>([]);

  // AI Assistant State
  const [aiResponse, setAiResponse] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiQuestion, setAiQuestion] = useState<string>("");
  const [aiAction, setAiAction] = useState<"summarize" | "ask">("summarize");

  const { t } = useLanguage();

  const handleAIAnalyze = async (action: "summarize" | "ask") => {
    if (!decryptedData) return;
    setAiLoading(true);
    setAiResponse("");
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentText: decryptedData,
          action: action,
          question: action === "ask" ? aiQuestion : undefined
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiResponse(data.response);
      if (action === "ask") setAiQuestion("");
    } catch (err: any) {
      console.error(err);
      setAiResponse("⚠️ AI Error: " + (err.message || "Something went wrong"));
    } finally {
      setAiLoading(false);
    }
  };

  const loadRecords = useCallback(async () => {
    if (!contract || !account) return;
    try {
      const count = await contract.getRecordCount(account);
      const loadedRecords = [];
      for (let i = 0; i < Number(count); i++) {
        try {
          const recordData = await contract.getRecord(account, i);
          loadedRecords.push({ id: i, cid: recordData[0], uploader: recordData[1] });
        } catch(e) {
          // Record was deleted or access denied, skip it
        }
      }
      setRecords(loadedRecords);
    } catch (e) {
      console.error("Failed to load records", e);
    }
  }, [contract, account]);

  const fetchBounties = useCallback(async () => {
    if (!marketplaceContract) return;
    try {
      const totalBounties = await marketplaceContract.nextBountyId();
      const loaded = [];
      for (let i = 0; i < Number(totalBounties); i++) {
        const bounty = await marketplaceContract.bounties(i);
        if (bounty.isActive) {
          loaded.push({
            id: i,
            description: bounty.description,
            reward: ethers.formatUnits(bounty.rewardPerFulfillment, 18),
            creator: bounty.creator
          });
        }
      }
      setBounties(loaded);
    } catch (e) {
      console.error("Failed to load bounties", e);
    }
  }, [marketplaceContract]);

  useEffect(() => {
    loadRecords();
    fetchBounties();
  }, [loadRecords, fetchBounties]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setFileData(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleEncryptAndUpload = async () => {
    if (!fileData) return alert("Please select a file to upload");
    setStatus("Encrypting locally with AES-256 Master Key...");
    
    // Encrypt deterministically
    const masterKey = derivePatientKey(account);
    const encrypted = encryptData(fileData, masterKey);
    
    setStatus("Uploading encrypted blob to Pinata IPFS...");
    try {
      const cid = await uploadToIPFS(encrypted);
      
      setStatus("Anchoring real IPFS CID to Polygon Smart Contract...");
      const tx = await contract.addRecord(cid);
      await tx.wait();
      setStatus(`Success! Record anchored.`);
      await loadRecords();
      
      // Auto-fill the CID for the marketplace so the user doesn't have to copy-paste it
      setSellCID(cid);
    } catch (err: any) {
      console.error(err);
      setStatus("Error processing record");
    }
  };

  // Resolve username to wallet address from the global Auth Registry
  const resolveAddress = (idOrAddress: string) => {
    if (idOrAddress.startsWith("0x") && idOrAddress.length === 42) return idOrAddress;
    
    // Look up username in local storage
    try {
      const users = JSON.parse(localStorage.getItem("aegis_users") || "{}");
      const user = users[idOrAddress.toLowerCase()];
      if (user && user.walletAddress) {
        return user.walletAddress;
      }
    } catch (e) {
      console.error(e);
    }
    
    return idOrAddress; // Fallback to whatever they typed
  };

  const handleToggleConsent = async (grant: boolean) => {
    if (!doctorAddress) return;
    const resolvedAddress = resolveAddress(doctorAddress);
    setStatus(`Processing consent transaction...`);
    try {
      const tx = grant ? await contract.grantConsent(resolvedAddress) : await contract.revokeConsent(resolvedAddress);
      await tx.wait();
      setStatus(`Consent ${grant ? "Granted" : "Revoked"} for ${resolvedAddress}`);
    } catch (err: any) {
      setStatus("Consent transaction failed.");
    }
  };

  const handleViewRecord = async (cid: string) => {
    setStatus("Fetching record from IPFS...");
    try {
      const encryptedBlob = await fetchFromIPFS(cid);
      if (!encryptedBlob) throw new Error("Record not found in IPFS");

      setStatus("Decrypting with your master key...");
      const masterKey = derivePatientKey(account);
      const decrypted = decryptData(encryptedBlob, masterKey);
      setDecryptedData(decrypted);
      setAiResponse(""); // Clear old AI chat
      setStatus("Successfully decrypted your record.");
    } catch (err: any) {
      console.error(err);
      setStatus(err.message || "Failed to fetch or decrypt record.");
    }
  };

  const handleDeleteRecord = async (recordId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent triggering the view action
    if (!confirm("Are you sure you want to delete this record? This action cannot be undone on the blockchain.")) return;
    
    setStatus(`Deleting Record #${recordId}...`);
    try {
      const tx = await contract.deleteRecord(recordId);
      await tx.wait();
      setStatus(`Record #${recordId} successfully deleted.`);
      
      // If the deleted record was currently being viewed, clear it
      setDecryptedData(null);
      setAiResponse("");
      
      await loadRecords();
    } catch (err: any) {
      console.error(err);
      setStatus("Failed to delete record.");
    }
  };

  const handleFulfillBounty = async (bountyId: number) => {
    if (!marketplaceContract || !sellCID) return alert("Please select a record to fulfill the bounty with.");
    setStatus("Fulfilling bounty...");
    try {
      const tx = await marketplaceContract.fulfillBounty(bountyId, sellCID);
      await tx.wait();
      setStatus("Success! Bounty fulfilled and HLTH tokens earned.");
      fetchBounties(); // refresh
    } catch (err: any) {
      console.error(err);
      setStatus("Failed to fulfill bounty.");
    }
  };

  return (
    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl">
      <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <FileText className="text-emerald-400" /> {t("patient_digital_passport")}
      </h2>

      {/* Tab Navigation */}
      <div className="flex space-x-2 mb-8 bg-black/20 p-1 rounded-xl w-full max-w-md">
        <button 
          onClick={() => setActiveTab("upload")} 
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === "upload" ? "bg-white/10 text-white shadow-lg" : "text-gray-400 hover:text-gray-200"}`}
        >
          {t("upload_record")}
        </button>
        <button 
          onClick={() => setActiveTab("view")} 
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === "view" ? "bg-white/10 text-white shadow-lg" : "text-gray-400 hover:text-gray-200"}`}
        >
          {t("my_vault")}
        </button>
        <button 
          onClick={() => setActiveTab("marketplace")} 
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === "marketplace" ? "bg-white/10 text-white shadow-lg" : "text-gray-400 hover:text-gray-200"}`}
        >
          Marketplace
        </button>
      </div>

      <div className="space-y-6">
        {activeTab === "upload" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Upload Section */}
            <div className="p-4 bg-white/5 rounded-xl border border-white/5">
              <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                <UploadCloud size={20} /> {t("upload_lab_report_full")}
              </h3>
              <input type="file" onChange={handleFileUpload} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20 mb-4" />
              <button onClick={handleEncryptAndUpload} className="mt-4 w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg font-medium hover:opacity-90 transition-opacity flex justify-center text-white">
                {t("encrypt_and_upload")}
              </button>
            </div>

            {/* Consent Section (Moved inside Upload tab) */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-4 bg-white/5 rounded-xl border border-white/5">
              <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                <Share2 size={20} /> {t("manage_consent")}
              </h3>
              <p className="text-sm text-gray-400 mb-2">{t("grant_upload_view_access")}</p>
              <input type="text" placeholder={t("doctors_username_wallet")} value={doctorAddress} onChange={(e) => setDoctorAddress(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors mb-4" />
              
              <div className="flex gap-2">
                <button onClick={() => handleToggleConsent(true)} className="flex-1 py-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg font-medium hover:bg-emerald-500/30 transition-colors">
                  {t("grant_consent")}
                </button>
                <button onClick={() => handleToggleConsent(false)} className="flex-1 py-3 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg font-medium hover:bg-red-500/30 transition-colors">
                  {t("revoke_consent")}
                </button>
              </div>
            </div>
          </div>
          </div>
        )}

        {activeTab === "view" && (
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Shield size={20} /> My Encrypted Records
            </h3>
            <p className="text-sm text-gray-400 mb-4">Click any record to automatically decrypt it using your master key.</p>
            
            {records.length === 0 ? (
              <div className="p-4 text-center text-gray-500 bg-black/20 rounded-lg border border-white/5">No records found. Upload one to get started!</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
                {records.map((record) => {
                  const isSelf = record.uploader.toLowerCase() === account.toLowerCase();
                  const btnClass = isSelf 
                    ? "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20" 
                    : "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20";
                  const iconColor = isSelf ? "text-emerald-400" : "text-blue-400";
                  const textColor = isSelf ? "text-emerald-100" : "text-blue-100";
                  
                  return (
                    <div 
                      key={record.id}
                      onClick={() => handleViewRecord(record.cid)}
                      className={`relative cursor-pointer p-4 border rounded-xl transition-all flex flex-col items-center justify-center gap-2 group ${btnClass}`}
                    >
                      <FileText className={`${iconColor} group-hover:scale-110 transition-transform`} size={24} />
                      <span className={`text-sm font-medium ${textColor}`}>Record #{record.id}</span>
                      <span className={`text-xs ${isSelf ? 'text-emerald-400/70' : 'text-blue-400/70'}`}>
                        By {isSelf ? 'You' : 'Doctor'}
                      </span>
                      
                      {/* Delete Button (Only for own records) */}
                      {isSelf && (
                        <button 
                          onClick={(e) => handleDeleteRecord(record.id, e)}
                          className="absolute top-2 right-2 p-1.5 bg-red-500/20 text-red-400 rounded-full hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete Record"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {decryptedData && (
              <div className="mt-4 p-4 bg-black/40 rounded-lg border border-white/10">
                <h4 className="text-sm font-medium text-emerald-400 mb-4 flex justify-between items-center">
                  Decrypted File Preview
                  <a href={decryptedData} download="medical_record" className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors text-xs">
                    Download File
                  </a>
                </h4>
                {decryptedData.startsWith("data:image") ? (
                  <img src={decryptedData} alt="Decrypted Medical Record" className="max-w-full h-auto rounded-lg border border-white/5" />
                ) : decryptedData.startsWith("data:application/pdf") ? (
                  <iframe src={decryptedData} className="w-full h-96 bg-white rounded-lg" />
                ) : (
                  <div className="max-h-64 overflow-auto bg-black/50 p-4 rounded text-xs font-mono text-gray-300 break-all">
                    {decryptedData}
                  </div>
                )}
                
                {/* AI ASSISTANT SECTION */}
                <div className="mt-6 pt-6 border-t border-white/10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-xl font-medium mb-4 flex items-center gap-2">
              <ShieldAlert className="text-purple-400" /> {t("ai_medical_assistant")}
            </h3>
            
            {decryptedData ? (
              <div className="bg-purple-900/20 border border-purple-500/20 rounded-xl p-4">
                <div className="flex gap-4 mb-4 border-b border-white/10 pb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={aiAction === "summarize"} onChange={() => setAiAction("summarize")} className="text-purple-500 focus:ring-purple-500 bg-black/20" />
                    <span className="text-sm text-gray-300">{t("auto_summarize_threats")}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={aiAction === "ask"} onChange={() => setAiAction("ask")} className="text-purple-500 focus:ring-purple-500 bg-black/20" />
                    <span className="text-sm text-gray-300">{t("ask_specific_question")}</span>
                  </label>
                </div>

                {aiAction === "ask" && (
                  <textarea 
                    value={aiQuestion} 
                    onChange={e => setAiQuestion(e.target.value)}
                    placeholder={t("ask_aegis_ai")}
                    className="w-full h-24 bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-purple-500 mb-4"
                  />
                )}

                <button 
                  onClick={() => handleAIAnalyze(aiAction)} 
                  disabled={aiLoading || (aiAction === "ask" && !aiQuestion.trim())}
                  className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 text-white"
                >
                  {aiLoading ? "Analyzing..." : aiAction === "summarize" ? t("auto_summarize_threats") : t("ask_aegis_ai")}
                </button>
                
                {aiResponse && (
                  <div className="p-4 bg-purple-900/10 border border-purple-500/20 rounded-lg mt-4 animate-in fade-in">
                    <div className="text-sm text-gray-300 leading-relaxed markdown-content">
                      <ReactMarkdown
                        components={{
                          strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-lg font-bold text-purple-400 mb-2" {...props} />,
                          h4: ({node, ...props}) => <h4 className="text-md font-bold text-purple-400 mb-2" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
                          li: ({node, ...props}) => <li className="text-gray-300" {...props} />,
                          p: ({node, ...props}) => <p className="mb-4 last:mb-0" {...props} />
                        }}
                      >
                        {aiResponse}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

              </div>
            )}
          </div>
        )}

        {activeTab === "marketplace" && (
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <span className="text-purple-400">💰</span> Earn Tokens via Research Bounties
            </h3>
            <p className="text-sm text-gray-400 mb-6">Researchers post bounties for specific health data. Provide your data to earn the reward instantly.</p>
            
            {bounties.length === 0 ? (
              <p className="text-gray-500 italic text-center py-8">No research bounties currently available.</p>
            ) : (
              <div className="space-y-4">
                {bounties.map((bounty) => (
                  <div key={bounty.id} className="p-6 bg-black/20 border border-white/10 rounded-xl hover:border-purple-500/50 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-lg font-medium text-white mb-1">"{bounty.description}"</h4>
                        <p className="text-xs text-gray-500">Posted by Researcher: {bounty.creator.substring(0,6)}...{bounty.creator.substring(38)}</p>
                      </div>
                      <div className="text-right">
                        <span className="block font-bold text-emerald-400 text-xl">{bounty.reward} HLTH</span>
                        <span className="block text-xs text-gray-500">Reward</span>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-white/10 flex gap-4 items-center">
                      <select 
                        value={sellCID} 
                        onChange={(e) => setSellCID(e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                      >
                        <option value="" disabled>-- Select a Record to Submit --</option>
                        {records.map(record => {
                          const isSelf = record.uploader.toLowerCase() === account.toLowerCase();
                          return (
                            <option key={record.id} value={record.cid}>
                              Record #{record.id} (Uploaded by {isSelf ? 'You' : 'Doctor'})
                            </option>
                          );
                        })}
                      </select>
                      
                      <button 
                        onClick={() => handleFulfillBounty(bounty.id)} 
                        className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg font-medium hover:opacity-90 text-white shadow-lg whitespace-nowrap"
                      >
                        Fulfill Bounty
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {status && <div className="p-4 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">{status}</div>}
      </div>
    </div>
  );
}
