import { describe, it, expect } from 'vitest';
import {
  createEmptyBoard,
  checkWin,
  isBoardFull,
  applyMove,
  otherPlayer,
  winningLines,
  roundsToWin,
} from './engine.js';

describe('createEmptyBoard', () => {
  it('creates a 3x3 board', () => {
    expect(createEmptyBoard(3)).toEqual(Array(9).fill(null));
  });
  it('creates a 4x4 board', () => {
    expect(createEmptyBoard(4)).toHaveLength(16);
  });
  it('creates a 5x5 board', () => {
    expect(createEmptyBoard(5)).toHaveLength(25);
  });
});

describe('winningLines', () => {
  it('3x3 has 8 winning lines', () => {
    expect(winningLines(3)).toHaveLength(8);
  });
  it('4x4 has 10 winning lines', () => {
    expect(winningLines(4)).toHaveLength(10);
  });
  it('5x5 has 12 winning lines', () => {
    expect(winningLines(5)).toHaveLength(12);
  });
});

describe('checkWin 3x3', () => {
  it('detects top row win', () => {
    const b = ['X', 'X', 'X', null, 'O', null, null, 'O', null];
    expect(checkWin(b, 3)).toEqual({ winner: 'X', line: [0, 1, 2] });
  });
  it('detects column win', () => {
    const b = ['O', 'X', null, 'O', 'X', null, null, 'X', null];
    expect(checkWin(b, 3)).toEqual({ winner: 'X', line: [1, 4, 7] });
  });
  it('detects main diagonal win', () => {
    const b = ['O', 'X', null, 'X', 'O', null, null, 'X', 'O'];
    expect(checkWin(b, 3)).toEqual({ winner: 'O', line: [0, 4, 8] });
  });
  it('detects anti-diagonal win', () => {
    const b = [null, 'X', 'O', 'X', 'O', null, 'O', 'X', null];
    expect(checkWin(b, 3)).toEqual({ winner: 'O', line: [2, 4, 6] });
  });
  it('returns null for no win', () => {
    const b = ['X', 'O', 'X', 'O', 'X', 'O', 'O', 'X', 'O'];
    expect(checkWin(b, 3)).toBeNull();
  });
});

describe('checkWin 4x4', () => {
  it('needs 4 in a row — 3 is not enough', () => {
    // X X X . / . . . . / . . . . / . . . .
    const b = ['X', 'X', 'X', null, ...Array(12).fill(null)];
    expect(checkWin(b, 4)).toBeNull();
  });
  it('detects full row of 4', () => {
    const b = ['X', 'X', 'X', 'X', ...Array(12).fill(null)];
    expect(checkWin(b, 4)).toEqual({ winner: 'X', line: [0, 1, 2, 3] });
  });
});

describe('checkWin 5x5', () => {
  it('detects diagonal win of 5', () => {
    const b = Array(25).fill(null);
    [0, 6, 12, 18, 24].forEach((i) => (b[i] = 'O'));
    expect(checkWin(b, 5)).toEqual({ winner: 'O', line: [0, 6, 12, 18, 24] });
  });
});

describe('isBoardFull', () => {
  it('false when empty', () => {
    expect(isBoardFull(Array(9).fill(null))).toBe(false);
  });
  it('true when filled', () => {
    expect(isBoardFull(Array(9).fill('X'))).toBe(true);
  });
});

describe('applyMove', () => {
  it('places a piece', () => {
    const b = createEmptyBoard(3);
    const r = applyMove(b, 4, 'X', 'X', 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.board[4]).toBe('X');
  });
  it('rejects occupied cells', () => {
    const b = createEmptyBoard(3);
    b[4] = 'O';
    const r = applyMove(b, 4, 'X', 'X', 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('cell_occupied');
  });
  it('rejects wrong turn', () => {
    const b = createEmptyBoard(3);
    const r = applyMove(b, 0, 'X', 'O', 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_your_turn');
  });
  it('rejects out-of-bounds', () => {
    const b = createEmptyBoard(3);
    const r = applyMove(b, 99, 'X', 'X', 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('out_of_bounds');
  });
  it('detects draw', () => {
    const b: (string | null)[] = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', null];
    const r = applyMove(b as never, 8, 'X', 'X', 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.draw).toBe(true);
  });
  it('detects winning move', () => {
    const b: (string | null)[] = ['X', 'X', null, null, 'O', null, null, 'O', null];
    const r = applyMove(b as never, 2, 'X', 'X', 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.winner?.winner).toBe('X');
  });
});

describe('otherPlayer', () => {
  it('X → O, O → X', () => {
    expect(otherPlayer('X')).toBe('O');
    expect(otherPlayer('O')).toBe('X');
  });
});

describe('roundsToWin', () => {
  it('single = 1, bo3 = 2, bo5 = 3', () => {
    expect(roundsToWin('single')).toBe(1);
    expect(roundsToWin('bo3')).toBe(2);
    expect(roundsToWin('bo5')).toBe(3);
  });
});
