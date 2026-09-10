import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Mail, Upload, RefreshCw, Sparkles, FileText, Download } from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, cn } from '../lib/utils';
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

interface PreviewTrade {
  name: string;
  side: string;
  quantity: number;
  price: number;
  amount: number;
  trade_date?: string;
}

interface PreviewDoc {
  filename?: string | null;
  subject?: string;
  document_type: string;
  broker: string;
  trades_found: number;
  trades: PreviewTrade[];
  excerpt?: string;
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

type Tab = 'email' | 'upload';

export function MailImportPage() {
  const [tab, setTab] = useState<Tab>('email');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [form, setForm] = useState(emptyAccount);
  const [paste, setPaste] = useState({ subject: '', text: '' });
  const [previews, setPreviews] = useState<PreviewDoc[]>([]);
  const [dragOver, setDragOver] = useState(false);
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
      return 'Gmail: enable IMAP, create an App Password, then Sync to extract contract notes & CAS attachments.';
    }
    return 'Any IMAP inbox works. Sync scans recent mail for broker contract notes and MF statements.';
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

  async function testConnection() {
    setBusy('test');
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/mail-import/accounts/test', {
        ...form,
        imap_port: Number(form.imap_port),
        username: form.username || form.email_address,
      });
      setMessage(`Mailbox OK — ${data.messages} messages (${data.unseen} unread).`);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || 'Connection test failed.');
    } finally {
      setBusy('');
    }
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
        verify: false,
      });
      setForm(emptyAccount);
      setMessage('Mailbox saved. Click Sync to extract contract notes from email.');
      await load();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || 'Could not connect mailbox.');
    } finally {
      setBusy('');
    }
  }

  async function syncAccount(id: string, rescan = false) {
    setBusy(`sync-${id}`);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post(`/mail-import/accounts/${id}/sync`, {
        limit: 50,
        rescan,
        sinceDays: 90,
      });
      setMessage(data.message || `Imported ${data.tradesImported} trade(s) from ${data.scannedDocuments} document(s).`);
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

  async function processUploadFiles(files: FileList | File[] | null) {
    if (!files || (files as FileList).length === 0) return;
    const list = Array.from(files as FileList);
    setBusy('upload');
    setError('');
    setMessage('');
    setPreviews([]);
    try {
      const previewBody = new FormData();
      list.forEach((f) => previewBody.append('files', f));
      const previewRes = await api.post('/mail-import/preview', previewBody, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreviews(previewRes.data.previews || []);

      const body = new FormData();
      list.forEach((f) => body.append('files', f));
      const { data } = await api.post('/mail-import/upload', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage(
        `Extracted from upload — ${data.tradesImported} trade(s) imported across ${data.importedJobs} document(s).`
      );
      await load();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || 'Upload failed. Use PDF, TXT, HTML, CSV, or EML contract notes / CAS.');
    } finally {
      setBusy('');
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void processUploadFiles(e.dataTransfer.files);
  }

  async function onPaste(e: FormEvent) {
    e.preventDefault();
    setBusy('paste');
    setError('');
    setMessage('');
    try {
      const previewRes = await api.post('/mail-import/preview', paste);
      setPreviews(previewRes.data.previews || []);
      const { data } = await api.post('/mail-import/paste', paste);
      setMessage(
        data.job?.status === 'imported'
          ? `Imported ${data.job.trades_imported} trade(s) from pasted contract text.`
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

  async function downloadSample(kind: 'stocks' | 'mf') {
    const token = localStorage.getItem('erc_token');
    const res = await fetch(`/api/mail-import/sample-contract?kind=${kind}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = kind === 'mf' ? 'sample-mf-cas.txt' : 'sample-contract-note.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  const o = stats?.overview;

  return (
    <div>
      <PageHeader
        title="Contract import"
        subtitle="Extract trades from Gmail/any email, or manually upload broker contract notes and MF CAS."
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

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('email')}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
            tab === 'email'
              ? 'bg-[var(--color-brand)] text-white'
              : 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
          )}
        >
          <Mail size={16} />
          Extract from email
        </button>
        <button
          type="button"
          onClick={() => setTab('upload')}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
            tab === 'upload'
              ? 'bg-[var(--color-brand)] text-white'
              : 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
          )}
        >
          <Upload size={16} />
          Manual upload
        </button>
      </div>

      {tab === 'email' ? (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Mail size={18} className="text-[var(--color-brand)]" />
            <h2 className="font-display text-lg font-semibold">Connect Gmail or any mail</h2>
          </div>
          <p className="mb-4 text-sm text-[var(--color-ink-muted)]">{tip}</p>
          <form className="grid gap-3 lg:grid-cols-2" onSubmit={connectAccount}>
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
              <>
                <div>
                  <Label>IMAP host</Label>
                  <Input value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })} />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input value={form.imap_port} onChange={(e) => setForm({ ...form, imap_port: e.target.value })} />
                </div>
              </>
            ) : (
              <div className="flex items-end text-xs text-[var(--color-ink-muted)]">
                Host: {form.imap_host}:{form.imap_port}
              </div>
            )}
            <div className="flex flex-wrap gap-2 lg:col-span-2">
              <Button type="button" variant="secondary" onClick={testConnection} disabled={!!busy || !form.email_address || !form.password}>
                {busy === 'test' ? 'Testing…' : 'Test connection'}
              </Button>
              <Button type="submit" disabled={!!busy}>
                {busy === 'connect' ? 'Saving…' : 'Save mailbox'}
              </Button>
            </div>
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
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => syncAccount(a.id, false)} disabled={!!busy}>
                      <RefreshCw size={14} />
                      {busy === `sync-${a.id}` ? 'Extracting…' : 'Extract from inbox'}
                    </Button>
                    <Button variant="ghost" onClick={() => syncAccount(a.id, true)} disabled={!!busy}>
                      Rescan 90 days
                    </Button>
                    <Button variant="ghost" onClick={() => removeAccount(a.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No mailbox connected"
                body="Save Gmail (app password) or another IMAP account, then extract contract notes automatically."
              />
            )}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Upload size={18} className="text-[var(--color-brand)]" />
              <h2 className="font-display text-lg font-semibold">Upload contract documents</h2>
            </div>
            <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
              Manual upload of broker contract notes, CAMS/KFintech CAS, tradebooks, or forwarded .eml files.
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                'rounded-2xl border-2 border-dashed px-4 py-10 text-center transition',
                dragOver
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                  : 'border-[var(--color-border)]'
              )}
            >
              <FileText className="mx-auto mb-2 text-[var(--color-brand)]" />
              <p className="text-sm font-medium">Drop contract PDF / HTML / EML / TXT here</p>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">or choose files</p>
              <Input
                className="mt-4"
                type="file"
                multiple
                accept=".pdf,.txt,.csv,.html,.htm,.eml,text/plain,application/pdf,message/rfc822"
                onChange={(e) => processUploadFiles(e.target.files)}
                disabled={!!busy}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={() => downloadSample('stocks')} disabled={!!busy}>
                <Download size={14} />
                Sample contract note
              </Button>
              <Button type="button" variant="ghost" onClick={() => downloadSample('mf')} disabled={!!busy}>
                <Download size={14} />
                Sample MF CAS
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-display text-lg font-semibold">Paste contract / email text</h2>
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
                  rows={10}
                  required
                  value={paste.text}
                  onChange={(e) => setPaste({ ...paste, text: e.target.value })}
                  placeholder="Paste contract note or CAS text here…"
                />
              </div>
              <Button type="submit" disabled={!!busy}>
                {busy === 'paste' ? 'Extracting…' : 'Extract & import'}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {previews.length ? (
        <Card className="mt-6">
          <h2 className="mb-3 font-display text-lg font-semibold">Extraction preview</h2>
          <div className="space-y-4">
            {previews.map((p, idx) => (
              <div key={`${p.filename || p.subject}-${idx}`} className="border-b border-[var(--color-border)] pb-3 last:border-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="font-medium">{p.filename || p.subject || 'Document'}</p>
                  <Badge>{p.document_type}</Badge>
                  <Badge tone="neutral">{p.broker}</Badge>
                  <Badge tone={p.trades_found ? 'success' : 'warn'}>{p.trades_found} trades</Badge>
                </div>
                {p.trades?.slice(0, 6).map((t, i) => (
                  <div key={i} className="flex justify-between text-sm text-[var(--color-ink-muted)]">
                    <span>
                      {t.side?.toUpperCase()} {t.name} × {t.quantity}
                    </span>
                    <span>{formatINR(t.amount)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

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
              <EmptyState title="No trades yet" body="Extract from email or upload a contract to populate holdings." />
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
              <EmptyState title="Import log empty" body="Email extractions and manual uploads appear here." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
