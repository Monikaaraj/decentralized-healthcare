import { useState, useEffect } from 'react';
import { ethers } from "ethers";

export default function ResearchDashboard({ marketplaceContract, tokenContract, account }: { marketplaceContract: any; tokenContract: any; account: string }) {
  const [flStatus, setFlStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  // Marketplace State
  const [hlthBalance, setHlthBalance] = useState<string>("0");
  const [listings, setListings] = useState<any[]>([]);
  const [marketStatus, setMarketStatus] = useState<string>("");

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/fl/status');
      const data = await res.json();
      setFlStatus(data);
    } catch (err) {
      console.error("Failed to fetch FL status", err);
    }
  };

  const fetchMarketplaceData = async () => {
    if (!tokenContract || !marketplaceContract || !account) return;
    
    try {
      // Get HLTH Balance
      const balance = await tokenContract.balanceOf(account);
      setHlthBalance(ethers.formatUnits(balance, 18));

      // Fetch all listings
      const totalListings = await marketplaceContract.nextListingId();
      const loadedListings = [];
      for (let i = 0; i < Number(totalListings); i++) {
        const listing = await marketplaceContract.listings(i);
        if (listing.isActive) {
          loadedListings.push({
            id: i,
            patient: listing.patient,
            ipfsCID: listing.ipfsCID,
            price: ethers.formatUnits(listing.price, 18)
          });
        }
      }
      setListings(loadedListings);
    } catch (err) {
      console.error("Error fetching marketplace data:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchMarketplaceData();
    const interval = setInterval(() => {
      fetchStatus();
    }, 2000);
    return () => clearInterval(interval);
  }, [marketplaceContract, tokenContract, account]);

  const startTraining = async () => {
    setLoading(true);
    try {
      await fetch('/api/fl/start', { method: 'POST' });
      fetchStatus();
    } catch (err) {
      console.error("Failed to start FL", err);
    }
    setLoading(false);
  };

  const handleMintTokens = async () => {
    if (!tokenContract) return;
    setMarketStatus("Minting 100 HLTH tokens...");
    try {
      const tx = await tokenContract.requestTokens();
      await tx.wait();
      setMarketStatus("Success! Received 100 HLTH.");
      fetchMarketplaceData();
    } catch (err: any) {
      console.error(err);
      setMarketStatus("Error minting tokens.");
    }
  };

  const handlePurchase = async (id: number, priceStr: string) => {
    if (!tokenContract || !marketplaceContract) return;
    setMarketStatus("Approving HLTH token spend...");
    try {
      const priceWei = ethers.parseUnits(priceStr, 18);
      
      // Step 1: Approve Marketplace to spend HLTH
      const marketplaceAddress = await marketplaceContract.getAddress();
      const approveTx = await tokenContract.approve(marketplaceAddress, priceWei);
      await approveTx.wait();

      setMarketStatus("Purchasing data...");
      
      // Step 2: Purchase Data
      const purchaseTx = await marketplaceContract.purchaseData(id);
      await purchaseTx.wait();

      setMarketStatus("Success! Data purchased successfully.");
      fetchMarketplaceData();
    } catch (err: any) {
      console.error(err);
      setMarketStatus("Purchase failed.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      
      {/* --- Data Marketplace Section --- */}
      <div className="bg-white/5 border border-indigo-500/30 p-8 rounded-2xl backdrop-blur-xl relative overflow-hidden group">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-6">
          Decentralized Data Marketplace
        </h2>
        
        <div className="flex justify-between items-center mb-6 p-4 bg-black/40 rounded-xl border border-white/10">
          <div>
            <p className="text-gray-400 text-sm">Your HLTH Balance</p>
            <p className="text-2xl font-bold text-indigo-400">{hlthBalance} <span className="text-sm">HLTH</span></p>
          </div>
          <button onClick={handleMintTokens} className="px-4 py-2 bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 rounded-lg hover:bg-indigo-500/30 transition-colors text-sm font-medium">
            💰 Faucet (Get 100 HLTH)
          </button>
        </div>

        {marketStatus && <div className="p-4 mb-6 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">{marketStatus}</div>}

        <h3 className="text-lg font-semibold text-white mb-4">Available Medical Datasets</h3>
        
        {listings.length === 0 ? (
          <p className="text-gray-500 italic text-center py-8">No data currently listed on the marketplace.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {listings.map((item) => (
              <div key={item.id} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-indigo-500/50 transition-colors">
                <p className="text-xs text-gray-500 mb-2">Provider: {item.patient.substring(0,6)}...{item.patient.substring(38)}</p>
                <p className="text-sm font-mono text-emerald-400 mb-4 bg-emerald-400/10 p-2 rounded truncate" title={item.ipfsCID}>
                  CID: {item.ipfsCID}
                </p>
                <div className="flex justify-between items-center mt-4">
                  <span className="font-bold text-white">{item.price} HLTH</span>
                  <button onClick={() => handlePurchase(item.id, item.price)} className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 rounded-lg text-sm font-medium text-white shadow-lg">
                    Buy Access
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Federated Learning Section --- */}
      <div className="bg-white/5 border border-purple-500/30 p-8 rounded-2xl backdrop-blur-xl relative overflow-hidden group">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-6">
          Federated Diagnostic Model Training
        </h2>
        
        <p className="text-gray-400 mb-6 text-sm">
          Initialize a decentralized AI training job. This will securely aggregate model gradients from participating hospital nodes without ever exposing raw medical records.
        </p>

        <button 
          onClick={startTraining} 
          disabled={loading || flStatus?.status === "training"}
          className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl shadow-lg shadow-purple-500/25 transition-all font-semibold disabled:opacity-50"
        >
          {loading || flStatus?.status === "training" ? "Training in Progress..." : "🚀 Initiate Global Training Run"}
        </button>

        {flStatus && flStatus.status !== "idle" && (
          <div className="mt-8 space-y-4">
            <h3 className="text-lg font-semibold text-white">Training Metrics (Real-time)</h3>
            <div className="flex items-center space-x-2 text-sm">
               <span className="text-gray-400">Status:</span>
               <span className={`px-2 py-1 rounded text-xs font-bold ${flStatus.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                 {flStatus.status ? flStatus.status.toUpperCase() : "UNKNOWN"}
               </span>
            </div>
            
            <div className="space-y-3">
              {flStatus.rounds && flStatus.rounds.map((r: any, idx: number) => (
                <div key={idx} className="p-4 bg-black/40 rounded-lg border border-white/10 flex justify-between items-center">
                  <div>
                    <div className="text-purple-400 font-bold mb-1">Round {r.round} Aggregation</div>
                    <div className="text-xs text-gray-500">Aggregated from 3 isolated silos</div>
                  </div>
                  <div className="text-right">
                    <div className="text-emerald-400 font-mono font-bold text-lg">
                       {(r.accuracy * 100).toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500">Global Accuracy</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
