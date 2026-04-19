import type { LiveMatch } from '../game/state.js';
import type { PublicMatchState } from './events.js';

export function toPublicState(m: LiveMatch, winLine: number[] | null = null): PublicMatchState {
  return {
    code: m.code,
    status: m.status,
    boardSize: m.boardSize,
    format: m.format,
    timerSeconds: m.timerSeconds,
    board: m.board,
    turn: m.turn,
    p1: {
      userId: m.p1.userId,
      displayName: m.p1.displayName,
      avatarId: m.p1.avatarId,
      connected: m.p1.connected,
    },
    p2: m.p2
      ? {
          userId: m.p2.userId,
          displayName: m.p2.displayName,
          avatarId: m.p2.avatarId,
          connected: m.p2.connected,
        }
      : null,
    p1Score: m.p1Score,
    p2Score: m.p2Score,
    roundsToWin: m.roundsToWin,
    roundNumber: m.roundNumber,
    winnerSide: m.result === 'p1_win' ? 'p1' : m.result === 'p2_win' ? 'p2' : null,
    result: m.result,
    endReason: m.endReason,
    winLine,
    moveDeadline: m.moveDeadline,
  };
}

export function roomName(code: string): string {
  return `match:${code}`;
}
