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
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;
  if (!jwt) throw new Error("Pinata JWT not found");
  
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`
    },
    body: JSON.stringify({ pinataContent: { data: encryptedBlob } })
  });
  
  if (!res.ok) {
    throw new Error('Failed to upload to IPFS');
  }
  
  const data = await res.json();
  return data.IpfsHash;
};

/**
 * Fetches data from Pinata IPFS gateway via backend proxy.
 */
export const fetchFromIPFS = async (cid: string): Promise<string | null> => {
  // IPFS gateways to try concurrently for maximum speed
  const gateways = [
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`
  ];

  try {
    // Race all gateways at the exact same time using Promise.any
    // The first one to return a valid JSON object wins!
    const result = await Promise.any(
      gateways.map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Gateway ${url} failed`);
        const json = await res.json();
        if (json && json.data) {
          return json.data;
        }
        throw new Error(`Invalid format from ${url}`);
      })
    );
    return result;
  } catch (err) {
    console.error("All IPFS gateways failed or timed out for CID:", cid);
    return null;
  }
};
