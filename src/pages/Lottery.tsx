import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Batch, LotteryResult, Registration } from '@/lib/api';
import { Plus, Shuffle, Lock, CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react';

export default function Lottery() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [results, setResults] = useState<LotteryResult[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    stall_count: '',
    stall_numbers: '',
  });
  const [creating, setCreating] = useState(false);

  const [animating, setAnimating] = useState(false);
  const [animResults, setAnimResults] = useState<{ stall: string; merchant: string; revealed: boolean }[]>([]);
  const [currentRevealIndex, setCurrentRevealIndex] = useState(-1);

  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const loadBatches = useCallback(async () => {
    try {
      const data = await api.get<Batch[]>('/batches');
      setBatches(data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const selectBatch = async (batch: Batch) => {
    setSelectedBatch(batch);
    setResults([]);
    setRegistrations([]);
    try {
      const [bDetail, rData] = await Promise.all([
        api.get<Batch & { registration_count: number }>(`/batches/${batch.id}`),
        api.get<Registration[]>(`/registrations?batch_id=${batch.id}`),
      ]);
      setSelectedBatch(bDetail);
      setRegistrations(rData);
      if (batch.status === 'lottery_done' || batch.status === 'published' || batch.status === 'voided') {
        const raw = await api.get<{ batch: Batch; results: LotteryResult[]; appeals: unknown[] }>(`/lottery/results/${batch.id}`);
        setResults(raw.results || []);
      }
    } catch {}
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const stallNumbers = createForm.stall_numbers
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await api.post<Batch>('/batches', {
        ...createForm,
        stall_count: Number(createForm.stall_count),
        stall_numbers: JSON.stringify(stallNumbers),
      });
      setMessage({ type: 'success', text: '批次创建成功' });
      setShowCreateForm(false);
      setCreateForm({ name: '', start_date: '', end_date: '', stall_count: '', stall_numbers: '' });
      loadBatches();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '创建失败' });
    } finally { setCreating(false); }
  };

  const handleCloseBatch = async () => {
    if (!selectedBatch) return;
    try {
      await api.put(`/batches/${selectedBatch.id}`, { status: 'closed' });
      setMessage({ type: 'success', text: '批次已关闭' });
      loadBatches();
      selectBatch({ ...selectedBatch, status: 'closed' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '操作失败' });
    }
  };

  const handleExecuteLottery = async () => {
    if (!selectedBatch) return;
    setAnimating(true);
    setMessage(null);
    try {
      const data = await api.get<Registration[]>(`/registrations?batch_id=${selectedBatch.id}&status=approved`);
      let stallNumbers: string[] = [];
      try { stallNumbers = JSON.parse(selectedBatch.stall_numbers); } catch { stallNumbers = []; }

      const items = data.map((r, i) => ({
        stall: stallNumbers[i] || `#${i + 1}`,
        merchant: r.merchant_name,
        revealed: false,
      }));
      setAnimResults(items);
      setCurrentRevealIndex(-1);

      for (let i = 0; i < items.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        setCurrentRevealIndex(i);
        setAnimResults((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, revealed: true } : item))
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
      const lotteryData = await api.post<{ seed: string; results: LotteryResult[]; stats: Record<string, unknown> }>(`/lottery/execute/${selectedBatch.id}`);
      setResults(lotteryData.results || []);
      setAnimating(false);
      loadBatches();
    } catch (err: any) {
      setAnimating(false);
      setMessage({ type: 'error', text: err.message || '抽签失败' });
    }
  };

  const handlePublish = async () => {
    if (!selectedBatch) return;
    setPublishing(true);
    try {
      await api.post(`/lottery/publish/${selectedBatch.id}`);
      setMessage({ type: 'success', text: '抽签结果已发布公示' });
      setShowPublishConfirm(false);
      loadBatches();
      selectBatch({ ...selectedBatch, status: 'published' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '发布失败' });
    } finally { setPublishing(false); }
  };

  const approvedCount = registrations.filter((r) => r.status === 'approved').length;
  const pendingCount = registrations.filter((r) => r.status === 'pending').length;

  const getStatusInfo = (status: string) => {
    const map: Record<string, { label: string; color: string; dot: string }> = {
      open: { label: '报名中', color: 'text-green-600', dot: 'bg-green-500' },
      closed: { label: '已截止', color: 'text-yellow-600', dot: 'bg-yellow-500' },
      lottery_done: { label: '已抽签', color: 'text-blue-600', dot: 'bg-blue-500' },
      published: { label: '已公示', color: 'text-pine', dot: 'bg-pine' },
      voided: { label: '已作废', color: 'text-red-600', dot: 'bg-red-500' },
    };
    return map[status] || { label: status, color: 'text-gray-600', dot: 'bg-gray-500' };
  };

  const getPriorityLabel = (p?: string) => {
    const m: Record<string, string> = { disabled: '残障优先', veteran: '退役军人优先', old_merchant: '老商户优先' };
    return m[p || ''] || '';
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-bold text-pine">抽签管理</h1>
        <button onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 bg-pine hover:bg-pine-light text-white px-4 py-2 rounded-lg font-medium transition-colors">
          <Plus className="w-4 h-4" /> 创建批次
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg mb-6 text-sm ${
          message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-sand/50 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-sand/50 bg-sand/30">
              <h2 className="font-medium text-gray-900">批次列表</h2>
            </div>
            {loading ? (
              <div className="p-4 space-y-2 animate-pulse">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-sand rounded" />)}
              </div>
            ) : batches.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">暂无批次</div>
            ) : (
              <div className="divide-y divide-sand/50">
                {batches.map((batch) => {
                  const info = getStatusInfo(batch.status);
                  return (
                    <button
                      key={batch.id}
                      onClick={() => selectBatch(batch)}
                      className={`w-full text-left px-4 py-3 hover:bg-sand/20 transition-colors ${
                        selectedBatch?.id === batch.id ? 'bg-pine/5 border-l-4 border-l-pine' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${info.dot}`} />
                        <span className="text-sm font-medium text-gray-900 truncate">{batch.name}</span>
                      </div>
                      <span className={`text-xs ${info.color} ml-4`}>{info.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          {selectedBatch ? (
            <div className="space-y-4">
              <div className="bg-white rounded-xl p-5 border border-sand/50 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-serif text-xl font-bold text-pine">{selectedBatch.name}</h2>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>报名时间：{selectedBatch.start_date} ~ {selectedBatch.end_date}</span>
                      <span>摊位数量：<span className="text-pine font-medium">{selectedBatch.stall_count}</span></span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="text-gray-500">已通过报名：<span className="text-green-600 font-medium">{approvedCount}</span></span>
                      <span className="text-gray-500">待审核：<span className="text-yellow-600 font-medium">{pendingCount}</span></span>
                    </div>
                    {selectedBatch.random_seed && (
                      <div className="mt-2 text-xs text-gray-400 font-mono">随机种子：{selectedBatch.random_seed}</div>
                    )}
                    {selectedBatch.published_at && (
                      <div className="mt-1 text-xs text-gray-400">公示时间：{selectedBatch.published_at}</div>
                    )}
                    {selectedBatch.correction_note && (
                      <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                        <span className="font-medium">更正/作废说明：</span>{selectedBatch.correction_note}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedBatch.status === 'open' && (
                      <button onClick={handleCloseBatch}
                        className="px-4 py-2 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium transition-colors">
                        关闭报名
                      </button>
                    )}
                    {selectedBatch.status === 'closed' && (
                      <button onClick={handleExecuteLottery}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-pine hover:bg-pine-light text-white rounded-lg font-medium transition-colors">
                        <Shuffle className="w-4 h-4" /> 执行抽签
                      </button>
                    )}
                    {selectedBatch.status === 'lottery_done' && (
                      <button onClick={() => setShowPublishConfirm(true)}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-amber hover:bg-amber/90 text-pine rounded-lg font-medium transition-colors">
                        <Lock className="w-4 h-4" /> 发布公示
                      </button>
                    )}
                    {selectedBatch.status === 'published' && (
                      <span className="flex items-center gap-2 px-4 py-2 text-sm bg-pine/10 text-pine rounded-lg font-medium">
                        <Lock className="w-4 h-4" /> 已公示
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {results.length > 0 && (
                <div className="bg-white rounded-xl p-5 border border-sand/50 shadow-sm">
                  <h3 className="font-medium text-gray-900 mb-4">抽签结果 <span className="text-xs text-gray-400 ml-2">共 {results.length} 条</span></h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {results.map((r) => {
                      const isVoid = r.is_void === 1;
                      const priorityLabel = getPriorityLabel(r.priority_type);
                      const needsAdjacent = r.need_adjacent === 1;
                      const adjApproved = r.adjacent_approved === 1;
                      return (
                        <div key={r.id} className={`flex gap-3 p-3 rounded-lg border ${
                          isVoid ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-sand/30 border-sand'
                        }`}>
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg shrink-0 ${
                            isVoid ? 'bg-gray-400 text-gray-100' : 'bg-pine text-amber'
                          }`}>
                            {r.stall_number}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-gray-900 text-sm truncate">{r.merchant_name}</p>
                              {isVoid && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded">已作废</span>}
                              {priorityLabel && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">{priorityLabel}</span>}
                              {needsAdjacent && (adjApproved
                                ? <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">连摊✅</span>
                                : <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">连摊未满足</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{r.category} · {r.phone}</p>
                            {r.draw_reason && (
                              <p className="text-[11px] text-gray-400 mt-1 leading-snug line-clamp-2">📌 {r.draw_reason}</p>
                            )}
                            {isVoid && r.void_reason && (
                              <p className="text-[11px] text-red-500 mt-1 leading-snug">⚠️ {r.void_reason}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 border border-sand/50 text-center text-gray-400">
              请从左侧选择一个批次
            </div>
          )}
        </div>
      </div>

      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateForm(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg font-bold text-pine">创建批次</h3>
              <button onClick={() => setShowCreateForm(false)} className="p-1 hover:bg-sand rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleCreateBatch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">批次名称</label>
                <input type="text" value={createForm.name} onChange={(e) => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white"
                  placeholder="如：2024年第一季度" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">报名开始日期</label>
                  <input type="date" value={createForm.start_date} onChange={(e) => setCreateForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">报名截止日期</label>
                  <input type="date" value={createForm.end_date} onChange={(e) => setCreateForm(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">摊位数量</label>
                <input type="number" value={createForm.stall_count} onChange={(e) => setCreateForm(p => ({ ...p, stall_count: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white"
                  placeholder="请输入摊位数量" min="1" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">摊位编号（逗号分隔）</label>
                <input type="text" value={createForm.stall_numbers} onChange={(e) => setCreateForm(p => ({ ...p, stall_numbers: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white"
                  placeholder="如：A1,A2,A3,B1,B2" required />
              </div>
              <button type="submit" disabled={creating}
                className="w-full bg-pine hover:bg-pine-light text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
                {creating ? '创建中...' : '创建批次'}
              </button>
            </form>
          </div>
        </div>
      )}

      {animating && (
        <div className="fixed inset-0 bg-pine/95 flex flex-col items-center justify-center z-50">
          <h2 className="font-serif text-3xl font-bold text-amber mb-8 animate-fade-in-up">摊位抽签中...</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-4xl mx-auto px-4">
            {animResults.map((item, idx) => (
              <div
                key={idx}
                className={`rounded-xl p-4 text-center transition-all duration-500 ${
                  item.revealed
                    ? 'bg-amber text-pine animate-slot-reveal shadow-lg shadow-amber/30'
                    : currentRevealIndex === idx
                    ? 'bg-white/20 text-white'
                    : 'bg-white/10 text-white/60'
                }`}
              >
                <div className={`text-2xl font-bold mb-1 ${item.revealed ? '' : 'animate-slot-spin'}`}>
                  {item.revealed ? item.stall : '?'}
                </div>
                <div className={`text-sm ${item.revealed ? 'font-medium' : ''}`}>
                  {item.revealed ? item.merchant : '等待揭晓...'}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setAnimating(false)}
            className="mt-8 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
          >
            关闭动画
          </button>
        </div>
      )}

      {showPublishConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowPublishConfirm(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg font-bold text-pine mb-2">确认发布公示</h3>
            <p className="text-sm text-gray-500 mb-6">发布后抽签结果将公开且不可修改，请确认无误。</p>
            <div className="flex gap-3">
              <button onClick={() => setShowPublishConfirm(false)}
                className="flex-1 py-2.5 rounded-lg border border-sand text-gray-600 hover:bg-sand/50 transition-colors">
                取消
              </button>
              <button onClick={handlePublish} disabled={publishing}
                className="flex-1 py-2.5 rounded-lg bg-pine hover:bg-pine-light text-white font-medium transition-colors disabled:opacity-50">
                {publishing ? '发布中...' : '确认发布'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
