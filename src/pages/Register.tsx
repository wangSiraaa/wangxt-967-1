import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { Batch, Registration } from '@/lib/api';
import { Upload, X, AlertCircle, CheckCircle, Clock, Ban, FileText } from 'lucide-react';

export default function Register() {
  const { user } = useAuthStore();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [myRegistrations, setMyRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const foodFileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    batch_id: '',
    merchant_name: '',
    contact_person: '',
    phone: '',
    category: '',
    license_no: '',
    license_expiry: '',
    license_image: '',
    food_license_no: '',
    food_license_expiry: '',
    food_license_image: '',
    priority_type: 'none' as 'none' | 'disabled' | 'veteran' | 'old_merchant',
    priority_materials: '',
    need_adjacent: false,
    adjacent_count: 2,
  });

  const [licensePreview, setLicensePreview] = useState('');
  const [foodLicensePreview, setFoodLicensePreview] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [b, r] = await Promise.all([
        api.get<Batch[]>('/batches'),
        api.get<Registration[]>('/registrations'),
      ]);
      setBatches(b);
      setMyRegistrations(r.filter((reg) => reg.user_id === user?.id));
    } catch {}
    finally {
      setLoading(false);
    }
  };

  const openBatches = batches.filter((b) => b.status === 'open');

  useEffect(() => {
    if (form.batch_id) {
      checkDuplicate();
    } else {
      setIsDuplicate(false);
    }
  }, [form.batch_id]);

  const checkDuplicate = async () => {
    try {
      const result = await api.get<{ is_duplicate: boolean }>(`/registrations/check-duplicate?batch_id=${form.batch_id}`);
      setIsDuplicate(result.is_duplicate);
    } catch {}
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (file: File, field: 'license_image' | 'food_license_image') => {
    try {
      const data = await api.upload('/upload/license', file);
      updateField(field, data.path);
      const reader = new FileReader();
      reader.onload = (e) => {
        if (field === 'license_image') {
          setLicensePreview(e.target?.result as string);
        } else {
          setFoodLicensePreview(e.target?.result as string);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '上传失败' });
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const licenseExpired = form.license_expiry && form.license_expiry < today;
  const foodLicenseExpired = form.food_license_expiry && form.food_license_expiry < today;
  const canSubmit = form.batch_id && !isDuplicate && !licenseExpired && !foodLicenseExpired;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await api.post<Registration>('/registrations', form);
      setMessage({ type: 'success', text: '报名提交成功！' });
      setForm({
        batch_id: '', merchant_name: '', contact_person: '', phone: '',
        category: '', license_no: '', license_expiry: '', license_image: '',
        food_license_no: '', food_license_expiry: '', food_license_image: '',
        priority_type: 'none', priority_materials: '',
        need_adjacent: false, adjacent_count: 2,
      });
      setLicensePreview('');
      setFoodLicensePreview('');
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '提交失败' });
    } finally {
      setSubmitting(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'pending') return <Clock className="w-4 h-4 text-yellow-500" />;
    if (status === 'approved') return <CheckCircle className="w-4 h-4 text-green-500" />;
    return <Ban className="w-4 h-4 text-red-500" />;
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已驳回' };
    return map[status] || status;
  };

  return (
    <div className="container mx-auto py-6">
      <h1 className="font-serif text-2xl font-bold text-pine mb-6">商户报名</h1>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg mb-6 text-sm ${
          message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {myRegistrations.length > 0 && (
        <div className="bg-white rounded-xl p-5 border border-sand/50 shadow-sm mb-6">
          <h2 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-pine" />
            我的报名记录
          </h2>
          <div className="space-y-2">
            {myRegistrations.map((reg) => (
              <div key={reg.id} className="flex items-center justify-between py-2 border-b border-sand/50 last:border-0">
                <div className="flex items-center gap-2 text-sm">
                  {statusIcon(reg.status)}
                  <span className="font-medium">{reg.merchant_name}</span>
                  <span className="text-gray-400">—</span>
                  <span className="text-gray-500">{reg.batch_name || `批次#${reg.batch_id}`}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    reg.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    reg.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {statusLabel(reg.status)}
                  </span>
                  {reg.reject_reason && (
                    <span className="text-xs text-red-500">原因：{reg.reject_reason}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-6 border border-sand/50 shadow-sm">
        <h2 className="font-medium text-gray-900 mb-5">提交报名</h2>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-sand rounded" />)}
          </div>
        ) : openBatches.length === 0 ? (
          <div className="text-center py-8 text-gray-400">当前没有开放报名的批次</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">选择批次 <span className="text-red-500">*</span></label>
              <select
                value={form.batch_id}
                onChange={(e) => updateField('batch_id', e.target.value)}
                className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none transition-colors bg-white"
                required
              >
                <option value="">请选择批次</option>
                {openBatches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}（{b.start_date} ~ {b.end_date}）</option>
                ))}
              </select>
              {isDuplicate && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> 您已报名该批次，不可重复报名
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">商户名称 <span className="text-red-500">*</span></label>
                <input type="text" value={form.merchant_name} onChange={(e) => updateField('merchant_name', e.target.value)}
                  className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none transition-colors bg-white"
                  placeholder="请输入商户名称" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">联系人 <span className="text-red-500">*</span></label>
                <input type="text" value={form.contact_person} onChange={(e) => updateField('contact_person', e.target.value)}
                  className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none transition-colors bg-white"
                  placeholder="请输入联系人姓名" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">手机号 <span className="text-red-500">*</span></label>
                <input type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)}
                  className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none transition-colors bg-white"
                  placeholder="请输入手机号" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">经营品类 <span className="text-red-500">*</span></label>
                <input type="text" value={form.category} onChange={(e) => updateField('category', e.target.value)}
                  className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none transition-colors bg-white"
                  placeholder="如：蔬菜、水果、肉类等" required />
              </div>
            </div>

            <div className="border-t border-sand/50 pt-4 mt-4">
              <h3 className="font-medium text-gray-900 mb-3">营业执照信息</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">营业执照编号 <span className="text-red-500">*</span></label>
                  <input type="text" value={form.license_no} onChange={(e) => updateField('license_no', e.target.value)}
                    className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none transition-colors bg-white"
                    placeholder="请输入营业执照编号" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">到期日期 <span className="text-red-500">*</span></label>
                  <input type="date" value={form.license_expiry} onChange={(e) => updateField('license_expiry', e.target.value)}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-pine/20 outline-none transition-colors bg-white ${
                      licenseExpired ? 'border-red-300 focus:border-red-500' : 'border-sand focus:border-pine'
                    }`}
                    required />
                  {licenseExpired && (
                    <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> 营业执照已过期，无法提交报名
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">营业执照图片 <span className="text-red-500">*</span></label>
                <input type="file" ref={fileInputRef} accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'license_image')} />
                {licensePreview ? (
                  <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-sand">
                    <img src={licensePreview} alt="营业执照" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => { setLicensePreview(''); updateField('license_image', ''); }}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="w-32 h-32 border-2 border-dashed border-sand rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-pine hover:text-pine transition-colors">
                    <Upload className="w-6 h-6 mb-1" />
                    <span className="text-xs">上传图片</span>
                  </button>
                )}
              </div>
            </div>

            <div className="border-t border-sand/50 pt-4 mt-4">
              <h3 className="font-medium text-gray-900 mb-3">食品经营许可证（选填）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">许可证编号</label>
                  <input type="text" value={form.food_license_no} onChange={(e) => updateField('food_license_no', e.target.value)}
                    className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none transition-colors bg-white"
                    placeholder="请输入许可证编号" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">到期日期</label>
                  <input type="date" value={form.food_license_expiry} onChange={(e) => updateField('food_license_expiry', e.target.value)}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-pine/20 outline-none transition-colors bg-white ${
                      foodLicenseExpired ? 'border-red-300 focus:border-red-500' : 'border-sand focus:border-pine'
                    }`} />
                  {foodLicenseExpired && (
                    <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> 食品经营许可证已过期，无法提交报名
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">许可证图片</label>
                <input type="file" ref={foodFileInputRef} accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'food_license_image')} />
                {foodLicensePreview ? (
                  <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-sand">
                    <img src={foodLicensePreview} alt="食品经营许可证" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => { setFoodLicensePreview(''); updateField('food_license_image', ''); }}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => foodFileInputRef.current?.click()}
                    className="w-32 h-32 border-2 border-dashed border-sand rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-pine hover:text-pine transition-colors">
                    <Upload className="w-6 h-6 mb-1" />
                    <span className="text-xs">上传图片</span>
                  </button>
                )}
              </div>
            </div>

            <div className="border-t border-sand/50 pt-4 mt-4">
              <h3 className="font-medium text-gray-900 mb-3">优先资格（选填）</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">资格类型</label>
                  <select
                    value={form.priority_type}
                    onChange={(e) => updateField('priority_type', e.target.value)}
                    className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none transition-colors bg-white"
                  >
                    <option value="none">无优先资格</option>
                    <option value="disabled">残障优先</option>
                    <option value="veteran">退役军人优先</option>
                    <option value="old_merchant">老商户优先</option>
                  </select>
                </div>
                {form.priority_type !== 'none' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      优先资格说明材料 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={form.priority_materials}
                      onChange={(e) => updateField('priority_materials', e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none transition-colors bg-white resize-none"
                      placeholder="请提供相关证明材料的说明，如残疾证编号、退伍证编号、经营年限证明等"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      提交后管理员将复核您的优先资格材料
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-sand/50 pt-4 mt-4">
              <h3 className="font-medium text-gray-900 mb-3">连摊需求（选填）</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.need_adjacent}
                    onChange={(e) => updateField('need_adjacent', e.target.checked as any)}
                    className="w-4 h-4 text-pine border-sand rounded focus:ring-pine"
                  />
                  <span className="text-sm text-gray-700">需要相邻摊位</span>
                </label>
                {form.need_adjacent && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">需要的连摊数量</label>
                    <select
                      value={form.adjacent_count}
                      onChange={(e) => updateField('adjacent_count', parseInt(e.target.value) as any)}
                      className="w-full px-4 py-2.5 border border-sand rounded-lg focus:ring-2 focus:ring-pine/20 focus:border-pine outline-none transition-colors bg-white"
                    >
                      <option value={2}>2个连摊</option>
                      <option value={3}>3个连摊</option>
                      <option value={4}>4个连摊</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      如相邻摊位不足，系统将自动降级为单摊参与抽签
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4">
              <button type="submit" disabled={!canSubmit || submitting}
                className="bg-pine hover:bg-pine-light text-white px-8 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? '提交中...' : '提交报名'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
