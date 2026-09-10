import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  Landmark,
  Wallet,
  PieChart,
  RefreshCw,
  Bell,
  Settings,
  Menu,
  X,
  CloudOff,
  Cloud,
  Mail,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../store/auth';
import { cn } from '../lib/utils';
import { Button } from './ui';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/investments', label: 'Portfolio', icon: TrendingUp },
  { to: '/mail-import', label: 'Contracts', icon: Mail },
  { to: '/assets', label: 'Assets', icon: Landmark },
  { to: '/cashflow', label: 'Cash Flow', icon: Wallet },
  { to: '/budgets', label: 'Budgets', icon: PieChart },
  { to: '/recurring', label: 'Recurring', icon: RefreshCw },
  { to: '/reports', label: 'Reports', icon: PieChart },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  const { user, online, lastSync, syncNow, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
    }
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
              isActive
                ? 'bg-[var(--color-brand)] text-white'
                : 'text-[var(--color-ink-muted)] hover:bg-black/5 hover:text-[var(--color-ink)] dark:hover:bg-white/5'
            )
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-paper-elevated)]/70 backdrop-blur md:flex">
        <div className="border-b border-[var(--color-border)] px-5 py-5">
          <p className="font-display text-xl font-semibold text-[var(--color-brand)]">Every Rupee Counts</p>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">Personal finance, offline-first</p>
        </div>
        {nav}
        <div className="mt-auto border-t border-[var(--color-border)] p-4 text-sm">
          <p className="font-medium">{user?.name}</p>
          <p className="text-xs text-[var(--color-ink-muted)]">{user?.email}</p>
          <Button variant="ghost" className="mt-2 w-full justify-start px-0" onClick={logout}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-paper)]/80 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
            <div className="md:hidden">
              <p className="font-display text-lg font-semibold text-[var(--color-brand)]">Every Rupee Counts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                online ? 'bg-emerald-500/15 text-[var(--color-success)]' : 'bg-amber-500/15 text-amber-700'
              )}
            >
              {online ? <Cloud size={14} /> : <CloudOff size={14} />}
              {online ? 'Online' : 'Offline'}
            </span>
            <Button variant="secondary" onClick={handleSync} disabled={!online || syncing}>
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              Sync
            </Button>
          </div>
        </header>

        {lastSync ? (
          <p className="px-4 pt-2 text-xs text-[var(--color-ink-muted)] md:px-6">
            Last sync: {new Date(lastSync).toLocaleString('en-IN')}
          </p>
        ) : null}

        <main className="flex-1 px-4 py-5 md:px-6 md:py-6">
          <Outlet />
        </main>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[var(--color-paper-elevated)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-4">
              <p className="font-display text-lg font-semibold text-[var(--color-brand)]">Every Rupee Counts</p>
              <button onClick={() => setOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}
    </div>
  );
}
