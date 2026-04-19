import { useEffect, useState, type FC } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from './store/auth';
import { usePrefs } from './store/prefs';
import { getSocket } from './lib/socket';
import { LanguageSplash } from './pages/LanguageSplash';
import { Landing } from './pages/Landing';
import { Login, Register } from './pages/Auth';
import { Home } from './pages/Home';
import { Match } from './pages/Match';
import { AppLayout } from './components/Nav';
import { Friends, Rank, Me, AcceptFriendInvite, ErrorPage } from './pages/Account';
import { Logo } from './components/Logo';

export const App: FC = () => {
  const { t, i18n } = useTranslation();
  const { languageChosen, setLanguageChosen, highContrast, guestName } = usePrefs();
  const { user, loading, refresh, logout } = useAuth();
  const [duplicateSession, setDuplicateSession] = useState(false);
  const [sessionRevoked, setSessionRevoked] = useState(false);
  const [connected, setConnected] = useState(true);
  const [splashVisible, setSplashVisible] = useState(true);

  // Initial splash fade + auth refresh
  useEffect(() => {
    void refresh();
    const t = setTimeout(() => setSplashVisible(false), 700);
    return () => clearTimeout(t);
  }, [refresh]);

  // Apply high contrast to html
  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast);
  }, [highContrast]);

  // If the user had set a language via i18next-browser-languagedetector,
  // consider language chosen. This handles returning users cleanly.
  useEffect(() => {
    const stored = localStorage.getItem('neon-xo-lang');
    if (stored && !languageChosen) setLanguageChosen(true);
  }, [languageChosen, setLanguageChosen]);

  // Apply server-side language when user refreshes
  useEffect(() => {
    if (user && user) {
      // no-op; server has language preference tied to localStorage
    }
  }, [user]);

  // Socket lifecycle events
  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onDuplicate = () => setDuplicateSession(true);
    const onRevoked = () => {
      setSessionRevoked(true);
      void logout();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session:duplicate', onDuplicate);
    socket.on('session:revoked', onRevoked);

    // Heartbeat
    const id = setInterval(() => socket.emit('presence:ping'), 30_000);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session:duplicate', onDuplicate);
      socket.off('session:revoked', onRevoked);
      clearInterval(id);
    };
  }, [logout]);

  // Initial splash
  if (splashVisible) {
    return (
      <motion.div
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-[100dvh] flex items-center justify-center"
      >
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Logo size="lg" />
        </motion.div>
      </motion.div>
    );
  }

  // Language splash
  if (!languageChosen) {
    return <LanguageSplash />;
  }

  // Auth still loading
  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Logo size="md" />
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={user ? <Navigate to="/app" /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/app" /> : <Register />} />

        {/* Match page is standalone — no nav wrapper */}
        <Route path="/match/:code" element={<Match />} />

        {/* Friend invite accept */}
        <Route path="/friend/:token" element={<AcceptFriendInvite />} />

        {/* Authed or guest-with-name app */}
        <Route
          path="/app/*"
          element={
            user || guestName ? (
              <AppLayout>
                <Routes>
                  <Route index element={<Home />} />
                  {user && <Route path="friends" element={<Friends />} />}
                  <Route path="rank" element={<Rank />} />
                  <Route path="me" element={<Me />} />
                </Routes>
              </AppLayout>
            ) : (
              <Navigate to="/" />
            )
          }
        />

        <Route path="*" element={<ErrorPage />} />
      </Routes>

      {/* Connection lost banner */}
      <AnimatePresence>
        {!connected && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="fixed top-0 left-0 right-0 bg-magenta-neon/20 border-b border-magenta-neon/60 text-center py-2 z-50 font-display uppercase text-sm neon-magenta backdrop-blur-sm"
          >
            {t('errors.connectionLost')}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duplicate session modal */}
      <AnimatePresence>
        {duplicateSession && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-6"
          >
            <div className="card max-w-md text-center p-8">
              <h2 className="font-display uppercase neon-magenta text-xl mb-4">⚠</h2>
              <p className="text-ink mb-6 font-body">{t('errors.duplicateSession')}</p>
              <button
                className="btn-primary w-full"
                onClick={() => {
                  setDuplicateSession(false);
                  window.location.href = '/';
                }}
              >
                {t('common.close')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session revoked modal */}
      <AnimatePresence>
        {sessionRevoked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-6"
          >
            <div className="card max-w-md text-center p-8">
              <p className="text-ink mb-6 font-body">{t('errors.sessionRevoked')}</p>
              <button
                className="btn-primary w-full"
                onClick={() => {
                  setSessionRevoked(false);
                  window.location.href = '/login';
                }}
              >
                {t('auth.login')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Helper hook to get current path (unused but exported for future)
export function useCurrentPath(): string {
  return useLocation().pathname;
}
