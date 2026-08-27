import CryptoJS from "crypto-js";
import { ethers } from "ethers";

/**
 * Deterministically generate a master AES key for a given patient address
 */
export const derivePatientKey = (patientAddress: string): string => {
  if (!patientAddress) return "fallback_key";
  const salt = "AEGIS_SECURE_VAULT_2026";
  const hash = ethers.keccak256(ethers.toUtf8Bytes(patientAddress.toLowerCase() + salt));
  return hash;
};

/**
 * Encrypts a string (e.g., base64 file data or JSON string) using AES-256
 */
export const encryptData = (data: string, secretKey: string): string => {
  return CryptoJS.AES.encrypt(data, secretKey).toString();
};

/**
 * Decrypts AES-256 encrypted string back to original string
 */
export const decryptData = (encryptedData: string, secretKey: string): string => {
  const bytes = CryptoJS.AES.decrypt(encryptedData, secretKey);
  return bytes.toString(CryptoJS.enc.Utf8);
};

/**
 * Uploads an encrypted blob to Pinata IPFS via backend proxy.
 */
export const uploadToIPFS = async (encryptedBlob: string): Promise<string> => {
  const res = await fetch('/api/ipfs/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encryptedData: encryptedBlob })
  });
  
  if (!res.ok) {
    throw new Error('Failed to upload to IPFS');
  }
  
  const data = await res.json();
  return data.cid;
};

/**
 * Fetches data from Pinata IPFS gateway via backend proxy.
 */
export const fetchFromIPFS = async (cid: string): Promise<string | null> => {
  try {
    const res = await fetch(`/api/ipfs/download?cid=${cid}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch (err) {
    console.error("IPFS Fetch Error:", err);
    return null;
  }
};
