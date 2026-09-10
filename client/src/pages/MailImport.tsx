import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Mail, Upload, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { formatINR } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Input, Label, PageHeader, Select, TextArea } from '../components/ui';

interface Provider {
  id: string;
  label: string;
  host: string;
  port: number;
}

interface EmailAccount {
  id: string;
  label: string;
  provider: string;
  email_address: string;
  imap_host: string;
  last_synced_at?: string;
  is_active: boolean;
}

interface ImportJob {
  id: string;
  source: string;
  status: string;
  subject?: string;
  from_address?: string;
  document_type?: string;
  broker?: string;
  trades_found?: number;
  trades_imported?: number;
  error_message?: string;
  created_at: string;
}

interface InvestmentTx {
  id: string;
  trade_date: string;
  side: string;
  asset_type: string;
  name: string;
  symbol?: string;
  amount: number | string;
  quantity?: number | string;
  broker?: string;
}

interface Stats {
  overview: {
    tradeCount: number;
    buyAmount: number;
    sellAmount: number;
    holdingsTouched: number;
    importedJobs: number;
    tradesImported: number;
  };
  byAsset: { asset_type: string; trades: number; amount: string }[];
  byBroker: { broker: string; trades: number; amount: string }[];
  recentTransactions: InvestmentTx[];
}

const emptyAccount = {
  provider: 'gmail',
  label: 'Gmail',
  email_address: '',
  username: '',
  password: '',
  imap_host: 'imap.gmail.com',
  imap_port: '993',
};

export function MailImportPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [form, setForm] = useState(emptyAccount);
  const [paste, setPaste] = useState({ subject: '', text: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const [p, a, j, s] = await Promise.all([
      api.get('/mail-import/providers'),
      api.get('/mail-import/accounts'),
      api.get('/mail-import/jobs'),
      api.get('/mail-import/stats'),
    ]);
    setProviders(p.data.providers);
    setAccounts(a.data.accounts.filter((x: EmailAccount) => x.is_active !== false));
    setJobs(j.data.jobs);
    setStats(s.data);
  }

  useEffect(() => {
    load().catch(() => setError('Could not load mail import data.'));
  }, []);

  const tip = useMemo(() => {
    if (form.provider === 'gmail') {
      return 'Use a Gmail App Password (Google Account → Security → App passwords). IMAP must be enabled.';
    }
    return 'Works with any IMAP inbox: Outlook, Yahoo, Zoho, or your broker-forwarded mailbox.';
  }, [form.provider]);

  function onProviderChange(id: string) {
    const p = providers.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      provider: id,
      label: p?.label || id,
      imap_host: p?.host || '',
      imap_port: String(p?.port || 993),
    }));
  }

  async function connectAccount(e: FormEvent) {
    e.preventDefault();
    setBusy('connect');
    setError('');
    setMessage('');
    try {
      await api.post('/mail-import/accounts', {
        ...form,
        imap_port: Number(form.imap_port),
        username: form.username || form.email_address,
      });
      setForm(emptyAccount);
      setMessage('Mailbox connected. Run Sync to pull contract notes and MF statements.');
      await load();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || 'Could not connect mailbox.');
    } finally {
      setBusy('');
    }
  }

  async function syncAccount(id: string) {
    setBusy(`sync-${id}`);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post(`/mail-import/accounts/${id}/sync`, { limit: 40 });
      setMessage(
        `Scan complete: ${data.scannedDocuments} investment mail(s), ${data.tradesImported} trade(s) imported.`
      );
      await load();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || 'Mailbox sync failed. Check IMAP credentials / app password.');
    } finally {
      setBusy('');
    }
  }

  async function removeAccount(id: string) {
    await api.delete(`/mail-import/accounts/${id}`);
    await load();
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setBusy('upload');
    setError('');
    setMessage('');
    try {
      const body = new FormData();
      Array.from(files).forEach((f) => body.append('files', f));
      const { data } = await api.post('/mail-import/upload', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage(`Uploaded files processed — ${data.tradesImported} trade(s) imported.`);
      await load();
    } catch {
      setError('Upload failed. Try PDF, TXT, CSV, HTML, or EML contract notes / CAS files.');
    } finally {
      setBusy('');
    }
  }

  async function onPaste(e: FormEvent) {
    e.preventDefault();
    setBusy('paste');
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/mail-import/paste', paste);
      setMessage(
        data.job?.status === 'imported'
          ? `Imported ${data.job.trades_imported} trade(s) from pasted text.`
          : data.job?.error_message || `Status: ${data.job?.status}`
      );
      setPaste({ subject: '', text: '' });
      await load();
    } catch {
      setError('Could not parse pasted text.');
    } finally {
      setBusy('');
    }
  }

  async function runDemo() {
    setBusy('demo');
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/mail-import/demo', { kind: 'both' });
      setMessage(`Demo import loaded ${data.tradesImported} sample stock & mutual fund trades.`);
      await load();
    } catch {
      setError('Demo import failed.');
    } finally {
      setBusy('');
    }
  }

  const o = stats?.overview;

  return (
    <div>
      <PageHeader
        title="Mail import"
        subtitle="Connect Gmail or any IMAP inbox, or upload broker contract notes and MF CAS — like MyProfit auto-import."
        actions={
          <Button variant="secondary" onClick={runDemo} disabled={!!busy}>
            <Sparkles size={16} />
            {busy === 'demo' ? 'Importing…' : 'Load demo trades'}
          </Button>
        }
      />

      {message ? <p className="mb-4 text-sm text-[var(--color-brand)]">{message}</p> : null}
      {error ? <p className="mb-4 text-sm text-[var(--color-danger)]">{error}</p> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Imported trades</p>
          <p className="mt-1 font-display text-2xl font-semibold">{o?.tradesImported ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Buy / SIP amount</p>
          <p className="mt-1 font-display text-2xl font-semibold">{formatINR(o?.buyAmount || 0)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Sell amount</p>
          <p className="mt-1 font-display text-2xl font-semibold">{formatINR(o?.sellAmount || 0)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Holdings updated</p>
          <p className="mt-1 font-display text-2xl font-semibold">{o?.holdingsTouched ?? 0}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Mail size={18} className="text-[var(--color-brand)]" />
            <h2 className="font-display text-lg font-semibold">Connect mailbox</h2>
          </div>
          <p className="mb-4 text-sm text-[var(--color-ink-muted)]">{tip}</p>
          <form className="space-y-3" onSubmit={connectAccount}>
            <div>
              <Label>Provider</Label>
              <Select value={form.provider} onChange={(e) => onProviderChange(e.target.value)}>
                {(providers.length ? providers : [{ id: 'gmail', label: 'Gmail' }]).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                required
                value={form.email_address}
                onChange={(e) => setForm({ ...form, email_address: e.target.value })}
                placeholder="you@gmail.com"
              />
            </div>
            <div>
              <Label>App password / IMAP password</Label>
              <Input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="App password"
              />
            </div>
            {form.provider === 'custom' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>IMAP host</Label>
                  <Input value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })} />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input value={form.imap_port} onChange={(e) => setForm({ ...form, imap_port: e.target.value })} />
                </div>
              </div>
            ) : null}
            <Button type="submit" disabled={!!busy}>
              {busy === 'connect' ? 'Connecting…' : 'Connect inbox'}
            </Button>
          </form>

          <div className="mt-6 space-y-3">
            {accounts.length ? (
              accounts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3">
                  <div>
                    <p className="font-medium">{a.label}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      {a.email_address} · {a.imap_host}
                      {a.last_synced_at ? ` · synced ${format(new Date(a.last_synced_at), 'dd MMM HH:mm')}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => syncAccount(a.id)} disabled={!!busy}>
                      <RefreshCw size={14} />
                      {busy === `sync-${a.id}` ? 'Syncing…' : 'Sync'}
                    </Button>
                    <Button variant="ghost" onClick={() => removeAccount(a.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No mailbox yet" body="Connect Gmail (app password) or another IMAP account to auto-pull contract notes." />
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Upload size={18} className="text-[var(--color-brand)]" />
              <h2 className="font-display text-lg font-semibold">Upload documents</h2>
            </div>
            <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
              Drop broker contract notes (PDF/HTML), CAMS/KFintech CAS, tradebooks, or .eml files.
            </p>
            <Input
              type="file"
              multiple
              accept=".pdf,.txt,.csv,.html,.htm,.eml,text/plain,application/pdf"
              onChange={(e) => onUpload(e.target.files)}
              disabled={!!busy}
            />
          </Card>

          <Card>
            <h2 className="mb-3 font-display text-lg font-semibold">Paste email / statement text</h2>
            <form className="space-y-3" onSubmit={onPaste}>
              <div>
                <Label>Subject (optional)</Label>
                <Input
                  value={paste.subject}
                  onChange={(e) => setPaste({ ...paste, subject: e.target.value })}
                  placeholder="Digitally Signed Contract Note"
                />
              </div>
              <div>
                <Label>Body / extracted text</Label>
                <TextArea
                  rows={8}
                  required
                  value={paste.text}
                  onChange={(e) => setPaste({ ...paste, text: e.target.value })}
                  placeholder="Paste contract note or CAS text here…"
                />
              </div>
              <Button type="submit" disabled={!!busy}>
                {busy === 'paste' ? 'Parsing…' : 'Extract & import'}
              </Button>
            </form>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Recent imported trades</h2>
            <Link to="/investments" className="text-sm font-medium text-[var(--color-brand)]">
              View portfolio
            </Link>
          </div>
          <div className="space-y-3">
            {stats?.recentTransactions?.length ? (
              stats.recentTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3 last:border-0">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      {t.side.toUpperCase()} · {t.asset_type.replace('_', ' ')} · {format(new Date(t.trade_date), 'dd MMM yyyy')}
                      {t.broker ? ` · ${t.broker}` : ''}
                    </p>
                  </div>
                  <p className="font-semibold">{formatINR(t.amount)}</p>
                </div>
              ))
            ) : (
              <EmptyState title="No trades yet" body="Sync mail or load the demo to populate holdings." />
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-display text-lg font-semibold">Import log</h2>
          <div className="space-y-3">
            {jobs.length ? (
              jobs.slice(0, 12).map((j) => (
                <div key={j.id} className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3 last:border-0">
                  <div>
                    <p className="font-medium">{j.subject || j.document_type || j.source}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      {j.source} · {format(new Date(j.created_at), 'dd MMM HH:mm')}
                      {j.broker ? ` · ${j.broker}` : ''}
                      {j.trades_imported != null ? ` · ${j.trades_imported} trades` : ''}
                    </p>
                    {j.error_message ? <p className="mt-1 text-xs text-[var(--color-danger)]">{j.error_message}</p> : null}
                  </div>
                  <Badge
                    tone={
                      j.status === 'imported' ? 'success' : j.status === 'failed' || j.status === 'no_trades' ? 'warn' : 'neutral'
                    }
                  >
                    {j.status}
                  </Badge>
                </div>
              ))
            ) : (
              <EmptyState title="Import log empty" body="Successful and skipped mail imports show up here." />
            )}
          </div>
        </Card>
      </div>

      {stats?.byBroker?.length || stats?.byAsset?.length ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-display text-lg font-semibold">By broker / source</h2>
            <div className="space-y-2">
              {stats.byBroker.map((b) => (
                <div key={b.broker} className="flex justify-between text-sm">
                  <span className="capitalize">{b.broker}</span>
                  <span>
                    {b.trades} trades · {formatINR(b.amount)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 font-display text-lg font-semibold">By asset type</h2>
            <div className="space-y-2">
              {stats.byAsset.map((b) => (
                <div key={b.asset_type} className="flex justify-between text-sm">
                  <span className="capitalize">{b.asset_type.replace('_', ' ')}</span>
                  <span>
                    {b.trades} trades · {formatINR(b.amount)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
