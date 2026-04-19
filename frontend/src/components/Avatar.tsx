import type { FC } from 'react';

/**
 * 12 preset neon avatars: abstract geometric shapes rendered as SVG.
 * Each has a distinct shape + color pairing.
 */

const palettes = [
  ['#00f0ff', '#005f66'],
  ['#ff2bd1', '#600049'],
  ['#7dff6b', '#1d5e15'],
  ['#ffcc00', '#66500e'],
  ['#b36bff', '#3d1a6e'],
  ['#ff6b6b', '#5e1919'],
  ['#00ffa3', '#0f5c3f'],
  ['#ff8a3d', '#5e3212'],
  ['#6bffff', '#0f5e5e'],
  ['#ff6bff', '#5e0f5e'],
  ['#cfff00', '#4d5e00'],
  ['#3d7bff', '#152b5e'],
] as const;

interface Props {
  id: number;
  size?: number;
  className?: string;
}

export const Avatar: FC<Props> = ({ id, size = 48, className }) => {
  const idx = ((id % palettes.length) + palettes.length) % palettes.length;
  const [fg, bg] = palettes[idx];

  // Different shape per id
  const shape = idx % 6;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label={`Avatar ${id}`}
    >
      <rect width="48" height="48" rx="10" fill={bg} opacity="0.85" />
      <g stroke={fg} strokeWidth="2.5" fill="none" style={{ filter: `drop-shadow(0 0 3px ${fg})` }}>
        {shape === 0 && <circle cx="24" cy="24" r="11" />}
        {shape === 1 && <rect x="13" y="13" width="22" height="22" />}
        {shape === 2 && <polygon points="24,10 38,36 10,36" />}
        {shape === 3 && (
          <>
            <line x1="12" y1="12" x2="36" y2="36" />
            <line x1="36" y1="12" x2="12" y2="36" />
          </>
        )}
        {shape === 4 && (
          <>
            <circle cx="24" cy="24" r="6" />
            <circle cx="24" cy="24" r="13" />
          </>
        )}
        {shape === 5 && (
          <polygon points="24,10 34,18 34,30 24,38 14,30 14,18" />
        )}
      </g>
    </svg>
  );
};
