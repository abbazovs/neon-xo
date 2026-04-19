import { describe, it, expect } from 'vitest';
import { applyMove, createEmptyBoard, otherPlayer, roundsToWin } from './engine.js';

describe('full match simulation', () => {
  it('plays a complete 3x3 game to X win', () => {
    let board = createEmptyBoard(3);
    let turn: 'X' | 'O' = 'X';
    const moves: Array<{ idx: number; by: 'X' | 'O' }> = [
      { idx: 0, by: 'X' },
      { idx: 3, by: 'O' },
      { idx: 1, by: 'X' },
      { idx: 4, by: 'O' },
      { idx: 2, by: 'X' }, // X wins top row
    ];
    for (const m of moves) {
      const r = applyMove(board, m.idx, m.by, turn, 3);
      expect(r.ok).toBe(true);
      if (r.ok) {
        board = r.board;
        if (r.winner) {
          expect(r.winner.winner).toBe('X');
          return;
        }
        turn = otherPlayer(turn);
      }
    }
  });

  it('roundsToWin maps formats correctly', () => {
    expect(roundsToWin('single')).toBe(1);
    expect(roundsToWin('bo3')).toBe(2);
    expect(roundsToWin('bo5')).toBe(3);
  });
});
