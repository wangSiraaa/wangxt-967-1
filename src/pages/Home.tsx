import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { Batch, Registration } from '@/lib/api';
import { Shuffle, ClipboardList, Megaphone, Users, TrendingUp, Calendar } from 'lucide-react';

export default function Home() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get<Batch[]>('/batches'),
      api.get<Registration[]>('/registrations'),
    ])
      .then(([b, r]) => {
        setBatches(b);
        setRegistrations(r);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openBatches = batches.filter((b) => b.status === 'open');
  const completedLotteries = batches.filter((b) => b.status === 'published');
  const totalRegistrations = registrations.length;

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      open: '报名中',
      closed: '已截止',
      lottery_done: '已抽签',
      published: '已公示',
    };
    return map[status] || status;
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      open: 'bg-green-100 text-green-700',
      closed: 'bg-yellow-100 text-yellow-700',
      lottery_done: 'bg-blue-100 text-blue-700',
      published: 'bg-pine/10 text-pine',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="container mx-auto py-6">
      <div className="bg-gradient-to-br from-pine to-pine-light rounded-2xl p-8 md:p-12 text-white mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative">
          <h1 className="font-serif text-3xl md:text-4xl font-bold mb-3">农贸市场摊位抽签系统</h1>
          <p className="text-white/70 text-lg mb-6 max-w-xl">
            公平、公正、公开的摊位分配平台，数字化管理从报名到抽签公示的全流程
          </p>
          <div className="flex flex-wrap gap-3">
            {user?.role === 'merchant' && (
              <Link
                to="/register"
                className="inline-flex items-center gap-2 bg-amber hover:bg-amber/90 text-pine font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                <ClipboardList className="w-4 h-4" />
                商户报名
              </Link>
            )}
            <Link
              to="/publicity"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-2.5 rounded-lg transition-colors border border-white/20"
            >
              <Megaphone className="w-4 h-4" />
              查看公示
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-sand/50 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-gray-500 text-sm">当前开放批次</span>
          </div>
          <p className="text-3xl font-bold text-pine">{openBatches.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-sand/50 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-gray-500 text-sm">总报名数</span>
          </div>
          <p className="text-3xl font-bold text-pine">{totalRegistrations}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-sand/50 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber" />
            </div>
            <span className="text-gray-500 text-sm">已完成抽签</span>
          </div>
          <p className="text-3xl font-bold text-pine">{completedLotteries.length}</p>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="font-serif text-xl font-bold text-pine mb-4 flex items-center gap-2">
          <Shuffle className="w-5 h-5" />
          批次列表
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-5 border border-sand/50 animate-pulse">
                <div className="h-5 bg-sand rounded w-2/3 mb-3" />
                <div className="h-4 bg-sand rounded w-1/2 mb-2" />
                <div className="h-4 bg-sand rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : batches.length === 0 ? (
          <div className="bg-white rounded-xl p-12 border border-sand/50 text-center text-gray-400">
            暂无批次信息
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className="bg-white rounded-xl p-5 border border-sand/50 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-medium text-gray-900">{batch.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(batch.status)}`}>
                    {getStatusLabel(batch.status)}
                  </span>
                </div>
                <div className="space-y-1.5 text-sm text-gray-500">
                  <p>报名时间：{batch.start_date} ~ {batch.end_date}</p>
                  <p>摊位数量：<span className="text-pine font-medium">{batch.stall_count}</span> 个</p>
                </div>
                {batch.status === 'open' && user?.role === 'merchant' && (
                  <Link
                    to="/register"
                    className="mt-4 block text-center bg-pine/5 hover:bg-pine/10 text-pine py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    立即报名
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
