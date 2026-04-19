export type Cell = 'X' | 'O' | null;
export type Board = Cell[];
export type BoardSize = 3 | 4 | 5;
export type Player = 'X' | 'O';
export type MatchFormat = 'single' | 'bo3' | 'bo5';
export type TimerSeconds = 0 | 10 | 30;

export interface PublicPlayer {
  userId: string | null;
  displayName: string;
  avatarId: number;
  connected: boolean;
}

export interface PublicMatchState {
  code: string;
  status: 'waiting' | 'coin_flip' | 'active' | 'finished' | 'abandoned' | 'voided';
  boardSize: BoardSize;
  format: MatchFormat;
  timerSeconds: TimerSeconds;
  board: Board;
  turn: Player;
  p1: PublicPlayer;
  p2: PublicPlayer | null;
  p1Score: number;
  p2Score: number;
  roundsToWin: number;
  roundNumber: number;
  winnerSide: 'p1' | 'p2' | null;
  result: 'p1_win' | 'p2_win' | 'draw' | 'abandoned' | null;
  endReason: string | null;
  winLine: number[] | null;
  moveDeadline: number | null;
}

export interface CurrentUser {
  id: string;
  username: string;
  avatarId: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  winRate: number;
  currentStreak: number;
  longestStreak: number;
}

export interface FriendEntry {
  id: string;
  username: string;
  avatarId: number;
  online: boolean;
}

export interface SearchResultUser {
  id: string;
  username: string;
  avatarId: number;
  online: boolean;
  isFriend: boolean;
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  avatar_id: number;
  games_played: number;
  games_won: number;
  win_rate: number;
}

export interface MatchHistoryEntry {
  id: string;
  code: string;
  opponent: { userId: string | null; name: string };
  result: 'win' | 'loss' | 'draw';
  boardSize: number;
  format: string;
  finishedAt: string;
}
