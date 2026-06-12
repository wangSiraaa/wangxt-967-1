import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Batch, Registration } from '@/lib/api';
import { CheckCircle, XCircle, Eye, Clock, AlertCircle, X } from 'lucide-react';

export default function Review() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [detailReg, setDetailReg] = useState<Registration | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    api.get<Batch[]>('/batches').then(setBatches).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      loadRegistrations();
    }
  }, [selectedBatch]);

  const loadRegistrations = async () => {
    try {
      const data = await api.get<Registration[]>(`/registrations?batch_id=${selectedBatch}`);
      setRegistrations(data);
    } catch {}
  };

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    setMessage(null);
    try {
      await api.put(`/registrations/${id}/status`, { status: 'approved' });
      setMessage({ type: 'success', text: '审核通过' });
      loadRegistrations();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '操作失败' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    setActionLoading(rejectId);
    setMessage(null);
    try {
      await api.put(`/registrations/${rejectId}/status`, {
        status: 'rejected',
        reject_reason: rejectReason,
      });
      setMessage({ type: 'success', text: '已驳回' });
      setRejectId(null);
      setRejectReason('');
      loadRegistrations();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '操作失败' });
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = registrations.filter((r) => {
    if (statusFilter === 'all') return true;
    return r.status === statusFilter;
  });

  const filterTabs = [
    { key: 'all', label: '全部', count: registrations.length },
    { key: 'pending', label: '待审核', count: registrations.filter((r) => r.status === 'pending').length },
    { key: 'approved', label: '已通过', count: registrations.filter((r) => r.status === 'approved').length },
    { key: 'rejected', label: '已驳回', count: registrations.filter((r) => r.status === 'rejected').length },
  ];

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '待审核' },
      approved: { bg: 'bg-green-100', text: 'text-green-700', label: '已通过' },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', label: '已驳回' },
    };
    const s = map[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
    return <span className={`text-xs px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  return (
    <div className="container mx-auto py-6">
      <h1 className="font-serif text-2xl font-bold text-pine mb-6">审核管理</h1>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg mb-6 text-sm ${
          message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl p-5 border border-sand/50 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">选择批次</label>
            <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}
              className="w-full md:w-auto px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white">
              <option value="">请选择批次</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {selectedBatch && (
        <>
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  statusFilter === tab.key
                    ? 'bg-pine text-white'
                    : 'bg-white border border-sand text-gray-600 hover:bg-sand/50'
                }`}
              >
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  statusFilter === tab.key ? 'bg-white/20' : 'bg-sand'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-sand/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-sand/30">
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">商户名称</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">联系人</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">手机号</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">品类</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">状态</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-t border-sand/50">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-sand rounded animate-pulse w-20" /></td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-400">暂无报名记录</td>
                    </tr>
                  ) : (
                    filtered.map((reg) => (
                      <tr key={reg.id} className="border-t border-sand/50 hover:bg-sand/20 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{reg.merchant_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{reg.contact_person}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{reg.phone}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{reg.category}</td>
                        <td className="px-4 py-3">{statusBadge(reg.status)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setDetailReg(reg)}
                              className="p-1.5 text-gray-400 hover:text-pine rounded-lg hover:bg-pine/5 transition-colors"
                              title="查看详情">
                              <Eye className="w-4 h-4" />
                            </button>
                            {reg.status === 'pending' && (
                              <>
                                <button onClick={() => handleApprove(reg.id)} disabled={actionLoading === reg.id}
                                  className="p-1.5 text-green-500 hover:text-green-600 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
                                  title="通过">
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button onClick={() => { setRejectId(reg.id); setRejectReason(''); }}
                                  className="p-1.5 text-red-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                  title="驳回">
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {detailReg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailReg(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg font-bold text-pine">报名详情</h3>
              <button onClick={() => setDetailReg(null)} className="p-1 hover:bg-sand rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-500">商户名称：</span><span className="font-medium">{detailReg.merchant_name}</span></div>
                <div><span className="text-gray-500">联系人：</span><span className="font-medium">{detailReg.contact_person}</span></div>
                <div><span className="text-gray-500">手机号：</span><span className="font-medium">{detailReg.phone}</span></div>
                <div><span className="text-gray-500">品类：</span><span className="font-medium">{detailReg.category}</span></div>
                <div><span className="text-gray-500">营业执照编号：</span><span className="font-medium">{detailReg.license_no}</span></div>
                <div><span className="text-gray-500">营业执照到期：</span><span className="font-medium">{detailReg.license_expiry}</span></div>
                {detailReg.food_license_no && (
                  <>
                    <div><span className="text-gray-500">食品许可证编号：</span><span className="font-medium">{detailReg.food_license_no}</span></div>
                    <div><span className="text-gray-500">食品许可证到期：</span><span className="font-medium">{detailReg.food_license_expiry}</span></div>
                  </>
                )}
              </div>
              <div>
                <span className="text-gray-500 block mb-1">营业执照图片：</span>
                {detailReg.license_image ? (
                  <img src={detailReg.license_image} alt="营业执照" className="max-w-xs rounded-lg border border-sand" />
                ) : <span className="text-gray-400">未上传</span>}
              </div>
              {detailReg.food_license_image && (
                <div>
                  <span className="text-gray-500 block mb-1">食品许可证图片：</span>
                  <img src={detailReg.food_license_image} alt="食品许可证" className="max-w-xs rounded-lg border border-sand" />
                </div>
              )}
              {detailReg.reject_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <span className="text-red-700">驳回原因：{detailReg.reject_reason}</span>
                </div>
              )}
            </div>
            {detailReg.status === 'pending' && (
              <div className="flex gap-3 mt-6 pt-4 border-t border-sand">
                <button onClick={() => { handleApprove(detailReg.id); setDetailReg(null); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-lg font-medium transition-colors">
                  <CheckCircle className="w-4 h-4" /> 通过
                </button>
                <button onClick={() => { setRejectId(detailReg.id); setRejectReason(''); setDetailReg(null); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-lg font-medium transition-colors">
                  <XCircle className="w-4 h-4" /> 驳回
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {rejectId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRejectId(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg font-bold text-pine mb-4">驳回原因</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white resize-none"
              placeholder="请输入驳回原因..."
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setRejectId(null)}
                className="flex-1 py-2.5 rounded-lg border border-sand text-gray-600 hover:bg-sand/50 transition-colors">
                取消
              </button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || actionLoading === rejectId}
                className="flex-1 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-50">
                确认驳回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
