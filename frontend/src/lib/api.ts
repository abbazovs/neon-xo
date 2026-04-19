import type {
  CurrentUser,
  FriendEntry,
  LeaderboardEntry,
  MatchHistoryEntry,
  SearchResultUser,
} from '../types';

const API_BASE = '/api';

function token(): string | null {
  return localStorage.getItem('neon-xo-token');
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, body?.code, body?.error ?? res.statusText);
  }
  return body as T;
}

export const api = {
  // auth
  register: (username: string, password: string, avatarId: number, language: string) =>
    req<{ token: string; user: CurrentUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, avatarId, language }),
    }),
  login: (username: string, password: string) =>
    req<{ token: string; user: CurrentUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => req<{ user: CurrentUser }>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    req('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
  changeUsername: (newUsername: string) =>
    req('/auth/change-username', { method: 'POST', body: JSON.stringify({ newUsername }) }),
  changeAvatar: (avatarId: number) =>
    req('/auth/change-avatar', { method: 'POST', body: JSON.stringify({ avatarId }) }),
  changeLanguage: (language: string) =>
    req('/auth/change-language', { method: 'POST', body: JSON.stringify({ language }) }),
  logoutAll: () => req('/auth/logout-all', { method: 'POST' }),
  deleteAccount: (password: string) =>
    req('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) }),

  // users
  searchUsers: (q: string) => req<{ users: SearchResultUser[] }>(`/users/search?q=${encodeURIComponent(q)}`),

  // friends
  listFriends: () => req<{ friends: FriendEntry[] }>('/friends'),
  removeFriend: (id: string) => req(`/friends/${id}`, { method: 'DELETE' }),
  getInviteLink: () => req<{ token: string }>('/friends/invite-link'),
  rotateInviteLink: () => req<{ token: string }>('/friends/invite-link/rotate', { method: 'POST' }),
  acceptInvite: (token: string) =>
    req<{ ok: true; friend: { id: string; username: string; avatarId: number } | null }>(
      '/friends/accept-invite',
      { method: 'POST', body: JSON.stringify({ token }) },
    ),

  // leaderboard
  globalLeaderboard: () => req<{ leaderboard: LeaderboardEntry[] }>('/leaderboard/global'),
  friendsLeaderboard: () => req<{ leaderboard: LeaderboardEntry[] }>('/leaderboard/friends'),

  // matches
  history: () => req<{ matches: MatchHistoryEntry[] }>('/matches/history'),
};
