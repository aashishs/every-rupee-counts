import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { formatINR, pct, uid } from '../lib/utils';
import { getDB } from '../lib/localDb';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select } from '../components/ui';

interface Budget {
  id: string;
  category: string;
  amount: number | string;
  spent?: number | string;
  remaining?: number;
  utilization?: number;
  month: string;
  alert_threshold?: number | string;
  client_id?: string;
}

export function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [recommendations, setRecommendations] = useState<
    Array<{ category: string; average_spend: number; recommended_budget: number }>
  >([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: 'Food',
    amount: '',
    month: new Date().toISOString().slice(0, 7) + '-01',
    alert_threshold: '80',
  });

  async function load() {
    try {
      const [{ data: b }, { data: r }] = await Promise.all([
        api.get('/budgets'),
        api.post('/budgets/recommend'),
      ]);
      setBudgets(b.budgets);
      setRecommendations(r.recommendations || []);
      const db = await getDB();
      for (const item of b.budgets) {
        await db.put('budgets', {
          ...item,
          amount: Number(item.amount),
          client_id: item.client_id || item.id,
          updated_at: item.updated_at || new Date().toISOString(),
        });
      }
    } catch {
      const db = await getDB();
      setBudgets(await db.getAll('budgets'));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const payload = {
      category: form.category,
      amount: Number(form.amount),
      month: form.month,
      alert_threshold: Number(form.alert_threshold),
      client_id: uid(),
    };
    try {
      await api.post('/budgets', payload);
    } catch {
      const db = await getDB();
      await db.put('budgets', {
        id: uid(),
        ...payload,
        updated_at: new Date().toISOString(),
        dirty: true,
      });
    }
    setOpen(false);
    await load();
  }

  async function applyRecommendation(rec: { category: string; recommended_budget: number }) {
    setForm({
      ...form,
      category: rec.category,
      amount: String(rec.recommended_budget),
    });
    setOpen(true);
  }

  async function remove(id: string) {
    if (!confirm('Remove this budget?')) return;
    try {
      await api.delete(`/budgets/${id}`);
    } catch {
      /* offline: ignore */
    }
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Budget Planner"
        subtitle="Set category budgets and get next-month recommendations from your trends."
        actions={<Button onClick={() => setOpen(true)}>Set budget</Button>}
      />

      <div className="mb-6 grid gap-3 lg:grid-cols-2">
        {budgets.length ? (
          budgets.map((b) => {
            const utilization = Number(b.utilization ?? 0);
            const spent = Number(b.spent ?? 0);
            const amount = Number(b.amount);
            const remaining = Number(b.remaining ?? amount - spent);
            return (
              <Card key={b.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{b.category}</p>
                    <p className="text-sm text-[var(--color-ink-muted)]">
                      {formatINR(spent)} of {formatINR(amount)}
                    </p>
                  </div>
                  <Badge tone={utilization >= 100 ? 'danger' : utilization >= 80 ? 'warn' : 'success'}>
                    {pct(utilization, 0)}
                  </Badge>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-brand-soft)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-brand)] transition-all"
                    style={{ width: `${Math.min(100, utilization)}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-[var(--color-ink-muted)]">Left {formatINR(remaining)}</span>
                  <button className="text-[var(--color-danger)]" onClick={() => remove(b.id)}>
                    Remove
                  </button>
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState title="No budgets" body="Create category budgets or apply a recommendation." />
        )}
      </div>

      <h2 className="mb-3 font-display text-xl">Recommended for next month</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recommendations.length ? (
          recommendations.map((r) => (
            <Card key={r.category}>
              <p className="font-semibold">{r.category}</p>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Avg spend {formatINR(r.average_spend)}
              </p>
              <p className="mt-2 font-display text-xl">{formatINR(r.recommended_budget)}</p>
              <Button className="mt-3" variant="secondary" onClick={() => applyRecommendation(r)}>
                Use this
              </Button>
            </Card>
          ))
        ) : (
          <EmptyState title="Need more history" body="Recommendations appear after a few months of expenses." />
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Set category budget">
        <form onSubmit={save} className="space-y-3">
          <div>
            <Label>Category</Label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Amount</Label>
            <Input type="number" required min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <Label>Month</Label>
            <Input type="month" value={form.month.slice(0, 7)} onChange={(e) => setForm({ ...form, month: `${e.target.value}-01` })} />
          </div>
          <div>
            <Label>Alert threshold %</Label>
            <Input type="number" min="1" max="100" value={form.alert_threshold} onChange={(e) => setForm({ ...form, alert_threshold: e.target.value })} />
          </div>
          <Button className="w-full">Save budget</Button>
        </form>
      </Modal>
    </div>
  );
}
