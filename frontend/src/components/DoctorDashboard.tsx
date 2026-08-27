"use client";
import { useState } from "react";
import { fetchFromIPFS, decryptData } from "@/utils/crypto";
import { FileSearch, LockOpen } from "lucide-react";

export default function DoctorDashboard({ contract, account }: { contract: any; account: string }) {
  const [patientAddress, setPatientAddress] = useState("");
  const [recordId, setRecordId] = useState("0");
  const [secretKey, setSecretKey] = useState("");
  const [decryptedData, setDecryptedData] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const handleFetchRecord = async () => {
    if (!patientAddress || !secretKey) return alert("Missing inputs");
    setStatus("Verifying smart contract consent...");
    try {
      // Get CID from contract
      const cid = await contract.getRecord(patientAddress, parseInt(recordId));
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
      
      <div className="space-y-4">
        <input type="text" placeholder="Patient Wallet Address (0x...)" value={patientAddress} onChange={(e) => setPatientAddress(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
        <input type="number" placeholder="Record ID (e.g., 0)" value={recordId} onChange={(e) => setRecordId(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
        <input type="password" placeholder="Patient's Provided Secret Key" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
        
        <button onClick={handleFetchRecord} className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg font-medium text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
          <LockOpen size={20} /> Request & Decrypt Record
        </button>

        {status && <div className="p-4 bg-white/5 rounded-lg border border-white/10 text-sm text-gray-300">{status}</div>}

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
