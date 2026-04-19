import { nanoid } from 'nanoid';
import { redis } from '../db/redis.js';
import {
  type Board,
  type BoardSize,
  type MatchFormat,
  type Player,
  type TimerSeconds,
  createEmptyBoard,
  roundsToWin,
} from './engine.js';

/**
 * Runtime match state.
 * Stored in Redis so multiple server replicas can coordinate.
 * The final result is persisted to Postgres when the match ends.
 */
export interface PlayerSlot {
  socketId: string | null;
  userId: string | null; // null for guests
  displayName: string;
  avatarId: number;
  connected: boolean;
}

export interface LiveMatch {
  id: string;
  code: string; // short shareable code used in links
  status: 'waiting' | 'coin_flip' | 'active' | 'finished' | 'abandoned' | 'voided';
  boardSize: BoardSize;
  format: MatchFormat;
  timerSeconds: TimerSeconds;
  board: Board;
  turn: Player;
  p1: PlayerSlot;
  p2: PlayerSlot | null;
  p1Score: number; // rounds won in the current series
  p2Score: number;
  roundsToWin: number;
  roundNumber: number;
  winnerUserId: string | null;
  result: 'p1_win' | 'p2_win' | 'draw' | 'abandoned' | null;
  endReason: string | null;
  createdAt: number;
  expiresAt: number;
  moveDeadline: number | null; // unix ms, null when no timer
  isQuickMatch: boolean;
}

const MATCH_KEY = (code: string) => `match:${code}`;
const MATCH_BY_ID = (id: string) => `match:id:${id}`;
const MATCH_TTL_SECONDS = 60 * 60 * 6; // 6 hours max lifetime in Redis

export async function saveMatch(m: LiveMatch): Promise<void> {
  const json = JSON.stringify(m);
  await redis
    .multi()
    .set(MATCH_KEY(m.code), json, 'EX', MATCH_TTL_SECONDS)
    .set(MATCH_BY_ID(m.id), m.code, 'EX', MATCH_TTL_SECONDS)
    .exec();
}

export async function loadMatch(code: string): Promise<LiveMatch | null> {
  const raw = await redis.get(MATCH_KEY(code));
  return raw ? (JSON.parse(raw) as LiveMatch) : null;
}

export async function loadMatchById(id: string): Promise<LiveMatch | null> {
  const code = await redis.get(MATCH_BY_ID(id));
  if (!code) return null;
  return loadMatch(code);
}

export async function deleteMatch(code: string): Promise<void> {
  const m = await loadMatch(code);
  await redis.del(MATCH_KEY(code));
  if (m) await redis.del(MATCH_BY_ID(m.id));
}

export function generateMatchCode(): string {
  // URL-safe short code, 10 chars (~60 bits of entropy)
  return nanoid(10);
}

export interface CreateMatchInput {
  boardSize: BoardSize;
  format: MatchFormat;
  timerSeconds: TimerSeconds;
  p1UserId: string | null;
  p1DisplayName: string;
  p1AvatarId: number;
  p1SocketId: string;
  isQuickMatch?: boolean;
}

export function createLiveMatch(input: CreateMatchInput, expiresInMs: number): LiveMatch {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    code: generateMatchCode(),
    status: 'waiting',
    boardSize: input.boardSize,
    format: input.format,
    timerSeconds: input.timerSeconds,
    board: createEmptyBoard(input.boardSize),
    turn: 'X',
    p1: {
      socketId: input.p1SocketId,
      userId: input.p1UserId,
      displayName: input.p1DisplayName,
      avatarId: input.p1AvatarId,
      connected: true,
    },
    p2: null,
    p1Score: 0,
    p2Score: 0,
    roundsToWin: roundsToWin(input.format),
    roundNumber: 1,
    winnerUserId: null,
    result: null,
    endReason: null,
    createdAt: now,
    expiresAt: now + expiresInMs,
    moveDeadline: null,
    isQuickMatch: input.isQuickMatch ?? false,
  };
}

// Quick-match queue (users waiting for random opponent, logged-in only)
const QUICK_QUEUE = 'quickmatch:queue';

export async function enqueueQuickMatch(userId: string, socketId: string): Promise<void> {
  await redis.zadd(QUICK_QUEUE, Date.now(), `${userId}:${socketId}`);
}

export async function dequeueQuickMatchPair(): Promise<
  | { a: { userId: string; socketId: string }; b: { userId: string; socketId: string } }
  | null
> {
  // Atomically pop oldest 2 entries
  const popped = await redis.zpopmin(QUICK_QUEUE, 2);
  if (popped.length < 4) {
    // Not enough — put back whatever we got
    if (popped.length === 2) await redis.zadd(QUICK_QUEUE, Number(popped[1]), popped[0]);
    return null;
  }
  const [aRaw, , bRaw] = popped;
  const [aUser, aSock] = (aRaw as string).split(':');
  const [bUser, bSock] = (bRaw as string).split(':');
  return {
    a: { userId: aUser, socketId: aSock },
    b: { userId: bUser, socketId: bSock },
  };
}

export async function removeFromQuickQueue(userId: string, socketId: string): Promise<void> {
  await redis.zrem(QUICK_QUEUE, `${userId}:${socketId}`);
}
