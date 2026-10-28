import { ethers } from "ethers";

/**
 * AEGIS-AI Pure Ethers Merkle Tree Utility
 * Generates cryptographic Merkle Trees and roots for batch prescription uploads.
 */

export interface PrescriptionLeaf {
  patient: string;
  cid: string;
  timestamp?: number;
}

/**
 * Computes a standard 32-byte keccak256 hash for a prescription leaf:
 * keccak256(abi.encodePacked(address, string, uint256))
 */
export function hashPrescriptionLeaf(leaf: PrescriptionLeaf, timestamp = Math.floor(Date.now() / 1000)): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  // Standard packed keccak
  return ethers.keccak256(
    ethers.solidityPacked(
      ["address", "string", "uint256"],
      [leaf.patient, leaf.cid, timestamp]
    )
  );
}

/**
 * Generates a sorted-pair Merkle Root from an array of 32-byte leaf hashes.
 */
export function buildMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return ethers.ZeroHash;
  if (leaves.length === 1) return leaves[0];

  let currentLayer = [...leaves];

  while (currentLayer.length > 1) {
    const nextLayer: string[] = [];

    for (let i = 0; i < currentLayer.length; i += 2) {
      if (i + 1 < currentLayer.length) {
        // Sort pairs to match OpenZeppelin's MerkleProof standard
        const [a, b] = [currentLayer[i], currentLayer[i + 1]].sort();
        const combined = ethers.keccak256(ethers.concat([a, b]));
        nextLayer.push(combined);
      } else {
        // Carry odd leaf to next level
        nextLayer.push(currentLayer[i]);
      }
    }

    currentLayer = nextLayer;
  }

  return currentLayer[0];
}
