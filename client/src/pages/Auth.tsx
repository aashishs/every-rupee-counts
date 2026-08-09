import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Button, Input, Label } from '../components/ui';

export function LoginPage() {
  const { login, token } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to keep every rupee accounted for — online or offline."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label>Email</Label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        <Button className="w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--color-ink-muted)]">
        New here? <Link className="font-semibold text-[var(--color-brand)]" to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register, token } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await register(name, email, password);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Start counting"
      subtitle="Create your secure vault for expenses, investments, and budgets."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>Password (min 8 chars)</Label>
          <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        <Button className="w-full" disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--color-ink-muted)]">
        Already have an account? <Link className="font-semibold text-[var(--color-brand)]" to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            'linear-gradient(120deg, rgba(15,92,76,0.88), rgba(20,32,28,0.72)), url(https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1800&q=80)',
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-10 md:flex-row md:items-center md:gap-16 md:px-8">
        <div className="mb-10 max-w-xl text-white animate-rise md:mb-0">
          <p className="font-display text-4xl font-semibold tracking-tight md:text-6xl">Every Rupee Counts</p>
          <p className="mt-4 max-w-md text-base text-white/85 md:text-lg">
            A calm, offline-first finance companion for Indian households — track spend, grow investments, and plan the month ahead.
          </p>
        </div>
        <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl animate-rise md:p-8">
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-[var(--color-ink-muted)]">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
