import type { FC } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

export const Nav: FC = () => {
  const { t } = useTranslation();

  const items: NavItem[] = [
    { to: '/app', label: t('nav.play'), icon: '▶' },
    { to: '/app/friends', label: t('nav.friends'), icon: '◎' },
    { to: '/app/rank', label: t('nav.rank'), icon: '★' },
    { to: '/app/me', label: t('nav.me'), icon: '◆' },
  ];

  return (
    <>
      {/* Mobile bottom tabs */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg-soft/95 backdrop-blur-md border-t border-cyan-neon/20 pb-[env(safe-area-inset-bottom)]"
        aria-label="Main"
      >
        <ul className="flex justify-around items-stretch">
          {items.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.to === '/app'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-2.5 text-xs uppercase font-display tracking-wider transition
                   ${isActive ? 'text-cyan-neon neon-cyan' : 'text-ink-dim hover:text-ink'}`
                }
              >
                <span aria-hidden className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 w-56 bg-bg-soft/85 backdrop-blur-md border-r border-cyan-neon/20 flex-col p-6"
        aria-label="Main"
      >
        <NavLink to="/app" className="mb-10">
          <Logo size="md" />
        </NavLink>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/app'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-md font-display uppercase tracking-wider text-sm transition
                   ${
                     isActive
                       ? 'text-cyan-neon bg-cyan-neon/10 border border-cyan-neon/40 shadow-neon-soft'
                       : 'text-ink-dim hover:text-ink border border-transparent hover:bg-ink/5'
                   }`
                }
              >
                <span aria-hidden>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
};

/**
 * Wraps routed pages with appropriate padding for nav.
 */
export const AppLayout: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-[100dvh] md:pl-56 pb-20 md:pb-0">
    <Nav />
    <main className="max-w-4xl mx-auto p-4 md:p-8">{children}</main>
  </div>
);
