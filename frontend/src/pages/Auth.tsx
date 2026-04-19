import type { FC } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Logo } from '../components/Logo';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../store/auth';
import { refreshSocketAuth } from '../lib/socket';
import { playSound } from '../lib/sound';

export const Login: FC = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      refreshSocketAuth();
      playSound('notify');
      nav('/app');
    } catch (err) {
      playSound('error');
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="font-display uppercase tracking-wider text-xl mb-6 text-center neon-cyan">
        {t('auth.login')}
      </h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input
          className="input"
          placeholder={t('auth.username')}
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={6}
          maxLength={20}
          pattern="[A-Za-z0-9_]{6,20}"
        />
        <input
          className="input"
          type="password"
          placeholder={t('auth.password')}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        {error && <div className="text-magenta-neon text-sm font-body">{error}</div>}
        <button type="submit" className="btn-primary mt-2" disabled={busy}>
          {t('auth.submit')}
        </button>
      </form>
      <p className="mt-6 text-center text-ink-dim text-sm">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="neon-magenta font-display uppercase tracking-wider">
          {t('auth.register')}
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-ink-faint">
        lang: {i18n.language}
      </p>
    </AuthShell>
  );
};

export const Register: FC = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [avatarId, setAvatarId] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('auth.errors.passwordsMismatch'));
      return;
    }
    setBusy(true);
    try {
      await register(username, password, avatarId, i18n.language);
      refreshSocketAuth();
      playSound('notify');
      nav('/app');
    } catch (err) {
      playSound('error');
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="font-display uppercase tracking-wider text-xl mb-6 text-center neon-magenta">
        {t('auth.register')}
      </h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <input
            className="input"
            placeholder={t('auth.username')}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={6}
            maxLength={20}
            pattern="[A-Za-z0-9_]{6,20}"
          />
          <p className="text-xs text-ink-faint mt-1.5">{t('auth.usernameRules')}</p>
        </div>
        <div>
          <input
            className="input"
            type="password"
            placeholder={t('auth.password')}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <p className="text-xs text-ink-faint mt-1.5">{t('auth.passwordRules')}</p>
        </div>
        <input
          className="input"
          type="password"
          placeholder={t('auth.confirmPassword')}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <div>
          <p className="font-display uppercase text-xs text-ink-dim tracking-wider mb-2">
            {t('auth.pickAvatar')}
          </p>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <button
                type="button"
                key={i}
                onClick={() => setAvatarId(i)}
                className={`rounded-md p-1 transition ${
                  avatarId === i ? 'ring-2 ring-magenta-neon shadow-neon-magenta' : 'ring-1 ring-ink-faint/30'
                }`}
                aria-pressed={avatarId === i}
              >
                <Avatar id={i} size={36} />
              </button>
            ))}
          </div>
        </div>
        {error && <div className="text-magenta-neon text-sm">{error}</div>}
        <button type="submit" className="btn-secondary mt-2" disabled={busy}>
          {t('auth.submit')}
        </button>
      </form>
      <p className="mt-6 text-center text-ink-dim text-sm">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="neon-cyan font-display uppercase tracking-wider">
          {t('auth.login')}
        </Link>
      </p>
    </AuthShell>
  );
};

const AuthShell: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-[100dvh] flex items-center justify-center p-6">
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md card"
    >
      <Link to="/" className="flex justify-center mb-6">
        <Logo size="md" />
      </Link>
      {children}
    </motion.div>
  </div>
);
