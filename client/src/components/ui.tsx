import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/utils';

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-[var(--color-brand)] text-white hover:brightness-110',
    secondary: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)] hover:brightness-95',
    ghost: 'bg-transparent hover:bg-black/5 dark:hover:bg-white/5',
    danger: 'bg-[var(--color-danger)] text-white hover:brightness-110',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50',
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-paper-elevated)] px-3.5 py-2.5 text-sm outline-none ring-[var(--color-brand)] focus:ring-2',
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-paper-elevated)] px-3.5 py-2.5 text-sm outline-none ring-[var(--color-brand)] focus:ring-2',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-paper-elevated)] px-3.5 py-2.5 text-sm outline-none ring-[var(--color-brand)] focus:ring-2',
        className
      )}
      {...props}
    />
  );
}

export function Label({ children }: PropsWithChildren) {
  return <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">{children}</label>;
}

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn('glass-panel rounded-2xl p-5 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-[var(--color-success)]'
      : tone === 'negative'
        ? 'text-[var(--color-danger)]'
        : 'text-[var(--color-ink)]';
  return (
    <Card className="animate-rise">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</p>
      <p className={cn('mt-2 font-display text-2xl font-semibold tracking-tight', toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{hint}</p> : null}
    </Card>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 animate-fade">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-12 text-center">
      <p className="font-display text-xl">{title}</p>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{body}</p>
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warn' | 'danger' }>) {
  const tones = {
    neutral: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]',
    success: 'bg-emerald-500/15 text-[var(--color-success)]',
    warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    danger: 'bg-red-500/15 text-[var(--color-danger)]',
  };
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: PropsWithChildren<{ open: boolean; onClose: () => void; title: string }>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        className="glass-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-xl animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
