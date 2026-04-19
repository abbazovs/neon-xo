/**
 * NEON XO game engine — pure functions, fully tested.
 *
 * Rules:
 * - 3×3 board → 3 in a row to win
 * - 4×4 board → 4 in a row to win
 * - 5×5 board → 5 in a row to win
 * - A draw occurs when the board is full and no win exists.
 */

export type Cell = 'X' | 'O' | null;
export type Board = Cell[];
export type BoardSize = 3 | 4 | 5;
export type Player = 'X' | 'O';
export type MatchFormat = 'single' | 'bo3' | 'bo5';
export type TimerSeconds = 0 | 10 | 30;

export interface WinResult {
  winner: Player;
  line: number[]; // cell indices forming the win
}

export function createEmptyBoard(size: BoardSize): Board {
  return Array<Cell>(size * size).fill(null);
}

export function winLengthFor(size: BoardSize): number {
  return size; // classic rule: in-a-row equals board size
}

/**
 * Generate all winning lines for a given board size.
 * Memoized per size.
 */
const linesCache = new Map<BoardSize, number[][]>();

export function winningLines(size: BoardSize): number[][] {
  const cached = linesCache.get(size);
  if (cached) return cached;

  const lines: number[][] = [];
  const n = size;

  // Rows
  for (let r = 0; r < n; r++) {
    const row: number[] = [];
    for (let c = 0; c < n; c++) row.push(r * n + c);
    lines.push(row);
  }

  // Columns
  for (let c = 0; c < n; c++) {
    const col: number[] = [];
    for (let r = 0; r < n; r++) col.push(r * n + c);
    lines.push(col);
  }

  // Diagonal top-left → bottom-right
  const diag1: number[] = [];
  for (let i = 0; i < n; i++) diag1.push(i * n + i);
  lines.push(diag1);

  // Diagonal top-right → bottom-left
  const diag2: number[] = [];
  for (let i = 0; i < n; i++) diag2.push(i * n + (n - 1 - i));
  lines.push(diag2);

  linesCache.set(size, lines);
  return lines;
}

export function checkWin(board: Board, size: BoardSize): WinResult | null {
  const lines = winningLines(size);
  for (const line of lines) {
    const first = board[line[0]];
    if (!first) continue;
    if (line.every((idx) => board[idx] === first)) {
      return { winner: first, line };
    }
  }
  return null;
}

export function isBoardFull(board: Board): boolean {
  return board.every((c) => c !== null);
}

export type MoveResult =
  | { ok: true; board: Board; winner?: WinResult; draw?: boolean }
  | { ok: false; reason: 'out_of_bounds' | 'cell_occupied' | 'not_your_turn' };

export function applyMove(
  board: Board,
  index: number,
  player: Player,
  currentTurn: Player,
  size: BoardSize,
): MoveResult {
  if (player !== currentTurn) return { ok: false, reason: 'not_your_turn' };
  if (index < 0 || index >= size * size) return { ok: false, reason: 'out_of_bounds' };
  if (board[index] !== null) return { ok: false, reason: 'cell_occupied' };

  const next = board.slice();
  next[index] = player;

  const winner = checkWin(next, size);
  if (winner) return { ok: true, board: next, winner };
  if (isBoardFull(next)) return { ok: true, board: next, draw: true };
  return { ok: true, board: next };
}

export function otherPlayer(p: Player): Player {
  return p === 'X' ? 'O' : 'X';
}

export function roundsToWin(format: MatchFormat): number {
  switch (format) {
    case 'single':
      return 1;
    case 'bo3':
      return 2;
    case 'bo5':
      return 3;
  }
}
