import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Simple UI to start FL training and show status
const FederatedLearningUI: React.FC = () => {
  const [status, setStatus] = useState<string>('idle');
  const [rounds, setRounds] = useState<any[]>([]);
  const router = useRouter();

  const startTraining = async () => {
    setStatus('starting');
    const res = await fetch('/api/fl/start', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setStatus('training');
    } else {
      setStatus('error');
    }
  };

  const pollStatus = async () => {
    const res = await fetch('/api/fl/status');
    const data = await res.json();
    setStatus(data.status || 'idle');
    setRounds(data.rounds || []);
  };

  useEffect(() => {
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 border rounded bg-gray-50 mt-6">
      <h3 className="text-lg font-semibold mb-2">Federated Learning</h3>
      <p>Status: <span className="font-mono">{status}</span></p>
      {status === 'idle' && (
        <button
          onClick={startTraining}
          className="mt-2 px-4 py-2 bg-green-600 text-white rounded"
        >
          Start Training
        </button>
      )}
      {rounds.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold">Rounds</h4>
          <ul className="list-disc ml-5">
            {rounds.map((r, i) => (
              <li key={i}>Round {r.round}: accuracy {r.accuracy?.toFixed(3)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FederatedLearningUI;
