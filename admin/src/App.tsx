import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import api from './api/axios';

// Pages
import LoginPage from './pages/LoginPage';
import ProductsPage from './pages/ProductsPage';
import ProductEditPage from './pages/ProductEditPage';
import DesignsPage from './pages/DesignsPage';
import DesignEditPage from './pages/DesignEditPage';
import TownsPage from './pages/TownsPage';
import UsersPage from './pages/UsersPage';

interface AuthSessionResponse {
  authenticated?: boolean;
  id: number | null;
  username: string | null;
  role: 'admin' | 'customer' | null;
}

const App: React.FC = () => {
  const [adminUser, setAdminUser] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('admin-theme') === 'dark';
  });

  const navigate = useNavigate();
  const location = useLocation();

  // Sync dark mode state with the root <html> element and localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('admin-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('admin-theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  useEffect(() => {
    const controller = new AbortController();

    const verifySession = async () => {
      try {
        const response = await api.get<AuthSessionResponse>('/auth/me', {
          signal: controller.signal,
        });
        if (response.data.username && response.data.role === 'admin') {
          setAdminUser(response.data.username);
        } else if (response.data.username) {
          // If a customer session cookie is present, revoke it immediately
          await api.post('/auth/logout').catch(() => {});
          setAdminUser(null);
        } else {
          setAdminUser(null);
        }
        setIsInitializing(false);
      } catch (error: unknown) {
        // Ignore abort errors caused by React StrictMode double-mounting in development
        if (axios.isCancel(error)) {
          return;
        }
        setAdminUser(null);
        setIsInitializing(false);
      }
    };

    verifySession();

    return () => {
      controller.abort();
    };
  }, []);

  // Wait for session verification before evaluating route guards
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex items-center justify-center font-sans transition-colors">
        <div className="text-slate-600 dark:text-neutral-400 font-medium animate-pulse">
          Verifying session...
        </div>
      </div>
    );
  }

  // If not logged in, force them to the login page (unless they are already there)
  if (!adminUser && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  // If already logged in and visiting the login page, redirect to the dashboard
  if (adminUser && location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  // If they are on the login page, just render the login page without the sidebar
  if (location.pathname === '/login') {
    return (
      <LoginPage
        setAdminUser={setAdminUser}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
      />
    );
  }

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error: unknown) {
      console.error("Logout failed", error);
    } finally {
      setAdminUser(null);
      navigate('/login', { replace: true });
    }
  };

  const navItemClass = (path: string): string => {
    const isActive =
      path === '/'
        ? location.pathname === '/'
        : location.pathname === path || location.pathname.startsWith(`${path}/`);

    return `block px-4 py-3 rounded-lg font-medium transition-colors ${
      isActive
        ? 'bg-blue-50 text-blue-700 dark:bg-neutral-800 dark:text-neutral-100'
        : 'text-slate-600 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200'
    }`;
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-neutral-950 font-sans transition-colors">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-neutral-900 border-r border-slate-200 dark:border-neutral-800 flex flex-col transition-colors">
        <div className="p-6 border-b border-slate-200 dark:border-neutral-800">
          <h1 className="text-xl font-bold text-slate-800 dark:text-neutral-100">Provi Admin</h1>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
            Logged in as {adminUser}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link to="/" className={navItemClass('/')}>Dashboard</Link>
          <Link to="/designs" className={navItemClass('/designs')}>Designs</Link>
          <Link to="/products" className={navItemClass('/products')}>Products</Link>
          <Link to="/towns" className={navItemClass('/towns')}>Towns</Link>
          <Link to="/users" className={navItemClass('/users')}>Users</Link>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-neutral-800 space-y-2">
          <button
            type="button"
            onClick={toggleDarkMode}
            className="w-full flex items-center justify-between px-4 py-2 text-slate-600 dark:text-neutral-300 font-medium hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
            {isDarkMode ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-neutral-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <Routes>
          <Route
            path="/"
            element={
              <div>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-neutral-100 mb-2">
                  Dashboard
                </h1>
                <p className="text-slate-600 dark:text-neutral-400">
                  Select an entity from the sidebar to manage.
                </p>
              </div>
            }
          />

          <Route path="/designs" element={<DesignsPage />} />
          <Route path="/designs/new" element={<DesignEditPage />} />
          <Route path="/designs/edit/:id" element={<DesignEditPage />} />

          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/new" element={<ProductEditPage />} />
          <Route path="/products/edit/:id" element={<ProductEditPage />} />

          <Route path="/towns" element={<TownsPage />} />
          <Route path="/users" element={<UsersPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
