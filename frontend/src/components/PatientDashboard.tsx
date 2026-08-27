"use client";
import { useState, useEffect, useCallback } from "react";
import { encryptData, uploadToIPFS, cacheToSimulatedIPFS, fetchFromIPFS, decryptData, derivePatientKey } from "@/utils/crypto";
import { UploadCloud, Shield, Share2, FileText } from "lucide-react";

import { ethers } from "ethers";

export default function PatientDashboard({ contract, marketplaceContract, account }: { contract: any; marketplaceContract: any; account: string }) {
  const [fileData, setFileData] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [doctorAddress, setDoctorAddress] = useState<string>("");
  const [sellCID, setSellCID] = useState<string>("");
  const [sellPrice, setSellPrice] = useState<string>("");
  
  // For viewing records
  const [records, setRecords] = useState<{id: number, cid: string, uploader: string}[]>([]);
  const [decryptedData, setDecryptedData] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    if (!contract || !account) return;
    try {
      const count = await contract.getRecordCount(account);
      const loadedRecords = [];
      for (let i = 0; i < Number(count); i++) {
        const recordData = await contract.getRecord(account, i);
        loadedRecords.push({ id: i, cid: recordData[0], uploader: recordData[1] });
      }
      setRecords(loadedRecords);
    } catch (e) {
      console.error("Failed to load records", e);
    }
  }, [contract, account]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

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
      setStatus("Successfully decrypted your record.");
    } catch (err: any) {
      console.error(err);
      setStatus(err.message || "Failed to fetch or decrypt record.");
    }
  };

  const handleSellData = async () => {
    if (!marketplaceContract || !sellCID || !sellPrice) return alert("Missing marketplace contract, CID, or price");
    setStatus("Listing data on the Marketplace...");
    try {
      const priceInWei = ethers.parseUnits(sellPrice, 18);
      const tx = await marketplaceContract.listData(sellCID, priceInWei);
      await tx.wait();
      setStatus(`Success! Data listed for ${sellPrice} HLTH`);
    } catch (err: any) {
      console.error(err);
      setStatus("Error listing data");
    }
  };

  return (
    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl">
      <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <Shield className="text-emerald-400" /> Patient Digital Passport
      </h2>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Upload Section */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/5">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <UploadCloud size={20} /> Upload New Record
            </h3>
            <input type="file" onChange={handleFileUpload} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-500/10 file:text-purple-400 hover:file:bg-purple-500/20 mb-4" />
            <button onClick={handleEncryptAndUpload} className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg font-medium hover:opacity-90 transition-opacity flex justify-center text-white">
              Encrypt & Anchor (Invisible Auth)
            </button>
          </div>

          {/* Consent Section */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/5">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Share2 size={20} /> Manage Consent
            </h3>
            <p className="text-sm text-gray-400 mb-2">Enter Doctor's Username (e.g. drsmith)</p>
            <input type="text" placeholder="Doctor's Username or Wallet Address" value={doctorAddress} onChange={(e) => setDoctorAddress(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors mb-4" />
            
            <div className="flex gap-4">
              <button onClick={() => handleToggleConsent(true)} className="flex-1 py-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-lg hover:bg-emerald-500/30 transition-colors">Grant Access</button>
              <button onClick={() => handleToggleConsent(false)} className="flex-1 py-3 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 transition-colors">Revoke Access</button>
            </div>
          </div>
        </div>

        {/* View Records Section */}
        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
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
                  <button 
                    key={record.id}
                    onClick={() => handleViewRecord(record.cid)}
                    className={`p-4 border rounded-xl transition-all flex flex-col items-center justify-center gap-2 group ${btnClass}`}
                  >
                    <FileText className={`${iconColor} group-hover:scale-110 transition-transform`} size={24} />
                    <span className={`text-sm font-medium ${textColor}`}>Record #{record.id}</span>
                    <span className={`text-xs ${isSelf ? 'text-emerald-400/70' : 'text-blue-400/70'}`}>
                      By {isSelf ? 'You' : 'Doctor'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          
          {decryptedData && (
            <div className="mt-4 p-4 bg-black/40 rounded-lg border border-white/10">
              <h4 className="text-sm font-medium text-emerald-400 mb-2">Decrypted File Preview:</h4>
              {decryptedData.startsWith("data:image") ? (
                <img src={decryptedData} alt="Decrypted Medical Record" className="max-w-full h-auto rounded-lg border border-white/5" />
              ) : (
                <iframe src={decryptedData} className="w-full h-64 bg-white rounded-lg" />
              )}
            </div>
          )}
        </div>

        {/* Sell Data Section */}
        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <span className="text-purple-400">💰</span> Sell Data to Researchers
          </h3>
          <p className="text-sm text-gray-400 mb-2">The IPFS CID will auto-fill after you upload a record.</p>
          <input type="text" placeholder="IPFS CID (Auto-fills after upload)" value={sellCID} readOnly className="w-full bg-black/40 border border-white/5 rounded-lg p-3 text-gray-400 focus:outline-none cursor-not-allowed mb-4" />
          <input type="number" placeholder="Set Price in HLTH Tokens (e.g. 50)" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors mb-4" />
          <button onClick={handleSellData} className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg font-medium hover:opacity-90 transition-opacity flex justify-center text-white">
            List on Marketplace
          </button>
        </div>

        {status && <div className="p-4 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">{status}</div>}
      </div>
    </div>
  );
}
