import React, { useEffect, useState } from 'react';

interface Dataset {
  id: string;
  title: string;
  description: string;
  price: string;
  preview: string;
}

const MarketplaceUI: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch('/api/marketplace/list');
      const data = await res.json();
      setDatasets(data);
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) return <p>Loading datasets...</p>;

  return (
    <div className="p-4 border rounded bg-gray-50 mt-6">
      <h3 className="text-lg font-semibold mb-2">Data Marketplace</h3>
      <ul className="space-y-4">
        {datasets.map(ds => (
          <li key={ds.id} className="border p-3 rounded">
            <h4 className="font-bold">{ds.title}</h4>
            <p>{ds.description}</p>
            <p className="font-mono">Price: {ds.price}</p>
            <p className="italic text-sm">Preview: {ds.preview}</p>
            <button className="mt-2 px-3 py-1 bg-indigo-600 text-white rounded">Buy</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MarketplaceUI;
