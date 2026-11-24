import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import api from './api/axios';

// Pages & Storefront Cart
import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import OrderSuccessPage from './pages/OrderSuccessPage';
import { CartProvider, useCart } from './context/CartContext';
import CartDrawer from './components/CartDrawer';

interface AuthSessionResponse {
  authenticated?: boolean;
  id: number | null;
  username: string | null;
  role: 'admin' | 'customer' | null;
}

const AppShell: React.FC = () => {
  const [user, setUser] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('client-theme') === 'dark';
  });
  const navigate = useNavigate();
  const { totalItemsCount, openDrawer } = useCart();

  // Sync dark mode state with the root <html> element and localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('client-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('client-theme', 'light');
    }
  }, [isDarkMode]);

  // Verify customer session cookie on page load / refresh
  useEffect(() => {
    const controller = new AbortController();

    const verifySession = async () => {
      try {
        const response = await api.get<AuthSessionResponse>('/auth/me', {
          signal: controller.signal,
        });
        setUser(response.data.username || null);
        setIsAuthChecking(false);
      } catch (error: unknown) {
        if (axios.isCancel(error)) {
          return;
        }
        setUser(null);
        setIsAuthChecking(false);
      }
    };

    verifySession();

    return () => {
      controller.abort();
    };
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error: unknown) {
      console.error('Error logging out', error);
    } finally {
      setUser(null);
      navigate('/auth', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fdfbf7] dark:bg-[#0f172a] font-sans text-gray-800 dark:text-slate-100 transition-colors duration-300">
      {/* Header Section */}
      <header className="pt-12 pb-6 px-6 text-center shadow-sm bg-white dark:bg-[#141d2b] border-b border-transparent dark:border-slate-800 transition-colors duration-300">
        <h1 className="text-5xl md:text-6xl font-serif font-bold text-gray-900 dark:text-[#fdfbf7] tracking-tight mb-2">
          Provi-Prints
        </h1>
        <p className="text-xl text-gray-800 dark:text-slate-200 font-serif tracking-wide mt-3 mb-5">
          Providing <span className="text-base text-gray-400 dark:text-[#e9c46a]/80 italic font-light mx-1">for your</span>
          Province <span className="text-base text-gray-400 dark:text-[#e9c46a]/80 italic font-light mx-1">through</span>
          Prints
        </p>

        <div className="flex justify-center items-center gap-3 text-[10px] md:text-xs text-gray-400 dark:text-slate-400 uppercase tracking-[0.25em] font-semibold">
          <span className="h-[1px] w-8 md:w-16 bg-gray-200 dark:bg-[#e9c46a]/40"></span>
          Vintage-Inspired Travel Posters of the UK
          <span className="h-[1px] w-8 md:w-16 bg-gray-200 dark:bg-[#e9c46a]/40"></span>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="bg-[#2c3e50] dark:bg-[#1a2536] text-white sticky top-0 z-40 shadow-md border-b border-transparent dark:border-slate-800/80 transition-colors duration-300">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3.5">
          {/* Left spacer on desktop to keep nav links centered */}
          <div className="hidden md:block w-44" />

          <ul className="flex justify-center items-center space-x-6 md:space-x-14 text-sm md:text-base uppercase tracking-wider font-semibold">
            <li>
              <Link
                to="/"
                className="hover:text-[#e9c46a] transition-colors duration-300 focus:outline-none pb-1 border-b-2 border-transparent hover:border-[#e9c46a]"
              >
                Home
              </Link>
            </li>
            {!isAuthChecking &&
              (user ? (
                <li>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-[#e9c46a] hover:text-white transition-colors duration-300 focus:outline-none pb-1 border-b-2 border-transparent hover:border-white cursor-pointer"
                  >
                    Logout ({user})
                  </button>
                </li>
              ) : (
                <li>
                  <Link
                    to="/auth"
                    className="hover:text-[#e9c46a] transition-colors duration-300 focus:outline-none pb-1 border-b-2 border-transparent hover:border-[#e9c46a]"
                  >
                    Account
                  </Link>
                </li>
              ))}
          </ul>

          {/* Basket + Theme Controls */}
          <div className="flex items-center justify-end gap-2.5 md:w-44">
            <button
              type="button"
              onClick={openDrawer}
              aria-label="Open print basket"
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#e9c46a] hover:bg-[#f4d58d] text-gray-900 text-xs font-bold tracking-wider uppercase transition-all shadow-sm cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
              </svg>
              <span className="hidden sm:inline">Basket</span>
              {totalItemsCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-gray-900 text-[#e9c46a] text-[10px] font-extrabold">
                  {totalItemsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label="Toggle dark mode"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 dark:bg-slate-800/90 dark:hover:bg-slate-700 border border-white/15 dark:border-[#e9c46a]/40 text-xs font-semibold tracking-wider uppercase text-white dark:text-[#e9c46a] transition-all duration-300 shadow-sm cursor-pointer"
            >
              <span className="hidden sm:inline">{isDarkMode ? 'Light' : 'Dark'}</span>
              {isDarkMode ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-[#e9c46a]"
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
                  className="h-4 w-4 text-[#e9c46a]"
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
          </div>
        </div>
      </nav>

      {/* Page Routing */}
      <div className="flex-grow">
        <Routes>
          <Route path="/" element={<HomePage isDarkMode={isDarkMode} />} />
          <Route path="/order-success" element={<OrderSuccessPage />} />
          <Route
            path="/auth"
            element={
              isAuthChecking ? null : user ? (
                <Navigate to="/" replace />
              ) : (
                <AuthPage setUser={setUser} />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <CartDrawer />

      <footer className="bg-gray-100 dark:bg-[#141d2b] border-t border-transparent dark:border-slate-800 py-8 text-center text-gray-500 dark:text-slate-400 text-sm mt-auto transition-colors duration-300">
        <p>&copy; {new Date().getFullYear()} Provi Prints. All rights reserved.</p>
        <p className="mt-2">Bringing vintage charm to modern walls — supporting UK local charities.</p>
      </footer>
    </div>
  );
};

const App: React.FC = () => (
  <CartProvider>
    <AppShell />
  </CartProvider>
);

export default App;
