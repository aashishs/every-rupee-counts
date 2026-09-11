import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { LOAN_TYPES } from '../lib/constants';
import { formatINR, uid } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, TextArea } from '../components/ui';

interface Loan {
  id: string;
  name: string;
  loan_type: string;
  lender?: string;
  account_no?: string;
  principal: number | string;
  outstanding: number | string;
  interest_rate?: number | string;
  emi_amount?: number | string;
  tenure_months?: number | string;
  start_date?: string;
  end_date?: string;
  next_due_date?: string;
  status?: string;
  notes?: string;
  client_id?: string;
}

const empty = {
  name: '',
  loan_type: 'Home Loan',
  lender: '',
  account_no: '',
  principal: '',
  outstanding: '',
  interest_rate: '',
  emi_amount: '',
  tenure_months: '',
  start_date: '',
  end_date: '',
  next_due_date: '',
  status: 'active',
  notes: '',
};

export function LoansPage() {
  const [items, setItems] = useState<Loan[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('active');
  const [error, setError] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/loans');
      setItems(data.loans || []);
      setError('');
    } catch {
      setError('Could not load loans.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((l) => (l.status || 'active') === filter);
  }, [items, filter]);

  const totals = useMemo(() => {
    const active = items.filter((l) => (l.status || 'active') === 'active');
    return {
      count: active.length,
      outstanding: active.reduce((s, l) => s + Number(l.outstanding || 0), 0),
      emi: active.reduce((s, l) => s + Number(l.emi_amount || 0), 0),
      principal: items.reduce((s, l) => s + Number(l.principal || 0), 0),
    };
  }, [items]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      loan_type: form.loan_type,
      lender: form.lender || undefined,
      account_no: form.account_no || undefined,
      principal: Number(form.principal),
      outstanding: Number(form.outstanding || form.principal),
      interest_rate: form.interest_rate !== '' ? Number(form.interest_rate) : undefined,
      emi_amount: form.emi_amount !== '' ? Number(form.emi_amount) : 0,
      tenure_months: form.tenure_months !== '' ? Number(form.tenure_months) : undefined,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      next_due_date: form.next_due_date || undefined,
      status: form.status || 'active',
      notes: form.notes || undefined,
      client_id: editing?.client_id || uid(),
    };
    try {
      if (editing) await api.put(`/loans/${editing.id}`, payload);
      else await api.post('/loans', payload);
      setOpen(false);
      setEditing(null);
      setForm(empty);
      await load();
    } catch {
      setError('Could not save loan.');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this loan?')) return;
    try {
      await api.delete(`/loans/${id}`);
      await load();
    } catch {
      setError('Could not delete loan.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Loans"
        subtitle="Track home, personal, vehicle, education loans and EMIs — outstanding, rate, and due dates."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setForm(empty);
              setOpen(true);
            }}
          >
            Add loan
          </Button>
        }
      />

      {error ? <p className="mb-4 text-sm text-[var(--color-danger)]">{error}</p> : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Active loans</p>
          <p className="mt-1 font-display text-2xl">{totals.count}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Outstanding</p>
          <p className="mt-1 font-display text-2xl">{formatINR(totals.outstanding)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Monthly EMI</p>
          <p className="mt-1 font-display text-2xl">{formatINR(totals.emi)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Original principal</p>
          <p className="mt-1 font-display text-2xl">{formatINR(totals.principal)}</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['active', 'all', 'closed'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold capitalize ${
              filter === f
                ? 'bg-[var(--color-brand)] text-white'
                : 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length ? (
          filtered.map((loan) => {
            const paid = Math.max(0, Number(loan.principal) - Number(loan.outstanding));
            const pctPaid = Number(loan.principal) ? (paid / Number(loan.principal)) * 100 : 0;
            return (
              <Card key={loan.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{loan.name}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge>{loan.loan_type}</Badge>
                    <Badge tone={(loan.status || 'active') === 'active' ? 'success' : 'neutral'}>
                      {loan.status || 'active'}
                    </Badge>
                    {loan.interest_rate != null && Number(loan.interest_rate) > 0 ? (
                      <Badge tone="neutral">{Number(loan.interest_rate)}% p.a.</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                    {[
                      loan.lender,
                      loan.account_no,
                      loan.next_due_date
                        ? `Next EMI ${format(new Date(loan.next_due_date), 'dd MMM yyyy')}`
                        : null,
                      Number(loan.emi_amount) > 0 ? `EMI ${formatINR(loan.emi_amount)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="mt-3 h-2 max-w-md overflow-hidden rounded-full bg-[var(--color-brand-soft)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-brand)]"
                      style={{ width: `${Math.min(100, pctPaid)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    Paid {formatINR(paid)} · {pctPaid.toFixed(0)}% of principal
                  </p>
                </div>
                <div className="text-sm sm:text-right">
                  <p className="text-[var(--color-ink-muted)]">Outstanding</p>
                  <p className="font-display text-xl font-semibold">{formatINR(loan.outstanding)}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">of {formatINR(loan.principal)}</p>
                  <div className="mt-2">
                    <button
                      className="mr-3 text-[var(--color-brand)]"
                      onClick={() => {
                        setEditing(loan);
                        setForm({
                          name: loan.name,
                          loan_type: loan.loan_type,
                          lender: loan.lender || '',
                          account_no: loan.account_no || '',
                          principal: String(loan.principal ?? ''),
                          outstanding: String(loan.outstanding ?? ''),
                          interest_rate: loan.interest_rate != null ? String(loan.interest_rate) : '',
                          emi_amount: loan.emi_amount != null ? String(loan.emi_amount) : '',
                          tenure_months: loan.tenure_months != null ? String(loan.tenure_months) : '',
                          start_date: loan.start_date?.slice(0, 10) || '',
                          end_date: loan.end_date?.slice(0, 10) || '',
                          next_due_date: loan.next_due_date?.slice(0, 10) || '',
                          status: loan.status || 'active',
                          notes: loan.notes || '',
                        });
                        setOpen(true);
                      }}
                    >
                      Update
                    </button>
                    <button className="text-[var(--color-danger)]" onClick={() => remove(loan.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState
            title="No loans yet"
            body="Add home, personal, car, education, or gold loans to track EMIs and outstanding balance."
          />
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Update loan' : 'Add loan'}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. HDFC Home Loan"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.loan_type} onChange={(e) => setForm({ ...form, loan_type: e.target.value })}>
                {LOAN_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lender</Label>
              <Input value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
            </div>
            <div>
              <Label>Account / loan no.</Label>
              <Input value={form.account_no} onChange={(e) => setForm({ ...form, account_no: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Principal</Label>
              <Input
                type="number"
                required
                min="0"
                value={form.principal}
                onChange={(e) => setForm({ ...form, principal: e.target.value })}
              />
            </div>
            <div>
              <Label>Outstanding</Label>
              <Input
                type="number"
                min="0"
                value={form.outstanding}
                onChange={(e) => setForm({ ...form, outstanding: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Interest rate %</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={form.interest_rate}
                onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
              />
            </div>
            <div>
              <Label>EMI amount</Label>
              <Input
                type="number"
                min="0"
                value={form.emi_amount}
                onChange={(e) => setForm({ ...form, emi_amount: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tenure (months)</Label>
              <Input
                type="number"
                min="0"
                value={form.tenure_months}
                onChange={(e) => setForm({ ...form, tenure_months: e.target.value })}
              />
            </div>
            <div>
              <Label>Next EMI due</Label>
              <Input
                type="date"
                value={form.next_due_date}
                onChange={(e) => setForm({ ...form, next_due_date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
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
