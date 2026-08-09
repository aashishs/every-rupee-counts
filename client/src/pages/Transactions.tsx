import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/constants';
import { formatINR, uid } from '../lib/utils';
import { getDB } from '../lib/localDb';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  TextArea,
} from '../components/ui';

interface Tx {
  id: string;
  type: 'expense' | 'income';
  amount: number | string;
  category: string;
  description?: string;
  notes?: string;
  tags?: string[];
  date: string;
  client_id?: string;
}

const emptyForm = {
  type: 'expense' as 'expense' | 'income',
  amount: '',
  category: 'Food',
  description: '',
  notes: '',
  tags: '',
  date: new Date().toISOString().slice(0, 10),
};

export function TransactionsPage() {
  const [params] = useSearchParams();
  const [items, setItems] = useState<Tx[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [open, setOpen] = useState(params.get('new') === 'expense' || params.get('new') === 'income');
  const [editing, setEditing] = useState<Tx | null>(null);
  const [form, setForm] = useState({
    ...emptyForm,
    type: (params.get('new') as 'expense' | 'income') || 'expense',
    category: params.get('new') === 'income' ? 'Salary' : 'Food',
  });

  async function load() {
    try {
      const { data } = await api.get('/transactions', {
        params: { search: search || undefined, type: typeFilter || undefined, limit: 200 },
      });
      setItems(data.transactions);
      const db = await getDB();
      for (const tx of data.transactions) {
        await db.put('transactions', {
          ...tx,
          id: tx.id,
          client_id: tx.client_id || tx.id,
          amount: Number(tx.amount),
          updated_at: tx.updated_at || new Date().toISOString(),
          dirty: false,
        });
      }
    } catch {
      const db = await getDB();
      const local = (await db.getAll('transactions')).filter((t) => !t.deleted_at);
      setItems(
        local
          .filter((t) => (!typeFilter || t.type === typeFilter) && (!search || `${t.description} ${t.category}`.toLowerCase().includes(search.toLowerCase())))
          .sort((a, b) => b.date.localeCompare(a.date))
      );
    }
  }

  useEffect(() => {
    void load();
  }, [search, typeFilter]);

  const categories = form.type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  async function save(e: FormEvent) {
    e.preventDefault();
    const payload = {
      type: form.type,
      amount: Number(form.amount),
      category: form.category,
      description: form.description,
      notes: form.notes,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      date: form.date,
      client_id: editing?.client_id || uid(),
    };

    try {
      if (editing) {
        await api.put(`/transactions/${editing.id}`, payload);
      } else {
        await api.post('/transactions', payload);
      }
    } catch {
      const db = await getDB();
      const id = editing?.id || uid();
      await db.put('transactions', {
        id,
        ...payload,
        client_id: payload.client_id,
        updated_at: new Date().toISOString(),
        dirty: true,
      });
    }

    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this transaction?')) return;
    try {
      await api.delete(`/transactions/${id}`);
    } catch {
      const db = await getDB();
      const existing = await db.get('transactions', id);
      if (existing) {
        await db.put('transactions', {
          ...existing,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          dirty: true,
        });
      }
    }
    await load();
  }

  const totals = useMemo(() => {
    const income = items.filter((i) => i.type === 'income').reduce((s, i) => s + Number(i.amount), 0);
    const expense = items.filter((i) => i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0);
    return { income, expense };
  }, [items]);

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Track every expense and income with categories, tags, and notes."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setForm({ ...emptyForm, type: 'income', category: 'Salary' });
                setOpen(true);
              }}
            >
              Add income
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setForm({ ...emptyForm, type: 'expense', category: 'Food' });
                setOpen(true);
              }}
            >
              Add expense
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="sm:w-48">
          <option value="">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
        </Select>
      </div>

      <div className="mb-4 flex gap-3 text-sm">
        <Badge tone="success">Income {formatINR(totals.income)}</Badge>
        <Badge tone="danger">Expense {formatINR(totals.expense)}</Badge>
      </div>

      {items.length ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-brand-soft)]/60 text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-t border-[var(--color-border)] bg-[var(--color-paper-elevated)]/50">
                  <td className="px-4 py-3 whitespace-nowrap">{format(new Date(t.date), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{t.description || t.category}</p>
                    {t.notes ? <p className="text-xs text-[var(--color-ink-muted)]">{t.notes}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{t.category}</Badge>
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${t.type === 'income' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                    {t.type === 'income' ? '+' : '-'}
                    {formatINR(t.amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="mr-2 text-[var(--color-brand)]"
                      onClick={() => {
                        setEditing(t);
                        setForm({
                          type: t.type,
                          amount: String(t.amount),
                          category: t.category,
                          description: t.description || '',
                          notes: t.notes || '',
                          tags: (t.tags || []).join(', '),
                          date: t.date.slice(0, 10),
                        });
                        setOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button className="text-[var(--color-danger)]" onClick={() => remove(t.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No transactions" body="Add your first expense or income to get started." />
      )}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Edit transaction' : form.type === 'income' ? 'Add income' : 'Add expense'}
      >
        <form onSubmit={save} className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select
              value={form.type}
              onChange={(e) =>
                setForm({
                  ...form,
                  type: e.target.value as 'expense' | 'income',
                  category: e.target.value === 'income' ? 'Salary' : 'Food',
                })
              }
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </div>
          <div>
            <Label>Amount (₹)</Label>
            <Input type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Notes</Label>
            <TextArea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div>
            <Label>Tags (comma separated)</Label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="family, weekend" />
          </div>
          <Button className="w-full" type="submit">
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
