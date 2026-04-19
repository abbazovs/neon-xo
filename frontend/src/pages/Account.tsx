import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import { usePrefs } from '../store/prefs';
import { Avatar } from '../components/Avatar';
import { ShareSheet } from '../components/Effects';
import { playSound } from '../lib/sound';
import type {
  CurrentUser,
  FriendEntry,
  LeaderboardEntry,
  MatchHistoryEntry,
  SearchResultUser,
} from '../types';

// =======================
// FRIENDS
// =======================
export const Friends: FC = () => {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultUser[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { friends: f } = await api.listFriends();
      setFriends(f);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const { users } = await api.searchUsers(query.trim());
        setResults(users);
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const showInviteLink = async () => {
    if (!inviteToken) {
      const { token } = await api.getInviteLink();
      setInviteToken(token);
    }
    setShowShare(true);
  };

  const rotateLink = async () => {
    const { token } = await api.rotateInviteLink();
    setInviteToken(token);
    playSound('notify');
  };

  const remove = async (f: FriendEntry) => {
    if (!confirm(t('friends.removeConfirm', { name: f.username }))) return;
    await api.removeFriend(f.id);
    setFriends((prev) => prev.filter((x) => x.id !== f.id));
  };

  const online = friends.filter((f) => f.online);
  const offline = friends.filter((f) => !f.online);

  const inviteUrl = inviteToken ? `${window.location.origin}/friend/${inviteToken}` : '';

  return (
    <div className="space-y-6">
      <h1 className="font-display uppercase tracking-wider text-2xl neon-cyan">{t('friends.title')}</h1>

      <div className="card space-y-3">
        <input
          className="input"
          placeholder={t('friends.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <ul className="divide-y divide-ink-faint/10">
            {results.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2">
                <Avatar id={u.avatarId} size={36} />
                <span className="flex-1 font-display">{u.username}</span>
                <span
                  className={`w-2 h-2 rounded-full ${u.online ? 'bg-cyan-neon shadow-neon-cyan' : 'bg-ink-faint/40'}`}
                  aria-label={u.online ? t('friends.online') : t('friends.offline')}
                />
                {u.isFriend ? (
                  <span className="text-xs text-ink-dim uppercase font-display">✓</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className="btn-secondary w-full" onClick={showInviteLink}>
        {t('friends.invite')}
      </button>

      <div className="card">
        {loading ? (
          <p className="text-ink-dim text-center py-4">…</p>
        ) : friends.length === 0 ? (
          <p className="text-ink-dim text-center py-4 font-body">{t('friends.noFriends')}</p>
        ) : (
          <div className="space-y-4">
            {online.length > 0 && (
              <div>
                <p className="font-display uppercase text-xs text-ink-dim mb-2">{t('friends.online')}</p>
                <ul className="space-y-2">
                  {online.map((f) => (
                    <FriendRow key={f.id} friend={f} onRemove={() => remove(f)} />
                  ))}
                </ul>
              </div>
            )}
            {offline.length > 0 && (
              <div>
                <p className="font-display uppercase text-xs text-ink-dim mb-2">{t('friends.offline')}</p>
                <ul className="space-y-2">
                  {offline.map((f) => (
                    <FriendRow key={f.id} friend={f} onRemove={() => remove(f)} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {showShare && inviteToken && (
        <>
          <ShareSheet
            url={inviteUrl}
            text="Add me on NEON XO"
            onClose={() => setShowShare(false)}
          />
          <button onClick={rotateLink} className="btn-ghost text-xs w-full">
            {t('friends.rotate')}
          </button>
        </>
      )}
    </div>
  );
};

const FriendRow: FC<{ friend: FriendEntry; onRemove: () => void }> = ({ friend, onRemove }) => (
  <li className="flex items-center gap-3 p-2 rounded-md hover:bg-ink/5">
    <Avatar id={friend.avatarId} size={36} />
    <span className="flex-1 font-display">{friend.username}</span>
    <span
      className={`w-2 h-2 rounded-full ${friend.online ? 'bg-cyan-neon shadow-neon-cyan' : 'bg-ink-faint/40'}`}
    />
    <button onClick={onRemove} className="text-xs text-ink-faint hover:text-magenta-neon uppercase">
      ✕
    </button>
  </li>
);

// =======================
// LEADERBOARD
// =======================
export const Rank: FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<'global' | 'friends'>('global');
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = tab === 'global' ? await api.globalLeaderboard() : await api.friendsLeaderboard();
        setRows(data.leaderboard);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [tab]);

  return (
    <div className="space-y-6">
      <h1 className="font-display uppercase tracking-wider text-2xl neon-cyan">{t('rank.title')}</h1>

      {user && (
        <div className="card">
          <p className="font-display uppercase text-xs text-ink-dim mb-3">{t('rank.yourStats')}</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label={t('rank.played')} value={user.gamesPlayed} />
            <Stat label={t('rank.won')} value={user.gamesWon} color="cyan" />
            <Stat label={t('rank.lost')} value={user.gamesLost} color="magenta" />
            <Stat label={t('rank.drawn')} value={user.gamesDrawn} />
            <Stat label={t('rank.streak')} value={user.currentStreak} color="cyan" />
            <Stat label={t('rank.best')} value={user.longestStreak} />
          </div>
        </div>
      )}

      {user && (
        <div className="flex gap-2">
          <TabBtn active={tab === 'global'} onClick={() => setTab('global')}>
            {t('rank.global')}
          </TabBtn>
          <TabBtn active={tab === 'friends'} onClick={() => setTab('friends')}>
            {t('rank.friendsTab')}
          </TabBtn>
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="text-ink-dim text-center py-4">…</p>
        ) : rows.length === 0 ? (
          <p className="text-ink-dim text-center py-4 font-body">{t('rank.empty')}</p>
        ) : (
          <ul className="divide-y divide-ink-faint/10">
            {rows.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="font-display text-ink-dim w-6 text-right">{i + 1}</span>
                <Avatar id={r.avatar_id} size={32} />
                <span className="flex-1 font-display truncate">{r.username}</span>
                <span className="font-display neon-cyan text-sm">{Number(r.win_rate).toFixed(1)}%</span>
                <span className="text-ink-dim text-xs">{r.games_played}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const Stat: FC<{ label: string; value: number; color?: 'cyan' | 'magenta' }> = ({ label, value, color }) => (
  <div>
    <div
      className={`font-display text-xl ${
        color === 'cyan' ? 'neon-cyan' : color === 'magenta' ? 'neon-magenta' : 'text-ink'
      }`}
    >
      {value}
    </div>
    <div className="text-xs text-ink-dim uppercase">{label}</div>
  </div>
);

const TabBtn: FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    onClick={onClick}
    className={`flex-1 py-2 px-4 rounded-md font-display uppercase tracking-wider text-sm transition ${
      active
        ? 'text-cyan-neon border border-cyan-neon bg-cyan-neon/10 shadow-neon-cyan'
        : 'text-ink-dim border border-ink-faint/30 hover:text-ink'
    }`}
  >
    {children}
  </button>
);

// =======================
// ME (account)
// =======================
export const Me: FC = () => {
  const { t, i18n } = useTranslation();
  const { user, logout, setUser } = useAuth();
  const { soundEnabled, setSound, volume, setVolume, highContrast, setHighContrast } = usePrefs();
  const [history, setHistory] = useState<MatchHistoryEntry[]>([]);
  const [mode, setMode] = useState<
    null | 'password' | 'username' | 'avatar' | 'delete'
  >(null);
  const [msg, setMsg] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (user) void api.history().then((r) => setHistory(r.matches));
  }, [user]);

  if (!user) {
    return (
      <div className="card text-center">
        <p className="text-ink-dim mb-4">Guest mode — no account settings.</p>
        <Link to="/login" className="btn-primary inline-block">
          {t('home.loginRegister')}
        </Link>
      </div>
    );
  }

  const changeLang = async (lang: string) => {
    await i18n.changeLanguage(lang);
    localStorage.setItem('neon-xo-lang', lang);
    await api.changeLanguage(lang).catch(() => {});
  };

  const handleLogout = async () => {
    await logout();
    nav('/');
  };

  const handleLogoutAll = async () => {
    await api.logoutAll().catch(() => {});
    await logout();
    nav('/');
  };

  return (
    <div className="space-y-6">
      <div className="card flex items-center gap-4">
        <Avatar id={user.avatarId} size={56} />
        <div className="flex-1">
          <div className="font-display uppercase neon-cyan tracking-wider">{user.username}</div>
          <div className="text-xs text-ink-dim">
            {user.gamesPlayed} games • {user.winRate}% win rate
          </div>
        </div>
      </div>

      {msg && <div className="text-cyan-neon text-sm">{msg}</div>}

      {/* Settings */}
      <div className="card space-y-3">
        <SettingRow
          label={t('me.language')}
          right={
            <select
              value={i18n.language}
              onChange={(e) => changeLang(e.target.value)}
              className="bg-bg-soft border border-ink-faint/30 rounded px-3 py-1.5 text-sm"
            >
              <option value="en">English</option>
              <option value="ru">Русский</option>
              <option value="uz">O'zbekcha</option>
            </select>
          }
        />
        <SettingRow
          label={t('me.sound')}
          right={
            <button
              onClick={() => setSound(!soundEnabled)}
              className={`px-3 py-1 text-xs rounded font-display uppercase ${
                soundEnabled ? 'text-cyan-neon border border-cyan-neon' : 'text-ink-dim border border-ink-faint/30'
              }`}
            >
              {soundEnabled ? 'ON' : 'OFF'}
            </button>
          }
        />
        <SettingRow
          label={t('me.volume')}
          right={
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-32"
            />
          }
        />
        <SettingRow
          label={t('me.highContrast')}
          right={
            <button
              onClick={() => {
                setHighContrast(!highContrast);
                document.documentElement.classList.toggle('high-contrast', !highContrast);
              }}
              className={`px-3 py-1 text-xs rounded font-display uppercase ${
                highContrast ? 'text-cyan-neon border border-cyan-neon' : 'text-ink-dim border border-ink-faint/30'
              }`}
            >
              {highContrast ? 'ON' : 'OFF'}
            </button>
          }
        />
      </div>

      {/* Account actions */}
      <div className="card space-y-2">
        <button className="btn-ghost w-full" onClick={() => setMode('password')}>
          {t('me.changePassword')}
        </button>
        <button className="btn-ghost w-full" onClick={() => setMode('username')}>
          {t('me.changeUsername')}
        </button>
        <button className="btn-ghost w-full" onClick={() => setMode('avatar')}>
          {t('me.changeAvatar')}
        </button>
        <button className="btn-ghost w-full" onClick={handleLogout}>
          {t('me.logout')}
        </button>
        <button className="btn-ghost w-full" onClick={handleLogoutAll}>
          {t('me.logoutAll')}
        </button>
        <button
          className="w-full py-3 border border-magenta-neon/60 text-magenta-neon font-display uppercase tracking-wider text-sm rounded hover:bg-magenta-neon/10"
          onClick={() => setMode('delete')}
        >
          {t('me.deleteAccount')}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="card">
          <p className="font-display uppercase text-xs text-ink-dim mb-3">History</p>
          <ul className="divide-y divide-ink-faint/10 text-sm">
            {history.slice(0, 20).map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    m.result === 'win'
                      ? 'bg-cyan-neon shadow-neon-cyan'
                      : m.result === 'loss'
                        ? 'bg-magenta-neon'
                        : 'bg-ink-faint'
                  }`}
                />
                <span className="flex-1 truncate">{m.opponent.name}</span>
                <span className="text-ink-dim text-xs">{m.boardSize}×{m.boardSize}</span>
                <span className="text-ink-dim text-xs">
                  {new Date(m.finishedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === 'password' && (
        <PasswordModal onClose={() => setMode(null)} onSuccess={() => setMsg('Password changed')} />
      )}
      {mode === 'username' && (
        <UsernameModal
          current={user.username}
          onClose={() => setMode(null)}
          onSuccess={(u) => {
            setUser({ ...user, username: u });
            setMsg('Username changed');
          }}
        />
      )}
      {mode === 'avatar' && (
        <AvatarModal
          current={user.avatarId}
          onClose={() => setMode(null)}
          onSuccess={(a) => {
            setUser({ ...user, avatarId: a });
            setMsg('Avatar changed');
          }}
        />
      )}
      {mode === 'delete' && (
        <DeleteModal
          onClose={() => setMode(null)}
          onSuccess={async () => {
            await logout();
            nav('/');
          }}
        />
      )}
    </div>
  );
};

const SettingRow: FC<{ label: string; right: React.ReactNode }> = ({ label, right }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="font-body text-ink">{label}</span>
    {right}
  </div>
);

// Modals
const PasswordModal: FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [old, setOld] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.changePassword(old, next);
      onSuccess();
      onClose();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };
  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <h3 className="font-display uppercase neon-cyan">{t('me.changePassword')}</h3>
        <input
          type="password"
          className="input"
          placeholder={t('me.oldPassword')}
          value={old}
          onChange={(e) => setOld(e.target.value)}
          required
        />
        <input
          type="password"
          className="input"
          placeholder={t('me.newPassword')}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
        />
        {err && <p className="text-magenta-neon text-sm">{err}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            {t('me.cancel')}
          </button>
          <button type="submit" className="btn-primary flex-1">
            {t('me.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const UsernameModal: FC<{
  current: string;
  onClose: () => void;
  onSuccess: (u: string) => void;
}> = ({ current, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(current);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.changeUsername(name);
      onSuccess(name);
      onClose();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };
  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <h3 className="font-display uppercase neon-cyan">{t('me.changeUsername')}</h3>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={6}
          maxLength={20}
          pattern="[A-Za-z0-9_]{6,20}"
          required
        />
        {err && <p className="text-magenta-neon text-sm">{err}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            {t('me.cancel')}
          </button>
          <button type="submit" className="btn-primary flex-1">
            {t('me.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const AvatarModal: FC<{
  current: number;
  onClose: () => void;
  onSuccess: (id: number) => void;
}> = ({ current, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [id, setId] = useState(current);
  const submit = async () => {
    await api.changeAvatar(id);
    onSuccess(id);
    onClose();
  };
  return (
    <Modal onClose={onClose}>
      <h3 className="font-display uppercase neon-cyan mb-3">{t('me.changeAvatar')}</h3>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <button
            type="button"
            key={i}
            onClick={() => setId(i)}
            className={`rounded-md p-1 transition ${
              id === i ? 'ring-2 ring-cyan-neon shadow-neon-cyan' : 'ring-1 ring-ink-faint/30'
            }`}
          >
            <Avatar id={i} size={36} />
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-4">
        <button className="btn-ghost flex-1" onClick={onClose}>
          {t('me.cancel')}
        </button>
        <button className="btn-primary flex-1" onClick={submit}>
          {t('me.save')}
        </button>
      </div>
    </Modal>
  );
};

const DeleteModal: FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.deleteAccount(password);
      onSuccess();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };
  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <h3 className="font-display uppercase neon-magenta">{t('me.deleteAccount')}</h3>
        <p className="text-ink-dim text-sm">{t('me.deleteConfirm')}</p>
        <input
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {err && <p className="text-magenta-neon text-sm">{err}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            {t('me.cancel')}
          </button>
          <button type="submit" className="btn-secondary flex-1">
            {t('me.deleteAccount')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const Modal: FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
    onClick={onClose}
  >
    <motion.div
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      onClick={(e) => e.stopPropagation()}
      className="card w-full max-w-sm"
    >
      {children}
    </motion.div>
  </motion.div>
);

// =======================
// FRIEND INVITE ACCEPT
// =======================
export const AcceptFriendInvite: FC = () => {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [status, setStatus] = useState<'pending' | 'done' | 'error' | 'loginRequired'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) {
      setStatus('loginRequired');
      return;
    }
    (async () => {
      try {
        const res = await api.acceptInvite(token);
        setMessage(t('friends.inviteAccepted', { name: res.friend?.username ?? 'friend' }));
        setStatus('done');
      } catch (err) {
        if (err instanceof ApiError) setMessage(err.message);
        setStatus('error');
      }
    })();
  }, [user, token, t]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6">
      <div className="card max-w-md text-center">
        {status === 'pending' && <p className="text-ink-dim animate-pulse-neon">…</p>}
        {status === 'loginRequired' && (
          <>
            <p className="text-ink-dim mb-4">Login to accept friend invite</p>
            <Link to="/login" className="btn-primary inline-block">
              {t('home.loginRegister')}
            </Link>
          </>
        )}
        {status === 'done' && (
          <>
            <p className="neon-cyan mb-4">{message}</p>
            <button className="btn-primary" onClick={() => nav('/app/friends')}>
              {t('friends.title')}
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-magenta-neon mb-4">{message}</p>
            <button className="btn-primary" onClick={() => nav('/app')}>
              {t('match.home')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// =======================
// ERROR / 404
// =======================
export const ErrorPage: FC<{ message?: string }> = ({ message }) => {
  const { t } = useTranslation();
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6">
      <h1 className="font-display uppercase tracking-wider text-4xl neon-magenta mb-4">404</h1>
      <p className="text-ink-dim mb-6 font-body">{message ?? t('errors.pageNotFound')}</p>
      <Link to="/" className="btn-primary">
        {t('errors.goHome')}
      </Link>
    </div>
  );
};
