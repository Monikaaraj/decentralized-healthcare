import CryptoJS from "crypto-js";

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
 * Mocks uploading an encrypted blob to IPFS and returns a dummy CID.
 * In production, this would use Pinata or Helia.
 */
export const uploadToIPFS = async (encryptedBlob: string): Promise<string> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // Return a mock IPFS CID (SHA256-like format)
  return "Qm" + CryptoJS.SHA256(encryptedBlob).toString().substring(0, 44);
};

/**
 * Mocks fetching data from IPFS by CID.
 * For this demo, since we don't have a real IPFS node running, 
 * we will rely on a local cache or assume the frontend handles state.
 * In a real scenario, we would `fetch("https://ipfs.io/ipfs/" + cid)`
 */
const inMemoryCache: Record<string, string> = {};

export const cacheToSimulatedIPFS = (cid: string, data: string) => {
    inMemoryCache[cid] = data;
    try {
        localStorage.setItem(cid, data);
    } catch (e) {
        console.warn("File too large for localStorage, keeping in memory for this session.");
    }
};

export const fetchFromIPFS = async (cid: string): Promise<string | null> => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return inMemoryCache[cid] || localStorage.getItem(cid);
};
