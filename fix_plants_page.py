content = """'use client';
import { useEffect, useState } from 'react';
import apiClient from '@/lib/api_client';

interface Plant {
  id: number;
  name: string;
  capacity_mw?: number;
  fuel_type?: string;
  technology?: string;
  ownership?: string;
  status?: string;
}

export default function PlantsPage() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/plants/').then(r => {
      setPlants(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-white">Loading...</div>;

  return (
    <div className="p-6 text-white">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Power Plants</h1>
        <span className="ml-2 px-2 py-0.5 bg-cyan-900/50 text-cyan-300 rounded text-sm">{plants.length} plants</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plants.map(p => (
          <div key={p.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 hover:border-cyan-500/50 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <h2 className="font-semibold text-sm leading-tight flex-1">{p.name}</h2>
              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium shrink-0 ${p.status === 'Active' ? 'bg-green-900/50 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                {p.status || 'Active'}
              </span>
            </div>
            <div className="space-y-2 text-sm text-slate-400">
              {p.capacity_mw && <div>Capacity: <span className="text-white">{p.capacity_mw} MW</span></div>}
              {p.fuel_type && <div>Fuel: <span className="text-white">{p.fuel_type}</span></div>}
              {p.technology && <div>Technology: <span className="text-white">{p.technology}</span></div>}
              {p.ownership && <div>Ownership: <span className="text-white">{p.ownership}</span></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
"""
with open(r'E:\AI Projects\gridintel\frontend\src\app\(dashboard)\plants\page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
