import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Batch, LotteryResult } from '@/lib/api';
import { Lock, ChevronDown, ChevronUp, Megaphone, Printer } from 'lucide-react';

export default function Publicity() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [resultsMap, setResultsMap] = useState<Record<number, LotteryResult[]>>({});
  const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [batchData, publishedResults] = await Promise.all([
        api.get<Batch[]>('/batches'),
        api.get<LotteryResult[]>('/lottery/results'),
      ]);
      setBatches(batchData);

      const map: Record<number, LotteryResult[]> = {};
      for (const r of publishedResults) {
        if (!map[r.batch_id]) map[r.batch_id] = [];
        map[r.batch_id].push(r);
      }

      setResultsMap(map);
      const initialExpanded = new Set(
        batchData.filter((b) => b.status === 'published').map((b) => b.id)
      );
      setExpandedBatches(initialExpanded);
    } catch {}
    finally { setLoading(false); }
  };

  const toggleBatch = (id: number) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const displayBatches = batches.filter(
    (b) => b.status === 'published'
  );

  const getStatusBadge = (status: string) => {
    if (status === 'published') {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-pine/10 text-pine">
          <Lock className="w-3 h-3" /> 已公示
        </span>
      );
    }
    return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">待公示</span>;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-bold text-pine flex items-center gap-2">
          <Megaphone className="w-6 h-6" />
          抽签公示
        </h1>
        <button onClick={handlePrint}
          className="no-print flex items-center gap-2 px-4 py-2 border border-sand rounded-lg text-sm text-gray-600 hover:bg-sand/50 transition-colors">
          <Printer className="w-4 h-4" /> 打印
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-sand/50 animate-pulse">
              <div className="h-6 bg-sand rounded w-1/3 mb-4" />
              <div className="grid grid-cols-3 gap-3">
                {[1,2,3].map(j => <div key={j} className="h-16 bg-sand rounded" />)}
              </div>
            </div>
          ))}
        </div>
      ) : displayBatches.length === 0 ? (
        <div className="bg-white rounded-xl p-12 border border-sand/50 text-center text-gray-400">
          暂无公示结果
        </div>
      ) : (
        <div className="space-y-4">
          {displayBatches.map((batch) => {
            const isExpanded = expandedBatches.has(batch.id);
            const batchResults = resultsMap[batch.id] || [];

            return (
              <div key={batch.id} className="bg-white rounded-xl border border-sand/50 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleBatch(batch.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-sand/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <h2 className="font-serif text-lg font-bold text-pine">{batch.name}</h2>
                    {getStatusBadge(batch.status)}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">摊位 {batch.stall_count} 个</span>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-sand/50 pt-4">
                    {batchResults.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">暂无抽签结果</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {batchResults.map((r) => (
                          <div
                            key={r.id}
                            className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${
                              batch.status === 'published'
                                ? 'bg-amber/5 border-amber/30'
                                : 'bg-sand/30 border-sand'
                            }`}
                          >
                            <div className={`w-14 h-14 rounded-lg flex items-center justify-center font-bold text-lg ${
                              batch.status === 'published'
                                ? 'bg-pine text-amber'
                                : 'bg-pine/80 text-white'
                            }`}>
                              {r.stall_number}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">{r.merchant_name}</p>
                              <p className="text-xs text-gray-500">{r.category}</p>
                            </div>
                            {batch.status === 'published' && (
                              <Lock className="w-4 h-4 text-pine/40 flex-shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
