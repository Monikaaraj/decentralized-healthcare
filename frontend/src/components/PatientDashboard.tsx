"use client";
import { useState } from "react";
import { encryptData, uploadToIPFS, cacheToSimulatedIPFS } from "@/utils/crypto";
import { UploadCloud, Shield, Share2 } from "lucide-react";

import { ethers } from "ethers";

export default function PatientDashboard({ contract, marketplaceContract, account }: { contract: any; marketplaceContract: any; account: string }) {
  const [fileData, setFileData] = useState<string>("");
  const [secretKey, setSecretKey] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [doctorAddress, setDoctorAddress] = useState<string>("");
  const [sellCID, setSellCID] = useState<string>("");
  const [sellPrice, setSellPrice] = useState<string>("");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setFileData(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleEncryptAndUpload = async () => {
    if (!fileData || !secretKey) return alert("Missing file or secret key");
    setStatus("Encrypting locally with AES-256...");
    
    // Encrypt
    const encrypted = encryptData(fileData, secretKey);
    
    setStatus("Uploading encrypted blob to Pinata IPFS...");
    try {
      const cid = await uploadToIPFS(encrypted);
      
      setStatus("Anchoring real IPFS CID to Polygon Smart Contract...");
      const tx = await contract.addRecord(cid);
      await tx.wait();
      setStatus(`Success! Record anchored. CID: ${cid}`);
    } catch (err: any) {
      console.error(err);
      setStatus("Error processing record");
    }
  };

  const handleToggleConsent = async (grant: boolean) => {
    if (!doctorAddress) return;
    setStatus(`Processing consent transaction...`);
    try {
      const tx = grant ? await contract.grantConsent(doctorAddress) : await contract.revokeConsent(doctorAddress);
      await tx.wait();
      setStatus(`Consent ${grant ? "Granted" : "Revoked"} for ${doctorAddress}`);
    } catch (err: any) {
      setStatus("Consent transaction failed.");
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
        {/* Upload Section */}
        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <UploadCloud size={20} /> Upload Medical Record
          </h3>
          <input type="file" onChange={handleFileUpload} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20 mb-4" />
          <input type="password" placeholder="AES Secret Key for Encryption" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors" />
          <button onClick={handleEncryptAndUpload} className="mt-4 w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg font-medium hover:opacity-90 transition-opacity flex justify-center text-white">
            Encrypt & Anchor
          </button>
        </div>

        {/* Consent Section */}
        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Share2 size={20} /> Manage Consent
          </h3>
          <input type="text" placeholder="Doctor's Wallet Address (0x...)" value={doctorAddress} onChange={(e) => setDoctorAddress(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors mb-4" />
          <div className="flex gap-4">
            <button onClick={() => handleToggleConsent(true)} className="flex-1 py-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-lg hover:bg-emerald-500/30 transition-colors">Grant Access</button>
            <button onClick={() => handleToggleConsent(false)} className="flex-1 py-3 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 transition-colors">Revoke Access</button>
          </div>
        </div>

        {/* Sell Data Section */}
        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <span className="text-purple-400">💰</span> Sell Data to Researchers
          </h3>
          <input type="text" placeholder="IPFS CID (Qm...)" value={sellCID} onChange={(e) => setSellCID(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors mb-4" />
          <input type="number" placeholder="Price in HLTH Tokens (e.g. 50)" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors mb-4" />
          <button onClick={handleSellData} className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg font-medium hover:opacity-90 transition-opacity flex justify-center text-white">
            List on Marketplace
          </button>
        </div>

        {status && <div className="p-4 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">{status}</div>}
      </div>
    </div>
  );
}
