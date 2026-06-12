import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import RegisterAccount from '@/pages/RegisterAccount';
import Home from '@/pages/Home';
import Register from '@/pages/Register';
import Review from '@/pages/Review';
import Lottery from '@/pages/Lottery';
import Publicity from '@/pages/Publicity';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, token, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="animate-pulse text-pine font-serif text-xl">加载中...</div>
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register-account" element={<RegisterAccount />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route
            path="/register"
            element={
              <ProtectedRoute>
                <Register />
              </ProtectedRoute>
            }
          />
          <Route
            path="/review"
            element={
              <ProtectedRoute adminOnly>
                <Review />
              </ProtectedRoute>
            }
          />
          <Route
            path="/lottery"
            element={
              <ProtectedRoute adminOnly>
                <Lottery />
              </ProtectedRoute>
            }
          />
          <Route path="/publicity" element={<Publicity />} />
        </Route>
      </Routes>
    </Router>
  );
}
