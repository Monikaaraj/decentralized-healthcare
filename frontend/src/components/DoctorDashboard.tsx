"use client";
import { useState } from "react";
import { fetchFromIPFS, decryptData, encryptData, uploadToIPFS, derivePatientKey } from "@/utils/crypto";
import { FileSearch, LockOpen, UploadCloud, FileText, Search } from "lucide-react";

export default function DoctorDashboard({ contract, account }: { contract: any; account: string }) {
  const [patientAddress, setPatientAddress] = useState("");
  const [decryptedData, setDecryptedData] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [records, setRecords] = useState<{id: number, cid: string, uploader: string}[]>([]);

  // Upload State
  const [uploadFileData, setUploadFileData] = useState<string>("");
  const [uploadPatientAddress, setUploadPatientAddress] = useState("");
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
    if (!uploadFileData || !uploadPatientAddress) return alert("Missing file or patient address");
    setUploadStatus("Encrypting locally with AES-256...");
    
    // Encrypt
    const resolvedAddress = resolveAddress(uploadPatientAddress);
    const masterKey = derivePatientKey(resolvedAddress);
    const encrypted = encryptData(uploadFileData, masterKey);
    
    setUploadStatus("Uploading encrypted blob to IPFS...");
    try {
      const cid = await uploadToIPFS(encrypted);
      
      setUploadStatus("Anchoring to blockchain on behalf of patient...");
      const tx = await contract.addRecordForPatient(resolvedAddress, cid);
      await tx.wait();
      setUploadStatus(`Success! Record anchored to ${uploadPatientAddress}.`);
    } catch (err: any) {
      console.error(err);
      setUploadStatus(err.message || "Error processing record. Ensure the patient granted you access.");
    }
  };

  const loadPatientRecords = async () => {
    if (!patientAddress) return;
    setStatus("Verifying consent and loading records...");
    setRecords([]);
    try {
      const resolvedAddress = resolveAddress(patientAddress);
      const count = await contract.getRecordCount(resolvedAddress);
      const loadedRecords = [];
      for (let i = 0; i < Number(count); i++) {
        const recordData = await contract.getRecord(resolvedAddress, i);
        loadedRecords.push({ id: i, cid: recordData[0], uploader: recordData[1] });
      }
      setRecords(loadedRecords);
      setStatus(`Loaded ${count} records for patient.`);
    } catch (err: any) {
      console.error(err);
      setStatus("Error loading records. Ensure the patient granted you access.");
    }
  };

  const handleViewRecord = async (cid: string) => {
    setStatus(`Fetching CID: ${cid} from IPFS...`);
    try {
      const encryptedBlob = await fetchFromIPFS(cid);
      if (!encryptedBlob) throw new Error("Record not found in IPFS");

      setStatus("Decrypting with patient's master key...");
      const resolvedAddress = resolveAddress(patientAddress);
      const masterKey = derivePatientKey(resolvedAddress);
      const decrypted = decryptData(encryptedBlob, masterKey);
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
          <button onClick={handleEncryptAndUploadForPatient} className="mt-4 w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg font-medium hover:opacity-90 transition-opacity flex justify-center text-white">
            Encrypt & Upload to Patient's Vault (Invisible Auth)
          </button>
          {uploadStatus && <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10 text-sm text-gray-300">{uploadStatus}</div>}
        </div>

        {/* Fetch Record Section */}
        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <LockOpen size={20} /> View Patient Records
          </h3>
          <p className="text-sm text-gray-400 mb-2">Enter Patient Username (e.g. rahulr13) to load their records.</p>
          <div className="flex gap-2 mb-4">
            <input type="text" placeholder="Patient's Username or Wallet Address" value={patientAddress} onChange={(e) => setPatientAddress(e.target.value)} className="flex-1 bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
            <button onClick={loadPatientRecords} className="px-6 py-3 bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-2">
              <Search size={20} /> Load
            </button>
          </div>

          {records.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
              {records.map((record) => {
                const isDoctor = record.uploader.toLowerCase() !== resolveAddress(patientAddress).toLowerCase();
                const btnClass = isDoctor
                  ? "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20"
                  : "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20";
                const iconColor = isDoctor ? "text-blue-400" : "text-emerald-400";
                const textColor = isDoctor ? "text-blue-100" : "text-emerald-100";

                return (
                  <button 
                    key={record.id}
                    onClick={() => handleViewRecord(record.cid)}
                    className={`p-4 border rounded-xl transition-all flex flex-col items-center justify-center gap-2 group ${btnClass}`}
                  >
                    <FileText className={`${iconColor} group-hover:scale-110 transition-transform`} size={24} />
                    <span className={`text-sm font-medium ${textColor}`}>Record #{record.id}</span>
                    <span className={`text-xs ${isDoctor ? 'text-blue-400/70' : 'text-emerald-400/70'}`}>
                      By {isDoctor ? 'Doctor' : 'Patient'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

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
