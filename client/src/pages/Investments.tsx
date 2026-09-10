import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '../lib/api';
import { INVESTMENT_TYPES } from '../lib/constants';
import { formatINR, pct, uid } from '../lib/utils';
import { getDB } from '../lib/localDb';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, TextArea } from '../components/ui';

interface Investment {
  id: string;
  name: string;
  type: string;
  invested_amount: number | string;
  current_value: number | string;
  purchase_date?: string;
  notes?: string;
  client_id?: string;
  units?: number | string;
  symbol?: string;
  broker?: string;
  source?: string;
}

const COLORS = ['#0f5c4c', '#c46b2b', '#2f6fed', '#8b5e3c', '#5b7c6a', '#b42318'];

const empty = {
  name: '',
  type: 'Mutual Funds',
  invested_amount: '',
  current_value: '',
  purchase_date: '',
  notes: '',
};

export function InvestmentsPage() {
  const [items, setItems] = useState<Investment[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState(empty);

  async function load() {
    try {
      const { data } = await api.get('/investments');
      setItems(data.investments);
      const db = await getDB();
      for (const inv of data.investments) {
        await db.put('investments', {
          ...inv,
          client_id: inv.client_id || inv.id,
          invested_amount: Number(inv.invested_amount),
          current_value: Number(inv.current_value),
          updated_at: inv.updated_at || new Date().toISOString(),
        });
      }
    } catch {
      const db = await getDB();
      setItems((await db.getAll('investments')).filter((i) => !i.deleted_at));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totals = useMemo(() => {
    const invested = items.reduce((s, i) => s + Number(i.invested_amount), 0);
    const current = items.reduce((s, i) => s + Number(i.current_value), 0);
    return { invested, current, gain: current - invested, pct: invested ? ((current - invested) / invested) * 100 : 0 };
  }, [items]);

  const allocation = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) map.set(i.type, (map.get(i.type) || 0) + Number(i.current_value));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [items]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      type: form.type,
      invested_amount: Number(form.invested_amount),
      current_value: Number(form.current_value || form.invested_amount),
      purchase_date: form.purchase_date || undefined,
      notes: form.notes,
      client_id: editing?.client_id || uid(),
    };
    try {
      if (editing) await api.put(`/investments/${editing.id}`, payload);
      else await api.post('/investments', payload);
    } catch {
      const db = await getDB();
      const id = editing?.id || uid();
      await db.put('investments', {
        id,
        ...payload,
        client_id: payload.client_id,
        updated_at: new Date().toISOString(),
        dirty: true,
      });
    }
    setOpen(false);
    setEditing(null);
    setForm(empty);
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this investment?')) return;
    try {
      await api.delete(`/investments/${id}`);
    } catch {
      const db = await getDB();
      const existing = await db.get('investments', id);
      if (existing) {
        await db.put('investments', {
          ...existing,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          dirty: true,
        });
      }
    }
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Investments"
        subtitle="Track portfolio value, returns, and allocation — including holdings imported from mail."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/mail-import"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand)]"
            >
              Import from mail
            </Link>
            <Button
              onClick={() => {
                setEditing(null);
                setForm(empty);
                setOpen(true);
              }}
            >
              Add investment
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Invested</p>
          <p className="mt-1 font-display text-2xl">{formatINR(totals.invested)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Current value</p>
          <p className="mt-1 font-display text-2xl">{formatINR(totals.current)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Gain / Loss</p>
          <p className={`mt-1 font-display text-2xl ${totals.gain >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
            {formatINR(totals.gain)} ({pct(totals.pct)})
          </p>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="mb-3 font-display text-lg">Allocation</h2>
          {allocation.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    {allocation.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No allocation" body="Add investments to see allocation." />
          )}
        </Card>

        <div className="space-y-3 lg:col-span-2">
          {items.length ? (
            items.map((inv) => {
              const gain = Number(inv.current_value) - Number(inv.invested_amount);
              const ret = Number(inv.invested_amount)
                ? (gain / Number(inv.invested_amount)) * 100
                : 0;
              return (
                <Card key={inv.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{inv.name}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge>{inv.type}</Badge>
                      {inv.source === 'email' ? <Badge tone="warn">From mail</Badge> : null}
                      {inv.broker ? <Badge tone="neutral">{inv.broker}</Badge> : null}
                      {Number(inv.units) > 0 ? <Badge tone="neutral">{Number(inv.units).toFixed(3)} units</Badge> : null}
                      <Badge tone={gain >= 0 ? 'success' : 'danger'}>
                        {formatINR(gain)} · {pct(ret)}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm sm:text-right">
                    <p>Invested {formatINR(inv.invested_amount)}</p>
                    <p className="font-semibold">Now {formatINR(inv.current_value)}</p>
                    <div className="mt-2">
                      <button
                        className="mr-3 text-[var(--color-brand)]"
                        onClick={() => {
                          setEditing(inv);
                          setForm({
                            name: inv.name,
                            type: inv.type,
                            invested_amount: String(inv.invested_amount),
                            current_value: String(inv.current_value),
                            purchase_date: inv.purchase_date?.slice(0, 10) || '',
                            notes: inv.notes || '',
                          });
                          setOpen(true);
                        }}
                      >
                        Update
                      </button>
                      <button className="text-[var(--color-danger)]" onClick={() => remove(inv.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })
          ) : (
            <EmptyState title="No investments" body="Add stocks, MFs, FDs, gold, and more." />
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Update investment' : 'Add investment'}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {INVESTMENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Invested amount</Label>
            <Input type="number" required min="0" value={form.invested_amount} onChange={(e) => setForm({ ...form, invested_amount: e.target.value })} />
          </div>
          <div>
            <Label>Current value</Label>
            <Input type="number" min="0" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} />
          </div>
          <div>
            <Label>Purchase date</Label>
            <Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
          </div>
          <div>
            <Label>Notes</Label>
            <TextArea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button className="w-full">Save</Button>
        </form>
      </Modal>
    </div>
  );
}
