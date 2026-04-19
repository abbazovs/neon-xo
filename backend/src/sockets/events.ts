import type { Board, BoardSize, MatchFormat, Player, TimerSeconds } from '../game/engine.js';

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

export interface ClientToServerEvents {
  'match:join': (
    payload: { code: string; guestName?: string; guestAvatarId?: number },
    ack: (res: { ok: true; side: 'p1' | 'p2'; state: PublicMatchState } | { ok: false; error: string }) => void,
  ) => void;
  'match:create': (
    payload: {
      boardSize: BoardSize;
      format: MatchFormat;
      timerSeconds: TimerSeconds;
      guestName?: string;
      guestAvatarId?: number;
    },
    ack: (res: { ok: true; code: string; side: 'p1'; state: PublicMatchState } | { ok: false; error: string }) => void,
  ) => void;
  'match:coinFlip': (
    payload: { code: string },
    ack: (res: { ok: true; first: 'p1' | 'p2' } | { ok: false; error: string }) => void,
  ) => void;
  'match:move': (
    payload: { code: string; index: number },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  'match:surrender': (
    payload: { code: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  'match:rematch': (
    payload: { code: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  'match:cancel': (
    payload: { code: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  'match:emoji': (payload: { code: string; emoji: string }) => void;
  'quickmatch:enqueue': (
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  'quickmatch:cancel': () => void;
  'presence:ping': () => void;
}

export interface ServerToClientEvents {
  'match:state': (state: PublicMatchState) => void;
  'match:coinFlipResult': (payload: { first: 'p1' | 'p2' }) => void;
  'match:moveMade': (payload: { index: number; by: Player; state: PublicMatchState }) => void;
  'match:roundEnd': (payload: {
    winnerSide: 'p1' | 'p2' | null;
    draw: boolean;
    winLine: number[] | null;
    state: PublicMatchState;
  }) => void;
  'match:finished': (payload: {
    winnerSide: 'p1' | 'p2' | null;
    reason: string;
    state: PublicMatchState;
  }) => void;
  'match:opponentDisconnected': (payload: { state: PublicMatchState }) => void;
  'match:rematchOffered': (payload: { by: 'p1' | 'p2' }) => void;
  'match:emoji': (payload: { by: 'p1' | 'p2'; emoji: string }) => void;
  'match:error': (payload: { error: string }) => void;
  'quickmatch:paired': (payload: { code: string }) => void;
  'session:revoked': () => void;
  'session:duplicate': () => void;
}
