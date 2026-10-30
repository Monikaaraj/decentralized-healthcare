"use client";

import React, { useState } from 'react';
import { ethers } from 'ethers';
import { buildMerkleRoot } from '@/utils/merkle';

// Visual Merkle Batch Builder for interactive exploration
const MerkleBatchUI: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [root, setRoot] = useState<string>('');
  const [leafHashes, setLeafHashes] = useState<string[]>([]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const newFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...newFiles]);
  };

  const computeMerkle = async () => {
    const hashes = await Promise.all(
      files.map(async f => {
        const array = await f.arrayBuffer();
        return ethers.keccak256(new Uint8Array(array));
      })
    );
    setLeafHashes(hashes);
    const computedRoot = buildMerkleRoot(hashes);
    setRoot(computedRoot);
  };

  return (
    <div className="p-4 border border-white/10 rounded-xl bg-black/40 text-white">
      <h3 className="text-lg font-semibold mb-2 text-emerald-400">Merkle Batch Playground</h3>
      <div
        className="border-dashed border-2 border-white/20 p-6 text-center cursor-pointer rounded-lg hover:border-emerald-500/50 transition-colors"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        <p className="text-gray-300">Drag and drop diagnostic files here to build a cryptographic tree</p>
        <input
          type="file"
          multiple
          className="hidden"
          id="merkle-file-input"
          onChange={e => {
            if (e.target.files) {
              setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
            }
          }}
        />
        <label htmlFor="merkle-file-input" className="inline-block mt-3 px-4 py-1.5 bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded cursor-pointer text-sm">
          Select Files
        </label>
      </div>
      {files.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-gray-400">{files.length} file(s) queued.</p>
          <button
            onClick={computeMerkle}
            className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Compute Merkle Root
          </button>
        </div>
      )}
      {root && (
        <div className="mt-4 p-3 bg-black/60 rounded-lg border border-emerald-500/30">
          <p className="text-xs text-gray-400">Cryptographic Root Hash:</p>
          <p className="font-mono text-emerald-400 text-xs break-all mt-1">{root}</p>
          <div className="mt-2 space-y-1">
            <p className="text-xs text-gray-400">Leaves ({leafHashes.length}):</p>
            {leafHashes.map((h, idx) => (
              <p key={idx} className="text-xs font-mono text-gray-300 truncate">
                Leaf #{idx}: {h}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MerkleBatchUI;
