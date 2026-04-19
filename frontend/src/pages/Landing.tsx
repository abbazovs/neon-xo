import type { FC } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Logo } from '../components/Logo';
import { Avatar } from '../components/Avatar';
import { usePrefs } from '../store/prefs';
import { playSound } from '../lib/sound';

export const Landing: FC = () => {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { guestName, setGuestName, guestAvatarId, setGuestAvatar } = usePrefs();
  const [showGuest, setShowGuest] = useState(false);
  const [name, setName] = useState(guestName);
  const [avatar, setAvatar] = useState(guestAvatarId);

  const submitGuest = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 1) return;
    setGuestName(trimmed);
    setGuestAvatar(avatar);
    playSound('notify');
    nav('/app');
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md text-center"
      >
        <div className="mb-10 flex justify-center">
          <Logo size="lg" />
        </div>
        <p className="text-ink-dim mb-8 font-body">{t('app.tagline')}</p>

        {!showGuest ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col md:flex-row gap-4"
          >
            <button
              className="btn-primary flex-1 py-4"
              onClick={() => {
                playSound('click');
                setShowGuest(true);
              }}
            >
              {t('home.playAsGuest')}
            </button>
            <Link to="/login" onClick={() => playSound('click')} className="btn-secondary flex-1 py-4 text-center">
              {t('home.loginRegister')}
            </Link>
          </motion.div>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={submitGuest}
            className="flex flex-col gap-5 text-left"
          >
            <div>
              <label className="font-display uppercase text-xs text-ink-dim tracking-wider block mb-2">
                {t('guest.yourName')}
              </label>
              <input
                type="text"
                className="input"
                placeholder={t('guest.namePlaceholder')}
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="font-display uppercase text-xs text-ink-dim tracking-wider block mb-2">
                {t('auth.pickAvatar')}
              </label>
              <div className="grid grid-cols-6 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => {
                      playSound('click');
                      setAvatar(i);
                    }}
                    className={`rounded-md p-1 transition ${
                      avatar === i ? 'ring-2 ring-cyan-neon shadow-neon-cyan' : 'ring-1 ring-ink-faint/30'
                    }`}
                    aria-label={`Avatar ${i}`}
                    aria-pressed={avatar === i}
                  >
                    <Avatar id={i} size={40} />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" className="btn-ghost flex-1" onClick={() => setShowGuest(false)}>
                {t('common.back')}
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={name.trim().length < 1}>
                {t('guest.continue')}
              </button>
            </div>
          </motion.form>
        )}
      </motion.div>
    </div>
  );
};
