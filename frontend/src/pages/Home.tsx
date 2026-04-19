import type { FC } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { usePrefs } from '../store/prefs';
import { Avatar } from '../components/Avatar';
import { getSocket } from '../lib/socket';
import { playSound } from '../lib/sound';
import type { BoardSize, MatchFormat, PublicMatchState, TimerSeconds } from '../types';

export const Home: FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { guestName, guestAvatarId } = usePrefs();
  const nav = useNavigate();

  const [mode, setMode] = useState<'home' | 'create' | 'waitingQuick'>('home');
  const [boardSize, setBoardSize] = useState<BoardSize>(3);
  const [format, setFormat] = useState<MatchFormat>('single');
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(0);
  const [error, setError] = useState<string | null>(null);

  const displayName = user?.username ?? guestName;
  const displayAvatar = user?.avatarId ?? guestAvatarId;

  if (!displayName) {
    // Guest who cleared storage
    nav('/');
    return null;
  }

  const createMatch = () => {
    playSound('click');
    const socket = getSocket();
    socket.emit(
      'match:create',
      {
        boardSize,
        format,
        timerSeconds,
        guestName: user ? undefined : guestName,
        guestAvatarId: user ? undefined : guestAvatarId,
      },
      (res: { ok: true; code: string; state: PublicMatchState } | { ok: false; error: string }) => {
        if (res.ok) {
          nav(`/match/${res.code}`);
        } else {
          setError(res.error);
          playSound('error');
        }
      },
    );
  };

  const startQuickMatch = () => {
    if (!user) return setError('Login required for Quick Match');
    playSound('click');
    setMode('waitingQuick');
    const socket = getSocket();
    socket.emit('quickmatch:enqueue', (res: { ok: true } | { ok: false; error: string }) => {
      if (!res.ok) {
        setError(res.error);
        setMode('home');
      }
    });
    socket.once('quickmatch:paired', ({ code }: { code: string }) => {
      nav(`/match/${code}`);
    });
  };

  const cancelQuickMatch = () => {
    const socket = getSocket();
    socket.emit('quickmatch:cancel');
    setMode('home');
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card flex items-center gap-4"
      >
        <Avatar id={displayAvatar} size={56} />
        <div>
          <p className="text-ink-dim text-sm font-body">{t('home.welcome')}</p>
          <p className="font-display text-lg uppercase tracking-wider neon-cyan">{displayName}</p>
        </div>
      </motion.div>

      {mode === 'home' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {user && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={startQuickMatch}
              className="card text-left p-6 border-cyan-neon/40 hover:shadow-neon-cyan"
            >
              <h2 className="font-display uppercase text-xl neon-cyan mb-2">{t('home.quickMatch')}</h2>
              <p className="text-ink-dim font-body">{t('home.quickMatchDesc')}</p>
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setMode('create')}
            className="card text-left p-6 border-magenta-neon/40 hover:shadow-neon-magenta"
          >
            <h2 className="font-display uppercase text-xl neon-magenta mb-2">{t('home.playFriend')}</h2>
            <p className="text-ink-dim font-body">{t('home.playFriendDesc')}</p>
          </motion.button>
        </div>
      )}

      {mode === 'create' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card space-y-5">
          <h2 className="font-display uppercase text-lg neon-magenta">{t('match.create')}</h2>

          <Setting label={t('match.board')}>
            {[3, 4, 5].map((s) => (
              <OptionButton key={s} active={boardSize === s} onClick={() => setBoardSize(s as BoardSize)}>
                {s}×{s}
              </OptionButton>
            ))}
          </Setting>

          <Setting label={t('match.format')}>
            <OptionButton active={format === 'single'} onClick={() => setFormat('single')}>
              {t('match.single')}
            </OptionButton>
            <OptionButton active={format === 'bo3'} onClick={() => setFormat('bo3')}>
              {t('match.bo3')}
            </OptionButton>
            <OptionButton active={format === 'bo5'} onClick={() => setFormat('bo5')}>
              {t('match.bo5')}
            </OptionButton>
          </Setting>

          <Setting label={t('match.timer')}>
            <OptionButton active={timerSeconds === 0} onClick={() => setTimerSeconds(0)}>
              {t('match.noTimer')}
            </OptionButton>
            <OptionButton active={timerSeconds === 10} onClick={() => setTimerSeconds(10)}>
              {t('match.sec10')}
            </OptionButton>
            <OptionButton active={timerSeconds === 30} onClick={() => setTimerSeconds(30)}>
              {t('match.sec30')}
            </OptionButton>
          </Setting>

          {error && <div className="text-magenta-neon">{error}</div>}

          <div className="flex gap-3">
            <button className="btn-ghost flex-1" onClick={() => setMode('home')}>
              {t('common.back')}
            </button>
            <button className="btn-primary flex-1" onClick={createMatch}>
              {t('match.start')}
            </button>
          </div>
        </motion.div>
      )}

      {mode === 'waitingQuick' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card text-center py-12">
          <div className="font-display uppercase text-xl neon-cyan animate-pulse-neon mb-2">
            {t('home.quickMatch')}
          </div>
          <p className="text-ink-dim mb-6">{t('home.quickMatchDesc')}…</p>
          <button className="btn-ghost" onClick={cancelQuickMatch}>
            {t('common.cancel')}
          </button>
        </motion.div>
      )}
    </div>
  );
};

const Setting: FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <p className="font-display uppercase text-xs text-ink-dim tracking-wider mb-2">{label}</p>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

const OptionButton: FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`px-4 py-2 rounded-md font-display uppercase tracking-wider text-sm border transition ${
      active
        ? 'text-cyan-neon border-cyan-neon bg-cyan-neon/10 shadow-neon-cyan'
        : 'text-ink-dim border-ink-faint/30 hover:text-ink'
    }`}
  >
    {children}
  </button>
);
