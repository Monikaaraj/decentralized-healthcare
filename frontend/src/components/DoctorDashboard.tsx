"use client";
import { useState } from "react";
import { fetchFromIPFS, decryptData, encryptData, uploadToIPFS, derivePatientKey } from "@/utils/crypto";
import { COMMON_MEDICINES } from "@/utils/medicines";
import { FileSearch, LockOpen, UploadCloud, FileText, Search, PlusCircle, Trash2, Download } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function DoctorDashboard({ contract, account }: { contract: any; account: string }) {
  const { t } = useLanguage();
  const [patientAddress, setPatientAddress] = useState("");
  const [decryptedData, setDecryptedData] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [records, setRecords] = useState<{id: number, cid: string, uploader: string}[]>([]);

  // Tab Navigation
  const [activeTab, setActiveTab] = useState<"upload" | "view" | "prescription">("upload");

  // Prescription State
  type Medicine = { name: string, morning: boolean, afternoon: boolean, night: boolean, notes: string };
  const [medicines, setMedicines] = useState<Medicine[]>([{ name: "", morning: false, afternoon: false, night: false, notes: "" }]);
  const [rxPatientName, setRxPatientName] = useState("");
  
  // Suggestion State
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);
  const [suggestionTimeout, setSuggestionTimeout] = useState<NodeJS.Timeout | null>(null);

  // Custom Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingPdfData, setPendingPdfData] = useState<string | null>(null);

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

  const handleAddMedicine = () => {
    setMedicines([...medicines, { name: "", morning: false, afternoon: false, night: false, notes: "" }]);
  };

  const handleMedicineChange = (index: number, field: keyof Medicine, value: any) => {
    const updated = [...medicines];
    (updated[index] as any)[field] = value;
    setMedicines(updated);

    if (field === "name") {
      if (suggestionTimeout) clearTimeout(suggestionTimeout);
      
      if (value.trim().length < 2) {
        setSuggestions([]);
        setActiveSuggestionIndex(null);
        return;
      }

      setActiveSuggestionIndex(index);
      
      const query = value.toLowerCase();
      const localMatches = COMMON_MEDICINES.filter(m => m.toLowerCase().includes(query)).slice(0, 5);
      
      if (localMatches.length > 0) {
        // Instant local match
        setSuggestions(localMatches);
      } else {
        // Fallback to Gemini if not in local dictionary
        setSuggestions(["✨ Searching AI Database..."]);
        
        const timeout = setTimeout(async () => {
          try {
            const res = await fetch('/api/suggest-medicine', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: value })
            });
            const data = await res.json();
            if (data.suggestions && data.suggestions.length > 0) {
              setSuggestions(data.suggestions);
            } else {
              setSuggestions(["❌ No matches found"]);
            }
          } catch (e) {
            setSuggestions(["❌ AI Error"]);
          }
        }, 400); // 400ms debounce
        
        setSuggestionTimeout(timeout);
      }
    }
  };

  const selectSuggestion = (index: number, name: string) => {
    const updated = [...medicines];
    updated[index].name = name;
    setMedicines(updated);
    setSuggestions([]);
    setActiveSuggestionIndex(null);
  };

  const handleRemoveMedicine = (index: number) => {
    setMedicines(medicines.filter((_, i) => i !== index));
  };

  const generatePrescriptionPDF = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const autoTableModule = await import("jspdf-autotable");
      const autoTable = autoTableModule.default;

      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(22);
      doc.setTextColor(59, 130, 246); // Blue
      doc.text("Aegis Healthcare", 105, 20, { align: "center" });
      
      doc.setFontSize(14);
      doc.setTextColor(100, 100, 100);
      doc.text("Official Digital Prescription", 105, 30, { align: "center" });
      
      // Rx Symbol
      doc.setFontSize(28);
      doc.setTextColor(0, 0, 0);
      doc.text("Rx", 20, 50);

      // Patient Details
      doc.setFontSize(12);
      doc.text(`Patient: ${rxPatientName || "Unknown"}`, 20, 65);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 75);
      doc.text(`Prescribed By: Doctor (${account.substring(0, 6)}...${account.substring(38)})`, 20, 85);

      // Table Data
      const tableColumn = ["Medicine Name", "Dosage (M - A - N)", "Special Notes"];
      const tableRows: any[][] = [];

      medicines.forEach(med => {
        if (med.name) {
          const dosage = `${med.morning ? "1" : "0"} - ${med.afternoon ? "1" : "0"} - ${med.night ? "1" : "0"}`;
          tableRows.push([med.name, dosage, med.notes]);
        }
      });

      if (tableRows.length === 0) {
        return alert("Please add at least one medicine to generate a prescription.");
      }

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 100,
        theme: 'grid',
        styles: { fontSize: 11, cellPadding: 5 },
        headStyles: { fillColor: [59, 130, 246] }
      });

      doc.save(`Prescription_${rxPatientName || "Patient"}.pdf`);
      
      const pdfDataUri = doc.output('datauristring');
      setPendingPdfData(pdfDataUri);
      setShowUploadModal(true);

    } catch (error: any) {
      console.error(error);
      setStatus(error.message || "Failed to generate PDF.");
    }
  };

  const confirmUpload = async (shouldUpload: boolean) => {
    setShowUploadModal(false);
    
    if (!shouldUpload || !pendingPdfData) {
      setStatus("Prescription PDF downloaded locally.");
      setPendingPdfData(null);
      return;
    }

    // Redirect to Upload Tab and pre-fill data
    setUploadFileData(pendingPdfData);
    setUploadPatientAddress(rxPatientName);
    setActiveTab("upload");
    setUploadStatus("Prescription ready for upload. Please confirm Patient ID and click Encrypt & Upload.");
    setPendingPdfData(null);
  };

  return (
    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl">
      <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <FileSearch className="text-blue-400" /> {t("doctor_portal")}
      </h2>
      
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 md:gap-4 mb-8 bg-black/40 p-1 md:p-2 rounded-2xl border border-white/5 shadow-inner">
        <button 
          onClick={() => setActiveTab("view")}
          className={`flex-1 min-w-[140px] py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${activeTab === "view" ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:bg-white/5'}`}
        >
          <FileSearch size={18} /> <span className="hidden sm:inline">{t("view_patient_vault")}</span>
        </button>
        <button 
          onClick={() => setActiveTab("upload")}
          className={`flex-1 min-w-[140px] py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${activeTab === "upload" ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/20' : 'text-gray-400 hover:bg-white/5'}`}
        >
          <UploadCloud size={18} /> <span className="hidden sm:inline">{t("upload_lab_report")}</span>
        </button>
        <button 
          onClick={() => setActiveTab("prescription")}
          className={`flex-1 min-w-[140px] py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${activeTab === "prescription" ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-lg shadow-purple-500/20' : 'text-gray-400 hover:bg-white/5'}`}
        >
          <FileText size={18} /> <span className="hidden sm:inline">{t("create_prescription")}</span>
        </button>
      </div>

      <div className="space-y-6">
        {activeTab === "upload" && (
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <UploadCloud size={20} /> {t("upload_lab_report_for_patient")}
            </h3>
            <p className="text-sm text-gray-400 mb-2">{t("enter_patient_username")}</p>
            <input type="text" placeholder={t("patient_username_wallet")} value={uploadPatientAddress} onChange={(e) => setUploadPatientAddress(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors mb-4" />
            <input type="file" onChange={handleFileUpload} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 mb-4" />
            <button onClick={handleEncryptAndUploadForPatient} className="mt-4 w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg font-medium hover:opacity-90 transition-opacity flex justify-center text-white">
              {t("encrypt_upload_patient_vault")}
            </button>
            {uploadStatus && <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10 text-sm text-gray-300">{uploadStatus}</div>}
          </div>
        )}

        {activeTab === "view" && (
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <LockOpen size={20} /> View Patient Records
            </h3>
            <p className="text-sm text-gray-400 mb-2">{t("enter_patient_username")}</p>
            <div className="flex gap-2 mb-4">
              <input type="text" placeholder={t("patient_username_wallet")} value={patientAddress} onChange={(e) => setPatientAddress(e.target.value)} className="flex-1 bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
              <button onClick={loadPatientRecords} className="px-6 py-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg font-medium hover:bg-blue-500/20 transition-colors">
                {t("load_patient_records")}
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

            {decryptedData && (
              <div className="mt-4 p-4 bg-black/40 rounded-xl border border-white/10 overflow-hidden">
                <h4 className="text-sm text-gray-400 mb-4 flex items-center justify-between">
                  Decrypted File Preview
                  <a 
                    href={decryptedData} 
                    download={`patient_record`}
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
                     <p className="text-xs break-all font-mono text-gray-300">{decryptedData}</p>
                   </div>
                )}
              </div>
            )}
            
            {status && <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10 text-sm text-gray-300">{status}</div>}
          </div>
        )}

        {activeTab === "prescription" && (
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-xl font-medium mb-4 flex items-center gap-2 text-purple-400">
              <FileText size={20} /> {t("digital_prescription_generator")}
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("patient_name_id")}</label>
              <input 
                type="text" 
                value={rxPatientName}
                onChange={e => setRxPatientName(e.target.value)}
                placeholder="e.g. rahulr13"
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end mb-2">
                <h4 className="font-medium text-gray-300">Prescribed Medicines</h4>
              </div>
              
              {medicines.map((med, index) => (
                <div key={index} className="p-4 bg-black/20 rounded-xl border border-white/5 flex flex-col md:flex-row gap-4 items-start md:items-center relative group">
                  <div className="flex-1 relative">
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">{t("medicine_name")}</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Paracetamol 500mg" 
                      value={med.name}
                      onChange={(e) => handleMedicineChange(index, "name", e.target.value)}
                      onBlur={() => setTimeout(() => { if (activeSuggestionIndex === index) setSuggestions([]) }, 200)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                    />
                    
                    {/* Gemini AI / Local Suggestions Dropdown */}
                    {activeSuggestionIndex === index && suggestions.length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-gray-900 border border-blue-500/50 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {suggestions.map((s, i) => {
                          const isActionable = !s.includes("Searching") && !s.includes("No matches") && !s.includes("Error");
                          return (
                            <li 
                              key={i} 
                              onClick={() => {
                                if (isActionable) selectSuggestion(index, s);
                              }}
                              className={`p-3 text-sm text-gray-300 border-b border-white/10 last:border-0 flex items-center gap-2 ${isActionable ? 'hover:bg-blue-500/30 hover:text-white cursor-pointer' : 'cursor-default opacity-70'}`}
                            >
                              {isActionable && <span className="text-[10px]">✨</span>} {s}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1 items-center bg-black/40 px-4 py-2 rounded-lg border border-white/10">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{t("dosage")}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex flex-col items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={med.morning} onChange={(e) => handleMedicineChange(index, "morning", e.target.checked)} className="w-4 h-4 accent-blue-500 cursor-pointer" />
                      </label>
                      <span className="text-gray-500 font-bold">-</span>
                      <label className="flex flex-col items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={med.afternoon} onChange={(e) => handleMedicineChange(index, "afternoon", e.target.checked)} className="w-4 h-4 accent-blue-500 cursor-pointer" />
                      </label>
                      <span className="text-gray-500 font-bold">-</span>
                      <label className="flex flex-col items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={med.night} onChange={(e) => handleMedicineChange(index, "night", e.target.checked)} className="w-4 h-4 accent-blue-500 cursor-pointer" />
                      </label>
                    </div>
                  </div>

                  <div className="flex-1 w-full">
                    <input 
                      type="text" 
                      placeholder={t("notes")} 
                      value={med.notes}
                      onChange={(e) => handleMedicineChange(index, "notes", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>

                  {medicines.length > 1 && (
                    <button 
                      onClick={() => handleRemoveMedicine(index)}
                      className="text-red-400 hover:text-red-300 p-2 md:mt-0 opacity-50 hover:opacity-100 transition-opacity"
                      title={t("remove_medicine")}
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              ))}
              
              <button 
                onClick={handleAddMedicine} 
                className="w-full py-4 border-2 border-dashed border-white/10 text-gray-400 hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/5 rounded-xl flex items-center justify-center gap-2 transition-all font-medium"
              >
                <PlusCircle size={18} /> {t("add_another_medicine")}
              </button>
            </div>
            
            <div className="flex justify-end mt-4">
              <button 
                onClick={generatePrescriptionPDF} 
                disabled={!rxPatientName || !medicines[0].name}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg text-sm font-bold flex items-center gap-2 text-white hover:opacity-90 shadow-lg disabled:opacity-50"
              >
                <Download size={18} /> {t("generate_download_pdf")}
              </button>
            </div>
            
            {status && <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/10 text-sm text-gray-300">{status}</div>}
          </div>
        )}
      </div>

      {/* Premium Upload Confirmation Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-gray-900 border border-blue-500/30 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all animate-in zoom-in-95 duration-300 relative overflow-hidden">
            {/* Glowing background accent */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/20 blur-3xl rounded-full"></div>
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-6">
                <UploadCloud size={32} />
              </div>
              
              <h3 className="text-xl font-bold text-white mb-2">{t("upload_to_patient_vault")}</h3>
              
              <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                {t("prescription_downloaded_prompt")} <strong className="text-blue-400">{rxPatientName}</strong>{t("permanent_medical_record")}
              </p>
              
              <div className="flex w-full gap-3">
                <button 
                  onClick={() => confirmUpload(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 transition-colors font-medium text-sm"
                >
                  {t("no_just_download")}
                </button>
                <button 
                  onClick={() => confirmUpload(true)}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:opacity-90 transition-opacity font-medium text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
                >
                  <LockOpen size={16} /> {t("yes_encrypt_upload")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
