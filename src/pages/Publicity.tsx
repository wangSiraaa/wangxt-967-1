import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Batch, LotteryResult } from '@/lib/api';
import { Lock, ChevronDown, ChevronUp, Megaphone, Printer, AlertCircle, Info, FileText, Clock } from 'lucide-react';

interface ExplanationData {
  won: Array<{
    registration_id: number;
    merchant_name: string;
    stall_number: string;
    reason: string;
    priority_type?: string;
    need_adjacent?: number;
  }>;
  lost: Array<{
    registration_id: number;
    merchant_name: string;
    reason: string;
    priority_type?: string;
    need_adjacent?: number;
  }>;
  total_stalls: number;
  total_applicants: number;
  category_concentration_limit: number;
}

export default function Publicity() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [resultsMap, setResultsMap] = useState<Record<number, LotteryResult[]>>({});
  const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [explanationMap, setExplanationMap] = useState<Record<number, ExplanationData>>({});
  const [showExplanation, setShowExplanation] = useState<number | null>(null);
  const [appealBatchId, setAppealBatchId] = useState<number | null>(null);
  const [appealContent, setAppealContent] = useState('');
  const [appealMerchantName, setAppealMerchantName] = useState('');
  const [appealPhone, setAppealPhone] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const loadExplanation = async (batchId: number) => {
    if (explanationMap[batchId]) {
      setShowExplanation(showExplanation === batchId ? null : batchId);
      return;
    }
    try {
      const data = await api.get<{
        batch_info: {
          total_stalls: number;
          total_applicants: number;
          category_concentration_limit: number;
        };
        selected: Array<{
          registration_id: number;
          merchant_name: string;
          stall_number: string;
          draw_reason?: string;
          priority_type?: string;
          need_adjacent?: number;
        }>;
        not_selected: Array<{
          id: number;
          merchant_name: string;
          reason: string;
          priority_type?: string;
          need_adjacent?: number;
        }>;
      }>(`/lottery/explanation/${batchId}`);

      const transformed: ExplanationData = {
        won: data.selected.map(s => ({
          registration_id: s.registration_id,
          merchant_name: s.merchant_name,
          stall_number: s.stall_number,
          reason: s.draw_reason || '抽签分配',
          priority_type: s.priority_type,
          need_adjacent: s.need_adjacent,
        })),
        lost: data.not_selected.map(n => ({
          registration_id: n.id,
          merchant_name: n.merchant_name,
          reason: n.reason,
          priority_type: n.priority_type,
          need_adjacent: n.need_adjacent,
        })),
        total_stalls: data.batch_info.total_stalls,
        total_applicants: data.batch_info.total_applicants,
        category_concentration_limit: data.batch_info.category_concentration_limit,
      };

      setExplanationMap((prev) => ({ ...prev, [batchId]: transformed }));
      setShowExplanation(batchId);
    } catch (err: any) {
      console.error('Failed to load explanation:', err);
    }
  };

  const openAppeal = (batchId: number) => {
    setAppealBatchId(batchId);
    setAppealContent('');
    setAppealMerchantName('');
    setAppealPhone('');
  };

  const submitAppeal = async () => {
    if (!appealBatchId || !appealContent.trim() || !appealMerchantName.trim() || !appealPhone.trim()) return;
    setSubmittingAppeal(true);
    try {
      await api.post('/appeals', {
        batch_id: appealBatchId,
        merchant_name: appealMerchantName,
        phone: appealPhone,
        content: appealContent,
      });
      setMessage({ type: 'success', text: '申诉提交成功！' });
      setAppealBatchId(null);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '提交失败' });
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const displayBatches = batches.filter(
    (b) => b.status === 'published' || b.status === 'voided'
  );

  const getStatusBadge = (status: string) => {
    if (status === 'published') {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-pine/10 text-pine">
          <Lock className="w-3 h-3" /> 已公示
        </span>
      );
    }
    if (status === 'voided') {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
          <AlertCircle className="w-3 h-3" /> 已作废
        </span>
      );
    }
    return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">待公示</span>;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const getPriorityLabel = (type?: string) => {
    if (type === 'disabled') return '残障优先';
    if (type === 'veteran') return '退役军人优先';
    if (type === 'old_merchant') return '老商户优先';
    return '普通';
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

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

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
                    <div className="flex flex-wrap gap-4 mb-4 text-sm text-gray-600">
                      {batch.published_at && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>公示时间：{formatDate(batch.published_at)}</span>
                        </div>
                      )}
                      {batch.appeal_deadline && (
                        <div className="flex items-center gap-1">
                          <AlertCircle className="w-4 h-4 text-amber-600" />
                          <span>申诉截止：{formatDate(batch.appeal_deadline)}</span>
                        </div>
                      )}
                      {batch.category_concentration_limit !== undefined && (
                        <div className="flex items-center gap-1">
                          <Info className="w-4 h-4" />
                          <span>品类集中度限制：{Math.round(batch.category_concentration_limit * 100)}%</span>
                        </div>
                      )}
                    </div>

                    {batch.correction_note && (
                      <div className="mb-4 p-3 bg-amber/10 border border-amber/30 rounded-lg">
                        <div className="flex items-center gap-2 text-amber-dark font-medium text-sm mb-1">
                          <FileText className="w-4 h-4" /> 更正说明
                        </div>
                        <p className="text-sm text-gray-700">{batch.correction_note}</p>
                      </div>
                    )}

                    <div className="flex gap-3 mb-4 no-print">
                      <button
                        onClick={(e) => { e.stopPropagation(); loadExplanation(batch.id); }}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm border border-sand rounded-lg text-gray-600 hover:bg-sand/30 transition-colors"
                      >
                        <Info className="w-4 h-4" />
                        抽签结果说明
                      </button>
                      {batch.status === 'published' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openAppeal(batch.id); }}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-amber/20 border border-amber/30 rounded-lg text-amber-dark hover:bg-amber/30 transition-colors"
                        >
                          <AlertCircle className="w-4 h-4" />
                          提交申诉
                        </button>
                      )}
                    </div>

                    {showExplanation === batch.id && explanationMap[batch.id] && (
                      <div className="mb-4 p-4 bg-sand/30 rounded-lg">
                        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                          <Info className="w-4 h-4 text-pine" />
                          抽签结果说明
                        </h4>
                        <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                          <div>总摊位：<span className="font-medium">{explanationMap[batch.id].total_stalls}</span></div>
                          <div>报名人数：<span className="font-medium">{explanationMap[batch.id].total_applicants}</span></div>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <h5 className="text-sm font-medium text-green-700 mb-2">中签商户（{explanationMap[batch.id].won.length}）</h5>
                            <div className="max-h-48 overflow-y-auto space-y-1.5">
                              {explanationMap[batch.id].won.map((item) => (
                                <div key={item.registration_id} className="text-xs bg-white rounded p-2 border border-sand/50">
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium">{item.merchant_name}</span>
                                    <span className="text-pine font-bold">{item.stall_number}</span>
                                  </div>
                                  <div className="text-gray-500 mt-1">
                                    {getPriorityLabel(item.priority_type)}
                                    {item.need_adjacent === 1 && ' · 连摊申请'}
                                  </div>
                                  <div className="text-gray-600 mt-1">{item.reason}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h5 className="text-sm font-medium text-red-700 mb-2">未中签商户（{explanationMap[batch.id].lost.length}）</h5>
                            <div className="max-h-48 overflow-y-auto space-y-1.5">
                              {explanationMap[batch.id].lost.map((item) => (
                                <div key={item.registration_id} className="text-xs bg-white rounded p-2 border border-sand/50">
                                  <div className="font-medium">{item.merchant_name}</div>
                                  <div className="text-gray-500 mt-1">
                                    {getPriorityLabel(item.priority_type)}
                                    {item.need_adjacent === 1 && ' · 连摊申请'}
                                  </div>
                                  <div className="text-gray-600 mt-1">{item.reason}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {batchResults.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">暂无抽签结果</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {batchResults.map((r) => {
                          const isVoid = r.is_void === 1;
                          const pLabel = getPriorityLabel(r.priority_type);
                          const needAdj = r.need_adjacent === 1;
                          const adjOk = r.adjacent_approved === 1;
                          return (
                            <div
                              key={r.id}
                              className={`flex gap-3 p-4 rounded-lg border transition-all ${
                                isVoid
                                  ? 'bg-gray-50 border-gray-200 opacity-70'
                                  : batch.status === 'published'
                                  ? 'bg-amber/5 border-amber/30'
                                  : 'bg-sand/30 border-sand'
                              }`}
                            >
                              <div className={`w-14 h-14 rounded-lg flex items-center justify-center font-bold text-lg shrink-0 ${
                                isVoid ? 'bg-gray-400 text-gray-100' : 'bg-pine text-amber'
                              }`}>
                                {r.stall_number}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-medium text-gray-900 truncate">{r.merchant_name}</p>
                                  {isVoid && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded">作废</span>}
                                  {pLabel !== '普通' && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">{pLabel}</span>}
                                  {needAdj && (adjOk
                                    ? <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">连摊</span>
                                    : <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">连摊降级</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">{r.category}</p>
                                {r.draw_reason && (
                                  <p className="text-[11px] text-gray-400 mt-1 leading-snug">📌 {r.draw_reason}</p>
                                )}
                                {isVoid && r.void_reason && (
                                  <p className="text-[11px] text-red-500 mt-1 leading-snug">⚠️ {r.void_reason}</p>
                                )}
                              </div>
                              {batch.status === 'published' && !isVoid && (
                                <Lock className="w-4 h-4 text-pine/40 flex-shrink-0 self-center" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {appealBatchId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAppealBatchId(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg font-bold text-pine mb-4">提交申诉</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  商户名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={appealMerchantName}
                  onChange={(e) => setAppealMerchantName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white"
                  placeholder="请输入商户名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  联系电话 <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={appealPhone}
                  onChange={(e) => setAppealPhone(e.target.value)}
                  className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white"
                  placeholder="请输入联系电话"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  申诉内容 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={appealContent}
                  onChange={(e) => setAppealContent(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white resize-none"
                  placeholder="请详细描述您的申诉理由..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setAppealBatchId(null)}
                className="flex-1 py-2.5 rounded-lg border border-sand text-gray-600 hover:bg-sand/50 transition-colors">
                取消
              </button>
              <button
                onClick={submitAppeal}
                disabled={!appealContent.trim() || !appealMerchantName.trim() || !appealPhone.trim() || submittingAppeal}
                className="flex-1 py-2.5 rounded-lg bg-amber hover:bg-amber-dark text-white font-medium transition-colors disabled:opacity-50">
                {submittingAppeal ? '提交中...' : '提交申诉'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
