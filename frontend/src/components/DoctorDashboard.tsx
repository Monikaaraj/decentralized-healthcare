"use client";
import { useState } from "react";
import { fetchFromIPFS, decryptData, encryptData, uploadToIPFS } from "@/utils/crypto";
import { FileSearch, LockOpen, UploadCloud } from "lucide-react";

export default function DoctorDashboard({ contract, account }: { contract: any; account: string }) {
  const [patientAddress, setPatientAddress] = useState("");
  const [recordId, setRecordId] = useState("0");
  const [secretKey, setSecretKey] = useState("");
  const [decryptedData, setDecryptedData] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  // Upload State
  const [uploadFileData, setUploadFileData] = useState<string>("");
  const [uploadPatientAddress, setUploadPatientAddress] = useState("");
  const [uploadSecretKey, setUploadSecretKey] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setUploadFileData(event.target?.result as string);
      reader.readAsDataURL(file);
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

  const handleEncryptAndUploadForPatient = async () => {
    if (!uploadFileData || !uploadSecretKey || !uploadPatientAddress) return alert("Missing file, key, or patient address");
    setUploadStatus("Encrypting locally with AES-256...");
    
    // Encrypt
    const encrypted = encryptData(uploadFileData, uploadSecretKey);
    
    setUploadStatus("Uploading encrypted blob to IPFS...");
    try {
      const cid = await uploadToIPFS(encrypted);
      
      setUploadStatus("Anchoring to blockchain on behalf of patient...");
      const resolvedAddress = resolveAddress(uploadPatientAddress);
      const tx = await contract.addRecordForPatient(resolvedAddress, cid);
      await tx.wait();
      setUploadStatus(`Success! Record anchored to ${uploadPatientAddress}.`);
    } catch (err: any) {
      console.error(err);
      setUploadStatus(err.message || "Error processing record. Ensure the patient granted you access.");
    }
  };

  const handleFetchRecord = async () => {
    if (!patientAddress || !secretKey) return alert("Missing inputs");
    setStatus("Verifying smart contract consent...");
    try {
      // Get CID from contract
      const resolvedAddress = resolveAddress(patientAddress);
      const cid = await contract.getRecord(resolvedAddress, parseInt(recordId));
      setStatus(`Consent verified! Fetching CID: ${cid} from IPFS...`);
      
      const encryptedBlob = await fetchFromIPFS(cid);
      if (!encryptedBlob) throw new Error("Record not found in IPFS");

      setStatus("Decrypting with provided patient key...");
      const decrypted = decryptData(encryptedBlob, secretKey);
      setDecryptedData(decrypted);
      setStatus("Successfully decrypted patient record.");
    } catch (err: any) {
      console.error(err);
      setStatus(err.message || "Access denied or record not found.");
    }
  };

  return (
    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl">
      <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <FileSearch className="text-blue-400" /> Doctor Portal
      </h2>
      
      <div className="space-y-6">
        {/* Upload For Patient Section */}
        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <UploadCloud size={20} /> Upload Lab Report for Patient
          </h3>
          <p className="text-sm text-gray-400 mb-2">Enter Patient Username (e.g. rahulr13)</p>
          <input type="text" placeholder="Patient's Username or Wallet Address" value={uploadPatientAddress} onChange={(e) => setUploadPatientAddress(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors mb-4" />
          <input type="file" onChange={handleFileUpload} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 mb-4" />
          <input type="password" placeholder="AES Secret Key (Share this with patient out-of-band)" value={uploadSecretKey} onChange={(e) => setUploadSecretKey(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
          <button onClick={handleEncryptAndUploadForPatient} className="mt-4 w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg font-medium hover:opacity-90 transition-opacity flex justify-center text-white">
            Encrypt & Upload to Patient's Vault
          </button>
          {uploadStatus && <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10 text-sm text-gray-300">{uploadStatus}</div>}
        </div>

        {/* Fetch Record Section */}
        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <LockOpen size={20} /> Decrypt Existing Record
          </h3>
          <p className="text-sm text-gray-400 mb-2">Enter Patient Username (e.g. rahulr13)</p>
          <input type="text" placeholder="Patient's Username or Wallet Address" value={patientAddress} onChange={(e) => setPatientAddress(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors mb-4" />
          <input type="number" placeholder="Record ID (e.g., 0)" value={recordId} onChange={(e) => setRecordId(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors mb-4" />
          <input type="password" placeholder="Patient's Provided Secret Key" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors mb-4" />
          
          <button onClick={handleFetchRecord} className="w-full py-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center justify-center gap-2">
            <LockOpen size={20} /> Request & Decrypt Record
          </button>

          {status && <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10 text-sm text-gray-300">{status}</div>}
        </div>

        {decryptedData && (
          <div className="mt-4 p-4 bg-black/40 rounded-xl border border-white/10 overflow-hidden">
            <h4 className="text-sm text-gray-400 mb-4 flex items-center justify-between">
              Decrypted File Preview
              <a 
                href={decryptedData} 
                download={`decrypted_record_${recordId}`}
                className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors text-xs"
              >
                Download File
              </a>
            </h4>
            
            {decryptedData.startsWith("data:image") ? (
               <img src={decryptedData} alt="Medical Record" className="max-w-full rounded-lg" />
            ) : decryptedData.startsWith("data:application/pdf") ? (
               <iframe src={decryptedData} className="w-full h-96 rounded-lg bg-white" title="PDF Preview" />
            ) : (
               <div className="max-h-64 overflow-auto">
                 <p className="text-xs break-all font-mono text-gray-300">{decryptedData.substring(0, 500)}...</p>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
