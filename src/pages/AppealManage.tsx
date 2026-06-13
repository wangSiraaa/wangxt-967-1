import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Appeal, AppealReview } from '@/lib/api';
import { MessageSquare, CheckCircle, XCircle, AlertTriangle, Clock, FileText, ChevronDown, ChevronUp } from 'lucide-react';

export default function AppealManage() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedAppeal, setExpandedAppeal] = useState<number | null>(null);
  const [reviewModal, setReviewModal] = useState<{
    appeal: Appeal;
    review_result: 'correction' | 'void_batch' | 'rejected';
    correction_note: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [reviewsMap, setReviewsMap] = useState<Record<number, AppealReview[]>>({});

  useEffect(() => {
    loadAppeals();
  }, []);

  const loadAppeals = async () => {
    try {
      const data = await api.get<Appeal[]>('/appeals');
      setAppeals(data);
    } catch {}
    finally { setLoading(false); }
  };

  const loadReviews = async (appealId: number) => {
    if (reviewsMap[appealId]) {
      setExpandedAppeal(expandedAppeal === appealId ? null : appealId);
      return;
    }
    try {
      const data = await api.get<AppealReview[]>(`/appeals/${appealId}/reviews`);
      setReviewsMap((prev) => ({ ...prev, [appealId]: data }));
      setExpandedAppeal(appealId);
    } catch (err: any) {
      console.error('Failed to load reviews:', err);
    }
  };

  const openReview = (appeal: Appeal) => {
    setReviewModal({
      appeal,
      review_result: 'correction',
      correction_note: '',
    });
  };

  const submitReview = async () => {
    if (!reviewModal) return;
    setSubmitting(true);
    try {
      await api.put(`/appeals/${reviewModal.appeal.id}/review`, {
        review_result: reviewModal.review_result,
        correction_note: reviewModal.review_result !== 'rejected' ? reviewModal.correction_note : null,
      });
      setMessage({ type: 'success', text: '复核处理成功' });
      setReviewModal(null);
      loadAppeals();
      if (reviewsMap[reviewModal.appeal.id]) {
        delete reviewsMap[reviewModal.appeal.id];
      }
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '操作失败' });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAppeals = appeals.filter((a) => {
    if (statusFilter === 'all') return true;
    return a.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    if (status === 'pending') {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
          <Clock className="w-3 h-3" /> 待复核
        </span>
      );
    }
    if (status === 'reviewed') {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
          <CheckCircle className="w-3 h-3" /> 已复核
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
          <XCircle className="w-3 h-3" /> 已驳回
        </span>
      );
    }
    return null;
  };

  const getReviewResultLabel = (result: string) => {
    if (result === 'correction') return '更正说明';
    if (result === 'void_batch') return '作废重抽';
    if (result === 'rejected') return '驳回申诉';
    return result;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-bold text-pine flex items-center gap-2">
          <MessageSquare className="w-6 h-6" />
          申诉管理
        </h1>
        <div className="flex items-center gap-2">
          {['all', 'pending', 'reviewed', 'rejected'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                statusFilter === s
                  ? 'bg-pine text-white'
                  : 'bg-white border border-sand text-gray-600 hover:bg-sand/30'
              }`}
            >
              {s === 'all' ? '全部' : s === 'pending' ? '待复核' : s === 'reviewed' ? '已复核' : '已驳回'}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-sand/50 animate-pulse">
              <div className="h-5 bg-sand rounded w-1/4 mb-3" />
              <div className="h-4 bg-sand rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredAppeals.length === 0 ? (
        <div className="bg-white rounded-xl p-12 border border-sand/50 text-center text-gray-400">
          暂无申诉记录
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAppeals.map((appeal) => {
            const isExpanded = expandedAppeal === appeal.id;
            const reviews = reviewsMap[appeal.id] || [];

            return (
              <div key={appeal.id} className="bg-white rounded-xl border border-sand/50 shadow-sm overflow-hidden">
                <button
                  onClick={() => loadReviews(appeal.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-sand/20 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-medium text-gray-900 truncate">{appeal.merchant_name}</h3>
                      {getStatusBadge(appeal.status)}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{appeal.content}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-xs text-gray-400">{formatDate(appeal.created_at)}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-sand/50 pt-4">
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                      <div>
                        <span className="text-gray-500">联系电话：</span>
                        <span className="text-gray-900">{appeal.phone || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">批次ID：</span>
                        <span className="text-gray-900">{appeal.batch_id}</span>
                      </div>
                    </div>

                    <div className="mb-4 p-3 bg-sand/30 rounded-lg">
                      <div className="text-sm font-medium text-gray-700 mb-2">申诉内容</div>
                      <p className="text-sm text-gray-600">{appeal.content}</p>
                    </div>

                    {reviews.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          复核记录
                        </h4>
                        <div className="space-y-2">
                          {reviews.map((review) => (
                            <div key={review.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  review.review_result === 'correction' ? 'bg-blue-100 text-blue-700' :
                                  review.review_result === 'void_batch' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-200 text-gray-600'
                                }`}>
                                  {getReviewResultLabel(review.review_result)}
                                </span>
                                <span className="text-xs text-gray-400">{formatDate(review.created_at)}</span>
                              </div>
                              {review.correction_note && (
                                <p className="text-sm text-gray-600">{review.correction_note}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {appeal.status === 'pending' && (
                      <button
                        onClick={() => openReview(appeal)}
                        className="w-full flex items-center justify-center gap-2 bg-pine hover:bg-pine-light text-white py-2.5 rounded-lg font-medium transition-colors"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        处理申诉
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {reviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setReviewModal(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg font-bold text-pine mb-4">申诉复核处理</h3>

            <div className="mb-4 p-3 bg-sand/30 rounded-lg">
              <div className="text-sm font-medium text-gray-700 mb-1">申诉商户</div>
              <p className="text-sm text-gray-900">{reviewModal.appeal.merchant_name}</p>
              <div className="text-sm font-medium text-gray-700 mt-2 mb-1">申诉内容</div>
              <p className="text-sm text-gray-600">{reviewModal.appeal.content}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  复核结果
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'correction', label: '更正说明', desc: '添加更正说明，不修改原结果' },
                    { value: 'void_batch', label: '作废重抽', desc: '作废该批次，重新抽签' },
                    { value: 'rejected', label: '驳回申诉', desc: '申诉不成立，维持原结果' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        reviewModal.review_result === opt.value
                          ? 'border-pine bg-pine/5'
                          : 'border-sand hover:bg-sand/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="review_result"
                        value={opt.value}
                        checked={reviewModal.review_result === opt.value}
                        onChange={(e) => setReviewModal({
                          ...reviewModal,
                          review_result: e.target.value as any,
                        })}
                        className="mt-0.5 text-pine border-sand focus:ring-pine"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                        <div className="text-xs text-gray-500">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {reviewModal.review_result !== 'rejected' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {reviewModal.review_result === 'correction' ? '更正说明内容' : '作废原因'}
                    <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={reviewModal.correction_note}
                    onChange={(e) => setReviewModal({ ...reviewModal, correction_note: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white resize-none"
                    placeholder={reviewModal.review_result === 'correction'
                      ? '请输入更正说明内容...'
                      : '请输入作废重抽的原因...'
                    }
                  />
                </div>
              )}

              {reviewModal.review_result === 'rejected' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    驳回理由 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={reviewModal.correction_note}
                    onChange={(e) => setReviewModal({ ...reviewModal, correction_note: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none bg-white resize-none"
                    placeholder="请输入驳回理由..."
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setReviewModal(null)}
                className="flex-1 py-2.5 rounded-lg border border-sand text-gray-600 hover:bg-sand/50 transition-colors">
                取消
              </button>
              <button
                onClick={submitReview}
                disabled={
                  !reviewModal.correction_note.trim() ||
                  submitting
                }
                className={`flex-1 py-2.5 rounded-lg text-white font-medium transition-colors disabled:opacity-50 ${
                  reviewModal.review_result === 'void_batch'
                    ? 'bg-red-500 hover:bg-red-600'
                    : reviewModal.review_result === 'rejected'
                    ? 'bg-gray-500 hover:bg-gray-600'
                    : 'bg-pine hover:bg-pine-light'
                }`}>
                {submitting ? '处理中...' : '确认处理'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
