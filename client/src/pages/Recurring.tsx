import { useEffect, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { EXPENSE_CATEGORIES, FREQUENCIES, INCOME_CATEGORIES } from '../lib/constants';
import { formatINR, uid } from '../lib/utils';
import { getDB } from '../lib/localDb';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select } from '../components/ui';

interface Recurring {
  id: string;
  type: 'expense' | 'income';
  amount: number | string;
  category: string;
  description?: string;
  frequency: string;
  start_date: string;
  next_due_date: string;
  is_paused?: boolean;
  auto_enter?: boolean;
  reminder_enabled?: boolean;
  client_id?: string;
}

const empty = {
  type: 'expense' as 'expense' | 'income',
  amount: '',
  category: 'Rent',
  description: '',
  frequency: 'monthly',
  start_date: new Date().toISOString().slice(0, 10),
  auto_enter: false,
  reminder_enabled: true,
};

export function RecurringPage() {
  const [items, setItems] = useState<Recurring[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  async function load() {
    try {
      const { data } = await api.get('/recurring');
      setItems(data.recurring);
      const db = await getDB();
      for (const r of data.recurring) {
        await db.put('recurring', {
          ...r,
          amount: Number(r.amount),
          client_id: r.client_id || r.id,
          updated_at: r.updated_at || new Date().toISOString(),
        });
      }
    } catch {
      const db = await getDB();
      setItems((await db.getAll('recurring')).filter((r) => !r.deleted_at));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      amount: Number(form.amount),
      client_id: uid(),
    };
    try {
      await api.post('/recurring', payload);
    } catch {
      const db = await getDB();
      await db.put('recurring', {
        id: uid(),
        ...payload,
        next_due_date: form.start_date,
        updated_at: new Date().toISOString(),
        dirty: true,
      });
    }
    setOpen(false);
    setForm(empty);
    await load();
  }

  async function skip(id: string) {
    await api.post(`/recurring/${id}/skip`);
    await load();
  }

  async function enter(id: string) {
    await api.post(`/recurring/${id}/enter`);
    await load();
  }

  async function togglePause(item: Recurring) {
    await api.put(`/recurring/${item.id}`, { is_paused: !item.is_paused });
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this recurring item?')) return;
    await api.delete(`/recurring/${id}`);
    await load();
  }

  const categories = form.type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return (
    <div>
      <PageHeader
        title="Recurring"
        subtitle="Bills, EMIs, subscriptions, and recurring income with reminders."
        actions={<Button onClick={() => setOpen(true)}>Add recurring</Button>}
      />

      <div className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <Card key={item.id} className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.description || item.category}</p>
                  <Badge>{item.frequency}</Badge>
                  <Badge tone={item.type === 'income' ? 'success' : 'neutral'}>{item.type}</Badge>
                  {item.is_paused ? <Badge tone="warn">Paused</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  Next due {format(new Date(item.next_due_date), 'dd MMM yyyy')} · {formatINR(item.amount)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => enter(item.id)}>
                  Enter now
                </Button>
                <Button variant="ghost" onClick={() => skip(item.id)}>
                  Skip
                </Button>
                <Button variant="ghost" onClick={() => togglePause(item)}>
                  {item.is_paused ? 'Resume' : 'Pause'}
                </Button>
                <Button variant="danger" onClick={() => remove(item.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState title="No recurring items" body="Add rent, EMI, salary credit, or subscriptions." />
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add recurring transaction">
        <form onSubmit={save} className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select
              value={form.type}
              onChange={(e) =>
                setForm({
                  ...form,
                  type: e.target.value as 'expense' | 'income',
                  category: e.target.value === 'income' ? 'Salary' : 'Rent',
                })
              }
            >
              <option value="expense">Expense / bill</option>
              <option value="income">Income</option>
            </Select>
          </div>
          <div>
            <Label>Amount</Label>
            <Input type="number" required min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Frequency</Label>
            <Select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Start / next due</Label>
            <Input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.auto_enter} onChange={(e) => setForm({ ...form, auto_enter: e.target.checked })} />
            Auto-enter when due
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.reminder_enabled}
              onChange={(e) => setForm({ ...form, reminder_enabled: e.target.checked })}
            />
            Enable reminders
          </label>
          <Button className="w-full">Save</Button>
        </form>
      </Modal>
    </div>
  );
}
