import type { FC } from 'react';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Logo: FC<Props> = ({ size = 'md', className = '' }) => {
  const sizeClass = size === 'lg' ? 'text-5xl md:text-6xl' : size === 'md' ? 'text-2xl md:text-3xl' : 'text-lg';
  return (
    <div
      className={`font-display font-black uppercase tracking-[0.15em] ${sizeClass} ${className}`}
      aria-label="NEON XO"
    >
      <span className="neon-cyan animate-flicker">NEON</span>
      <span className="neon-magenta ml-2 animate-flicker">XO</span>
    </div>
  );
};
