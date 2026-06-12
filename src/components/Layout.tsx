import { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { Menu, X, LogOut, User, Home, ClipboardList, FileCheck, Shuffle, Megaphone } from 'lucide-react';

export default function Layout() {
  const { user, logout, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: '首页', icon: Home },
    { path: '/publicity', label: '公示', icon: Megaphone },
    ...(user?.role === 'merchant' ? [{ path: '/register', label: '报名', icon: ClipboardList }] : []),
    ...(user?.role === 'admin' ? [
      { path: '/review', label: '审核', icon: FileCheck },
      { path: '/lottery', label: '抽签', icon: Shuffle },
    ] : []),
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <nav className="bg-pine text-white shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 font-serif text-xl font-bold tracking-wide">
              <Shuffle className="w-6 h-6 text-amber" />
              <span>摊位抽签系统</span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-pine-light text-amber'
                      : 'text-white/80 hover:bg-pine-light hover:text-white'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              {user && (
                <div className="flex items-center gap-2 text-sm text-white/80">
                  <User className="w-4 h-4" />
                  <span>{user.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber/20 text-amber">
                    {user.role === 'admin' ? '管理员' : '商户'}
                  </span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                退出
              </button>
            </div>

            <button
              className="md:hidden p-2 rounded-lg hover:bg-pine-light"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-white/10 pb-4">
            <div className="container mx-auto px-4 pt-2 flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-pine-light text-amber'
                      : 'text-white/80 hover:bg-pine-light'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
              <div className="border-t border-white/10 mt-2 pt-2 flex items-center justify-between px-4">
                <div className="flex items-center gap-2 text-sm text-white/80">
                  <User className="w-4 h-4" />
                  <span>{user?.name}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/20"
                >
                  <LogOut className="w-4 h-4" />
                  退出
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-pine text-white/60 text-center py-4 text-sm mt-auto">
        <div className="container mx-auto">
          © {new Date().getFullYear()} 农贸市场摊位抽签系统
        </div>
      </footer>
    </div>
  );
}
