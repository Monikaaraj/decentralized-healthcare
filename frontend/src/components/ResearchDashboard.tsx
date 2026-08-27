import { useState, useEffect } from 'react';

export default function ResearchDashboard() {
  const [flStatus, setFlStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/fl/status');
      const data = await res.json();
      setFlStatus(data);
    } catch (err) {
      console.error("Failed to fetch FL status", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      <div className="bg-white/5 border border-purple-500/30 p-8 rounded-2xl backdrop-blur-xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        
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
                 {flStatus.status.toUpperCase()}
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
