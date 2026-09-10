import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { format } from 'date-fns';
import { api } from '../lib/api';
import {
  META_FIELDS,
  PORTFOLIO_GROUPS,
  PORTFOLIO_TYPES,
  getPortfolioType,
  type PortfolioFieldKey,
} from '../lib/constants';
import { formatINR, pct, uid, cn } from '../lib/utils';
import { getDB } from '../lib/localDb';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, TextArea } from '../components/ui';

interface Investment {
  id: string;
  name: string;
  type: string;
  invested_amount: number | string;
  current_value: number | string;
  purchase_date?: string;
  maturity_date?: string;
  notes?: string;
  client_id?: string;
  units?: number | string;
  symbol?: string;
  isin?: string;
  broker?: string;
  source?: string;
  institution?: string;
  reference_no?: string;
  interest_rate?: number | string;
  meta?: Record<string, unknown>;
}

interface Summary {
  totals: { count: number; invested: number; current: number; gain: number };
  byType: { type: string; count: number; invested: number; current: number; gain: number }[];
  maturingSoon: Array<{
    id: string;
    name: string;
    type: string;
    maturity_date: string;
    current_value: string | number;
    institution?: string;
  }>;
}

const COLORS = ['#0f5c4c', '#c46b2b', '#2f6fed', '#8b5e3c', '#5b7c6a', '#b42318', '#1b7a4e', '#6a4c93'];

const FIELD_LABELS: Record<PortfolioFieldKey, string> = {
  institution: 'Institution / Bank / Insurer',
  reference_no: 'Policy / Account / Folio No.',
  purchase_date: 'Start / purchase date',
  maturity_date: 'Maturity date',
  interest_rate: 'Interest rate %',
  symbol: 'Symbol / ticker',
  isin: 'ISIN',
  units: 'Units / quantity',
  broker: 'Broker / platform',
  sum_assured: 'Sum assured',
  premium: 'Premium amount',
  premium_frequency: 'Premium frequency',
  insured_name: 'Insured name',
  term_years: 'Policy term (years)',
  premium_term_years: 'Premium paying term (years)',
  policy_type: 'Policy type',
  uan: 'UAN',
  employer: 'Employer',
  pran: 'PRAN',
  monthly_installment: 'Monthly installment',
  tenure_months: 'Tenure (months)',
  address: 'Property address',
  area_sqft: 'Area (sq.ft)',
  rental_income_monthly: 'Monthly rental income',
  quantity_grams: 'Quantity (grams)',
  purity: 'Purity',
};

function emptyForm(type = 'Mutual Funds') {
  return {
    name: '',
    type,
    invested_amount: '',
    current_value: '',
    purchase_date: '',
    maturity_date: '',
    notes: '',
    institution: '',
    reference_no: '',
    interest_rate: '',
    symbol: '',
    isin: '',
    units: '',
    broker: '',
    sum_assured: '',
    premium: '',
    premium_frequency: 'yearly',
    insured_name: '',
    term_years: '',
    premium_term_years: '',
    policy_type: 'Endowment',
    uan: '',
    employer: '',
    pran: '',
    monthly_installment: '',
    tenure_months: '',
    address: '',
    area_sqft: '',
    rental_income_monthly: '',
    quantity_grams: '',
    purity: '24K',
  };
}

type FormState = ReturnType<typeof emptyForm>;

function buildPayload(form: FormState, clientId: string) {
  const def = getPortfolioType(form.type);
  const meta: Record<string, unknown> = {};
  for (const key of def.fields) {
    if (!META_FIELDS.has(key)) continue;
    const val = form[key as keyof FormState];
    if (val === '' || val == null) continue;
    const numericKeys = new Set([
      'sum_assured',
      'premium',
      'term_years',
      'premium_term_years',
      'monthly_installment',
      'tenure_months',
      'area_sqft',
      'rental_income_monthly',
      'quantity_grams',
    ]);
    meta[key] = numericKeys.has(key) ? Number(val) : val;
  }

  return {
    name: form.name,
    type: form.type,
    invested_amount: Number(form.invested_amount),
    current_value: Number(form.current_value || form.invested_amount),
    purchase_date: form.purchase_date || undefined,
    maturity_date: form.maturity_date || undefined,
    notes: form.notes || undefined,
    institution: form.institution || undefined,
    reference_no: form.reference_no || undefined,
    interest_rate: form.interest_rate !== '' ? Number(form.interest_rate) : undefined,
    symbol: form.symbol || undefined,
    isin: form.isin || undefined,
    units: form.units !== '' ? Number(form.units) : undefined,
    broker: form.broker || undefined,
    meta,
    client_id: clientId,
    source: 'manual',
  };
}

function formFromInvestment(inv: Investment): FormState {
  const meta = (inv.meta || {}) as Record<string, string | number>;
  const base = emptyForm(inv.type);
  return {
    ...base,
    name: inv.name,
    type: inv.type,
    invested_amount: String(inv.invested_amount ?? ''),
    current_value: String(inv.current_value ?? ''),
    purchase_date: inv.purchase_date?.slice(0, 10) || '',
    maturity_date: inv.maturity_date?.slice(0, 10) || '',
    notes: inv.notes || '',
    institution: inv.institution || '',
    reference_no: inv.reference_no || '',
    interest_rate: inv.interest_rate != null ? String(inv.interest_rate) : '',
    symbol: inv.symbol || '',
    isin: inv.isin || '',
    units: inv.units != null && Number(inv.units) !== 0 ? String(inv.units) : '',
    broker: inv.broker || '',
    sum_assured: meta.sum_assured != null ? String(meta.sum_assured) : '',
    premium: meta.premium != null ? String(meta.premium) : '',
    premium_frequency: String(meta.premium_frequency || 'yearly'),
    insured_name: String(meta.insured_name || ''),
    term_years: meta.term_years != null ? String(meta.term_years) : '',
    premium_term_years: meta.premium_term_years != null ? String(meta.premium_term_years) : '',
    policy_type: String(meta.policy_type || 'Endowment'),
    uan: String(meta.uan || ''),
    employer: String(meta.employer || ''),
    pran: String(meta.pran || ''),
    monthly_installment: meta.monthly_installment != null ? String(meta.monthly_installment) : '',
    tenure_months: meta.tenure_months != null ? String(meta.tenure_months) : '',
    address: String(meta.address || ''),
    area_sqft: meta.area_sqft != null ? String(meta.area_sqft) : '',
    rental_income_monthly: meta.rental_income_monthly != null ? String(meta.rental_income_monthly) : '',
    quantity_grams: meta.quantity_grams != null ? String(meta.quantity_grams) : '',
    purity: String(meta.purity || '24K'),
  };
}

function secondaryLine(inv: Investment) {
  const bits: string[] = [];
  if (inv.institution) bits.push(inv.institution);
  if (inv.reference_no) bits.push(inv.reference_no);
  if (inv.interest_rate != null && Number(inv.interest_rate) > 0) bits.push(`${Number(inv.interest_rate)}%`);
  if (inv.maturity_date) bits.push(`Matures ${format(new Date(inv.maturity_date), 'dd MMM yyyy')}`);
  const meta = inv.meta || {};
  if (meta.sum_assured) bits.push(`SA ${formatINR(Number(meta.sum_assured))}`);
  if (meta.rental_income_monthly) bits.push(`Rent ${formatINR(Number(meta.rental_income_monthly))}/mo`);
  if (meta.quantity_grams) bits.push(`${meta.quantity_grams}g`);
  if (meta.uan) bits.push(`UAN ${meta.uan}`);
  return bits.join(' · ');
}

export function InvestmentsPage() {
  const [items, setItems] = useState<Investment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filterGroup, setFilterGroup] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const [{ data }, summaryRes] = await Promise.all([
        api.get('/investments'),
        api.get('/investments/summary'),
      ]);
      setItems(data.investments);
      setSummary(summaryRes.data);
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

  const filtered = useMemo(() => {
    return items.filter((i) => {
      const def = getPortfolioType(i.type);
      if (filterGroup !== 'All' && def.group !== filterGroup) return false;
      if (filterType !== 'All' && i.type !== filterType) return false;
      return true;
    });
  }, [items, filterGroup, filterType]);

  const totals = useMemo(() => {
    const invested = filtered.reduce((s, i) => s + Number(i.invested_amount), 0);
    const current = filtered.reduce((s, i) => s + Number(i.current_value), 0);
    return { invested, current, gain: current - invested, pct: invested ? ((current - invested) / invested) * 100 : 0 };
  }, [filtered]);

  const allocation = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of filtered) map.set(i.type, (map.get(i.type) || 0) + Number(i.current_value));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const groupTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) {
      const g = getPortfolioType(i.type).group;
      map.set(g, (map.get(g) || 0) + Number(i.current_value));
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [items]);

  const typeOptions = useMemo(() => {
    if (filterGroup === 'All') return PORTFOLIO_TYPES;
    return PORTFOLIO_TYPES.filter((t) => t.group === filterGroup);
  }, [filterGroup]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const payload = buildPayload(form, editing?.client_id || uid());
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
    setForm(emptyForm());
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this holding?')) return;
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

  async function loadDemoAssets() {
    setBusy(true);
    setMessage('');
    try {
      const { data } = await api.post('/investments/demo-multi-asset');
      setMessage(
        data.created
          ? `Added ${data.created} sample holdings (FD, RD, EPF, PPF, policies, property, gold, NPS, bonds).`
          : 'Demo holdings already present.'
      );
      await load();
    } catch {
      setMessage('Could not load demo multi-asset holdings.');
    } finally {
      setBusy(false);
    }
  }

  const activeFields = getPortfolioType(form.type).fields;

  function renderField(key: PortfolioFieldKey) {
    const label = FIELD_LABELS[key];
    const value = form[key as keyof FormState] as string;

    if (key === 'premium_frequency') {
      return (
        <div key={key}>
          <Label>{label}</Label>
          <Select value={value} onChange={(e) => setForm({ ...form, premium_frequency: e.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half-yearly">Half-yearly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </div>
      );
    }

    if (key === 'policy_type') {
      return (
        <div key={key}>
          <Label>{label}</Label>
          <Select value={value} onChange={(e) => setForm({ ...form, policy_type: e.target.value })}>
            <option>Term</option>
            <option>Endowment</option>
            <option>Money Back</option>
            <option>Whole Life</option>
            <option>ULIP</option>
            <option>Health</option>
            <option>Other</option>
          </Select>
        </div>
      );
    }

    if (key === 'purchase_date' || key === 'maturity_date') {
      return (
        <div key={key}>
          <Label>{label}</Label>
          <Input
            type="date"
            value={value}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
        </div>
      );
    }

    const numeric = [
      'interest_rate',
      'units',
      'sum_assured',
      'premium',
      'term_years',
      'premium_term_years',
      'monthly_installment',
      'tenure_months',
      'area_sqft',
      'rental_income_monthly',
      'quantity_grams',
    ].includes(key);

    return (
      <div key={key}>
        <Label>{label}</Label>
        <Input
          type={numeric ? 'number' : 'text'}
          step={key === 'interest_rate' || key === 'units' ? 'any' : undefined}
          min={numeric ? '0' : undefined}
          value={value}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Portfolio"
        subtitle="Track stocks, mutual funds, FDs, RDs, EPF, PPF, NPS, insurance policies, property, gold, and more — like MyProfit."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/mail-import"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand)]"
            >
              Import contracts
            </Link>
            <Button variant="secondary" onClick={loadDemoAssets} disabled={busy}>
              {busy ? 'Loading…' : 'Load sample assets'}
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setForm(emptyForm(filterType !== 'All' ? filterType : 'Fixed Deposits'));
                setOpen(true);
              }}
            >
              Add holding
            </Button>
          </div>
        }
      />

      {message ? <p className="mb-4 text-sm text-[var(--color-brand)]">{message}</p> : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Holdings</p>
          <p className="mt-1 font-display text-2xl">{summary?.totals.count ?? items.length}</p>
        </Card>
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

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setFilterGroup('All');
            setFilterType('All');
          }}
          className={cn(
            'rounded-xl px-3 py-1.5 text-sm font-semibold',
            filterGroup === 'All' ? 'bg-[var(--color-brand)] text-white' : 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
          )}
        >
          All
        </button>
        {PORTFOLIO_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => {
              setFilterGroup(g);
              setFilterType('All');
            }}
            className={cn(
              'rounded-xl px-3 py-1.5 text-sm font-semibold',
              filterGroup === g ? 'bg-[var(--color-brand)] text-white' : 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
            )}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="mb-6">
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="max-w-md"
        >
          <option value="All">All types in this group</option>
          {typeOptions.map((t) => (
            <option key={t.type} value={t.type}>
              {t.type}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="mb-3 font-display text-lg">Allocation by type</h2>
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
            <EmptyState title="No allocation" body="Add FDs, policies, EPF, property, and more." />
          )}
          {groupTotals.length ? (
            <div className="mt-3 space-y-1 border-t border-[var(--color-border)] pt-3 text-sm">
              {groupTotals.map((g) => (
                <div key={g.name} className="flex justify-between gap-2">
                  <span className="text-[var(--color-ink-muted)]">{g.name}</span>
                  <span className="font-medium">{formatINR(g.value)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <div className="space-y-3 lg:col-span-2">
          {filtered.length ? (
            filtered.map((inv) => {
              const gain = Number(inv.current_value) - Number(inv.invested_amount);
              const ret = Number(inv.invested_amount)
                ? (gain / Number(inv.invested_amount)) * 100
                : 0;
              const detail = secondaryLine(inv);
              return (
                <Card key={inv.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{inv.name}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge>{inv.type}</Badge>
                      <Badge tone="neutral">{getPortfolioType(inv.type).group}</Badge>
                      {inv.source === 'email' || inv.source === 'demo' ? (
                        <Badge tone="warn">{inv.source === 'demo' ? 'Sample' : 'From mail'}</Badge>
                      ) : null}
                      <Badge tone={gain >= 0 ? 'success' : 'danger'}>
                        {formatINR(gain)} · {pct(ret)}
                      </Badge>
                    </div>
                    {detail ? <p className="mt-2 text-xs text-[var(--color-ink-muted)]">{detail}</p> : null}
                  </div>
                  <div className="text-sm sm:text-right">
                    <p>Invested {formatINR(inv.invested_amount)}</p>
                    <p className="font-semibold">Now {formatINR(inv.current_value)}</p>
                    <div className="mt-2">
                      <button
                        className="mr-3 text-[var(--color-brand)]"
                        onClick={() => {
                          setEditing(inv);
                          setForm(formFromInvestment(inv));
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
            <EmptyState
              title="No holdings in this view"
              body="Add FDs, RDs, EPF, insurance policies, property, gold — or load sample assets."
            />
          )}
        </div>
      </div>

      {summary?.maturingSoon?.length ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-display text-lg font-semibold">Maturing in next 90 days</h2>
          <div className="space-y-2">
            {summary.maturingSoon.map((m) => (
              <div key={m.id} className="flex justify-between gap-3 text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {m.type}
                    {m.institution ? ` · ${m.institution}` : ''} · {format(new Date(m.maturity_date), 'dd MMM yyyy')}
                  </p>
                </div>
                <p className="font-semibold">{formatINR(m.current_value)}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Update holding' : 'Add portfolio holding'}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <Label>Asset class</Label>
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {PORTFOLIO_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {PORTFOLIO_TYPES.filter((t) => t.group === g).map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.type}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{getPortfolioType(form.type).description}</p>
          </div>
          <div>
            <Label>Name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. SBI FD, LIC policy, Whitefield flat"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Invested / premium paid</Label>
              <Input
                type="number"
                required
                min="0"
                value={form.invested_amount}
                onChange={(e) => setForm({ ...form, invested_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Current value</Label>
              <Input
                type="number"
                min="0"
                value={form.current_value}
                onChange={(e) => setForm({ ...form, current_value: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">{activeFields.map(renderField)}</div>

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
