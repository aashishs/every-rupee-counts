import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { LOAN_TYPES, PREPAY_STRATEGIES } from '../lib/constants';
import { formatINR } from '../lib/utils';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  TextArea,
} from '../components/ui';

interface LoanSummary {
  outstanding: number;
  emi: number;
  originalEmi: number;
  remainingMonths: number;
  closingDate: string | null;
  closingYear: number | null;
  originalClosingDate: string;
  totalInterestRemaining: number;
  totalPrepaid: number;
  status: string;
  monthsElapsed: number;
  tenureMonths: number;
}

interface Loan {
  id: string;
  name: string;
  lender?: string;
  loan_type: string;
  principal: number | string;
  interest_rate: number | string;
  tenure_months: number;
  emi: number | string;
  start_date: string;
  foreclosure_charge_percent?: number | string;
  notes?: string;
  status: string;
  summary: LoanSummary;
  prepayment_count?: number;
}

interface Prepayment {
  id: string;
  amount: number | string;
  date: string;
  strategy: string;
  notes?: string;
  outstanding_before?: number | string;
  outstanding_after?: number | string;
  months_saved?: number;
  interest_saved?: number | string;
}

interface Simulation {
  strategy: string;
  prepayAmount: number;
  outstandingBefore: number;
  outstandingAfter: number;
  emiBefore: number;
  emiAfter: number;
  monthsBefore: number;
  monthsAfter: number;
  closingDateBefore: string | null;
  closingDateAfter: string | null;
  interestSaved: number | null;
  monthsSaved: number;
  fullyClosed: boolean;
}

interface ForeclosureEstimate {
  tentativeDate: string;
  outstandingOnDate: number;
  accruedInterest: number;
  foreclosureCharges: number;
  totalForeclosureAmount: number;
  naturalClosingDate: string | null;
  naturalMonthsRemaining: number;
  monthsSavedVsNatural: number;
  interestSavedVsNatural: number;
  emisPaidUntilThen: number;
}

const emptyLoan = {
  name: '',
  lender: '',
  loan_type: 'Home Loan',
  principal: '',
  interest_rate: '',
  tenure_months: '',
  emi: '',
  start_date: new Date().toISOString().slice(0, 10),
  foreclosure_charge_percent: '2',
  notes: '',
};

export function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    loan: Loan;
    summary: LoanSummary;
    prepayments: Prepayment[];
    schedule?: { months: number; closingDate: string; totalInterest: number; schedule: Array<Record<string, unknown>> };
  } | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyLoan);
  const [emiHint, setEmiHint] = useState<{ emi: number; closingDate: string; totalInterest: number } | null>(null);

  const [prepayOpen, setPrepayOpen] = useState(false);
  const [prepayForm, setPrepayForm] = useState({
    amount: '',
    strategy: 'reduce_tenure',
    date: new Date().toISOString().slice(0, 10),
    new_emi: '',
    notes: '',
  });
  const [simulation, setSimulation] = useState<Simulation | null>(null);

  const [forecloseOpen, setForecloseOpen] = useState(false);
  const [forecloseForm, setForecloseForm] = useState({
    tentative_date: '',
    foreclosure_charge_percent: '',
  });
  const [foreclosure, setForeclosure] = useState<ForeclosureEstimate | null>(null);

  async function loadLoans() {
    const { data } = await api.get('/loans');
    setLoans(data.loans);
    if (selectedId) {
      const still = data.loans.find((l: Loan) => l.id === selectedId);
      if (still) await loadDetail(selectedId);
      else setSelectedId(null);
    }
  }

  async function loadDetail(id: string) {
    const { data } = await api.get(`/loans/${id}`);
    setDetail(data);
    setSelectedId(id);
  }

  useEffect(() => {
    void loadLoans().catch(() => setLoans([]));
  }, []);

  useEffect(() => {
    const p = Number(form.principal);
    const r = Number(form.interest_rate);
    const t = Number(form.tenure_months);
    if (p > 0 && r >= 0 && t > 0) {
      const timer = setTimeout(() => {
        api
          .post('/loans/tools/emi', {
            principal: p,
            interest_rate: r,
            tenure_months: t,
            start_date: form.start_date,
          })
          .then((res) => setEmiHint(res.data))
          .catch(() => setEmiHint(null));
      }, 300);
      return () => clearTimeout(timer);
    }
    setEmiHint(null);
  }, [form.principal, form.interest_rate, form.tenure_months, form.start_date]);

  const totals = useMemo(() => {
    const outstanding = loans.reduce((s, l) => s + Number(l.summary?.outstanding || 0), 0);
    const emi = loans.reduce((s, l) => s + (l.summary?.status === 'closed' ? 0 : Number(l.summary?.emi || 0)), 0);
    return { outstanding, emi, count: loans.length };
  }, [loans]);

  async function saveLoan(e: FormEvent) {
    e.preventDefault();
    await api.post('/loans', {
      name: form.name,
      lender: form.lender || undefined,
      loan_type: form.loan_type,
      principal: Number(form.principal),
      interest_rate: Number(form.interest_rate),
      tenure_months: Number(form.tenure_months),
      emi: form.emi ? Number(form.emi) : undefined,
      start_date: form.start_date,
      foreclosure_charge_percent: Number(form.foreclosure_charge_percent || 0),
      notes: form.notes || undefined,
    });
    setAddOpen(false);
    setForm(emptyLoan);
    await loadLoans();
  }

  async function removeLoan(id: string) {
    if (!confirm('Delete this loan?')) return;
    await api.delete(`/loans/${id}`);
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
    }
    await loadLoans();
  }

  async function runSimulate() {
    if (!selectedId || !prepayForm.amount) return;
    const { data } = await api.post(`/loans/${selectedId}/prepay/simulate`, {
      amount: Number(prepayForm.amount),
      strategy: prepayForm.strategy,
      date: prepayForm.date,
      new_emi: prepayForm.strategy === 'hybrid' && prepayForm.new_emi ? Number(prepayForm.new_emi) : undefined,
    });
    setSimulation(data.simulation);
  }

  async function recordPrepay(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    await api.post(`/loans/${selectedId}/prepay`, {
      amount: Number(prepayForm.amount),
      strategy: prepayForm.strategy,
      date: prepayForm.date,
      new_emi: prepayForm.strategy === 'hybrid' && prepayForm.new_emi ? Number(prepayForm.new_emi) : undefined,
      notes: prepayForm.notes || undefined,
    });
    setPrepayOpen(false);
    setSimulation(null);
    setPrepayForm({
      amount: '',
      strategy: 'reduce_tenure',
      date: new Date().toISOString().slice(0, 10),
      new_emi: '',
      notes: '',
    });
    await loadLoans();
    await loadDetail(selectedId);
  }

  async function runForecloseEstimate(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const { data } = await api.post(`/loans/${selectedId}/foreclose/estimate`, {
      tentative_date: forecloseForm.tentative_date,
      foreclosure_charge_percent: forecloseForm.foreclosure_charge_percent
        ? Number(forecloseForm.foreclosure_charge_percent)
        : undefined,
    });
    setForeclosure(data.estimate);
  }

  async function deletePrepay(prepayId: string) {
    if (!selectedId || !confirm('Remove this prepayment record?')) return;
    await api.delete(`/loans/${selectedId}/prepay/${prepayId}`);
    await loadLoans();
    await loadDetail(selectedId);
  }

  function strategyLabel(key: string) {
    return PREPAY_STRATEGIES.find((s) => s.value === key)?.label || key;
  }

  return (
    <div>
      <PageHeader
        title="Loans"
        subtitle="Track EMIs, closing date, prepayments, and foreclosure plans."
        actions={<Button onClick={() => setAddOpen(true)}>Add loan</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Active loans</p>
          <p className="mt-1 font-display text-2xl">{totals.count}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Total outstanding</p>
          <p className="mt-1 font-display text-2xl">{formatINR(totals.outstanding)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Monthly EMI outgo</p>
          <p className="mt-1 font-display text-2xl">{formatINR(totals.emi)}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          {loans.length ? (
            loans.map((loan) => (
              <Card
                key={loan.id}
                className={`cursor-pointer transition ${selectedId === loan.id ? 'ring-2 ring-[var(--color-brand)]' : ''}`}
              >
                <button type="button" className="w-full text-left" onClick={() => void loadDetail(loan.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{loan.name}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {loan.lender || loan.loan_type} · {Number(loan.interest_rate)}% p.a.
                      </p>
                    </div>
                    <Badge tone={loan.summary?.status === 'closed' ? 'success' : 'neutral'}>
                      {loan.summary?.status || loan.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-[var(--color-ink-muted)]">Outstanding</p>
                      <p className="font-semibold">{formatINR(loan.summary?.outstanding)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-ink-muted)]">Closes</p>
                      <p className="font-semibold">
                        {loan.summary?.closingDate
                          ? format(new Date(loan.summary.closingDate), 'MMM yyyy')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-ink-muted)]">EMI</p>
                      <p className="font-semibold">{formatINR(loan.summary?.emi)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-ink-muted)]">Months left</p>
                      <p className="font-semibold">{loan.summary?.remainingMonths ?? '—'}</p>
                    </div>
                  </div>
                </button>
                <div className="mt-3 flex gap-2 border-t border-[var(--color-border)] pt-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      void loadDetail(loan.id).then(() => {
                        setPrepayForm((f) => ({ ...f, amount: '' }));
                        setSimulation(null);
                        setPrepayOpen(true);
                      });
                    }}
                  >
                    Prepay
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => {
                      void loadDetail(loan.id).then(() => {
                        const d = new Date();
                        d.setMonth(d.getMonth() + 3);
                        setForecloseForm({
                          tentative_date: d.toISOString().slice(0, 10),
                          foreclosure_charge_percent: String(loan.foreclosure_charge_percent ?? 2),
                        });
                        setForeclosure(null);
                        setForecloseOpen(true);
                      });
                    }}
                  >
                    Foreclose
                  </Button>
                  <Button variant="danger" onClick={() => void removeLoan(loan.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            ))
          ) : (
            <EmptyState title="No loans yet" body="Add a home, car, personal, or education loan to track closing and prepayments." />
          )}
        </div>

        <div className="lg:col-span-3">
          {detail ? (
            <div className="space-y-4 animate-fade">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl font-semibold">{detail.loan.name}</h2>
                    <p className="text-sm text-[var(--color-ink-muted)]">
                      {detail.loan.loan_type}
                      {detail.loan.lender ? ` · ${detail.loan.lender}` : ''} · started{' '}
                      {format(new Date(detail.loan.start_date), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <Badge tone={detail.summary.status === 'closed' ? 'success' : 'warn'}>
                    {detail.summary.remainingMonths} months to close
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Principal" value={formatINR(detail.loan.principal)} />
                  <Metric label="Outstanding" value={formatINR(detail.summary.outstanding)} />
                  <Metric label="Current EMI" value={formatINR(detail.summary.emi)} />
                  <Metric label="Interest left" value={formatINR(detail.summary.totalInterestRemaining)} />
                  <Metric
                    label="Closing date"
                    value={
                      detail.summary.closingDate
                        ? format(new Date(detail.summary.closingDate), 'dd MMM yyyy')
                        : '—'
                    }
                  />
                  <Metric label="Closing year" value={String(detail.summary.closingYear || '—')} />
                  <Metric
                    label="Original end"
                    value={format(new Date(detail.summary.originalClosingDate), 'dd MMM yyyy')}
                  />
                  <Metric label="Total prepaid" value={formatINR(detail.summary.totalPrepaid)} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      setSimulation(null);
                      setPrepayOpen(true);
                    }}
                  >
                    Simulate / record prepayment
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const d = new Date();
                      d.setMonth(d.getMonth() + 3);
                      setForecloseForm({
                        tentative_date: d.toISOString().slice(0, 10),
                        foreclosure_charge_percent: String(detail.loan.foreclosure_charge_percent ?? 2),
                      });
                      setForeclosure(null);
                      setForecloseOpen(true);
                    }}
                  >
                    Tentative foreclosure
                  </Button>
                </div>
              </Card>

              <Card>
                <h3 className="mb-3 font-display text-lg font-semibold">Prepayment history</h3>
                {detail.prepayments.length ? (
                  <div className="space-y-3">
                    {detail.prepayments.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-col gap-2 border-b border-[var(--color-border)] pb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-semibold">{formatINR(p.amount)}</p>
                          <p className="text-xs text-[var(--color-ink-muted)]">
                            {format(new Date(p.date), 'dd MMM yyyy')} · {strategyLabel(p.strategy)}
                            {p.months_saved != null ? ` · saved ${p.months_saved} mo` : ''}
                            {p.interest_saved != null ? ` · interest saved ${formatINR(p.interest_saved)}` : ''}
                          </p>
                          {p.notes ? <p className="text-xs text-[var(--color-ink-muted)]">{p.notes}</p> : null}
                        </div>
                        <button className="text-sm text-[var(--color-danger)]" onClick={() => void deletePrepay(p.id)}>
                          Undo
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No prepayments" body="Record lump-sum payments to shorten tenure or lower EMI." />
                )}
              </Card>

              <Card>
                <h3 className="mb-3 font-display text-lg font-semibold">Upcoming EMI schedule (preview)</h3>
                {detail.schedule?.schedule?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase text-[var(--color-ink-muted)]">
                        <tr>
                          <th className="py-2 pr-3">#</th>
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 pr-3 text-right">EMI</th>
                          <th className="py-2 pr-3 text-right">Principal</th>
                          <th className="py-2 pr-3 text-right">Interest</th>
                          <th className="py-2 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.schedule.schedule.slice(0, 12).map((row) => (
                          <tr key={String(row.month)} className="border-t border-[var(--color-border)]">
                            <td className="py-2 pr-3">{String(row.month)}</td>
                            <td className="py-2 pr-3">
                              {row.date ? format(new Date(String(row.date)), 'MMM yyyy') : '—'}
                            </td>
                            <td className="py-2 pr-3 text-right">{formatINR(Number(row.emi))}</td>
                            <td className="py-2 pr-3 text-right">{formatINR(Number(row.principal))}</td>
                            <td className="py-2 pr-3 text-right">{formatINR(Number(row.interest))}</td>
                            <td className="py-2 text-right">{formatINR(Number(row.balance))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(detail.schedule.schedule.length || 0) > 12 ? (
                      <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                        Showing first 12 of {detail.schedule.months} remaining instalments.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-ink-muted)]">Loan is closed or schedule unavailable.</p>
                )}
              </Card>
            </div>
          ) : (
            <Card>
              <EmptyState title="Select a loan" body="Pick a loan on the left to see closing date, schedule, and prepayment tools." />
            </Card>
          )}
        </div>
      </div>

      {/* Add loan */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add loan">
        <form onSubmit={saveLoan} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="HDFC Home Loan" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Type</Label>
              <Select value={form.loan_type} onChange={(e) => setForm({ ...form, loan_type: e.target.value })}>
                {LOAN_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Lender</Label>
              <Input value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Principal (₹)</Label>
              <Input type="number" required min="0" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
            </div>
            <div>
              <Label>Interest rate % p.a.</Label>
              <Input type="number" required min="0" step="0.01" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Tenure (months)</Label>
              <Input type="number" required min="1" value={form.tenure_months} onChange={(e) => setForm({ ...form, tenure_months: e.target.value })} />
            </div>
            <div>
              <Label>Start date</Label>
              <Input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>EMI (optional — auto if blank)</Label>
              <Input type="number" min="0" value={form.emi} onChange={(e) => setForm({ ...form, emi: e.target.value })} placeholder={emiHint ? String(emiHint.emi) : ''} />
            </div>
            <div>
              <Label>Foreclosure charge %</Label>
              <Input type="number" min="0" step="0.01" value={form.foreclosure_charge_percent} onChange={(e) => setForm({ ...form, foreclosure_charge_percent: e.target.value })} />
            </div>
          </div>
          {emiHint ? (
            <div className="rounded-xl bg-[var(--color-brand-soft)] px-3 py-2 text-sm">
              Suggested EMI {formatINR(emiHint.emi)} · closes {format(new Date(emiHint.closingDate), 'MMM yyyy')} · interest ~{' '}
              {formatINR(emiHint.totalInterest)}
            </div>
          ) : null}
          <div>
            <Label>Notes</Label>
            <TextArea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button className="w-full" type="submit">
            Save loan
          </Button>
        </form>
      </Modal>

      {/* Prepayment */}
      <Modal
        open={prepayOpen}
        onClose={() => {
          setPrepayOpen(false);
          setSimulation(null);
        }}
        title="Prepayment"
      >
        <form onSubmit={recordPrepay} className="space-y-3">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Choose how the bank should apply your lump sum, simulate savings, then record it.
          </p>
          <div>
            <Label>Amount (₹)</Label>
            <Input
              type="number"
              required
              min="1"
              value={prepayForm.amount}
              onChange={(e) => {
                setPrepayForm({ ...prepayForm, amount: e.target.value });
                setSimulation(null);
              }}
            />
          </div>
          <div>
            <Label>Strategy</Label>
            <Select
              value={prepayForm.strategy}
              onChange={(e) => {
                setPrepayForm({ ...prepayForm, strategy: e.target.value });
                setSimulation(null);
              }}
            >
              {PREPAY_STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              {PREPAY_STRATEGIES.find((s) => s.value === prepayForm.strategy)?.hint}
            </p>
          </div>
          {prepayForm.strategy === 'hybrid' ? (
            <div>
              <Label>Custom new EMI</Label>
              <Input
                type="number"
                min="1"
                required
                value={prepayForm.new_emi}
                onChange={(e) => setPrepayForm({ ...prepayForm, new_emi: e.target.value })}
              />
            </div>
          ) : null}
          <div>
            <Label>Payment date</Label>
            <Input type="date" required value={prepayForm.date} onChange={(e) => setPrepayForm({ ...prepayForm, date: e.target.value })} />
          </div>
          <div>
            <Label>Notes</Label>
            <TextArea rows={2} value={prepayForm.notes} onChange={(e) => setPrepayForm({ ...prepayForm, notes: e.target.value })} />
          </div>

          <Button type="button" variant="secondary" className="w-full" onClick={() => void runSimulate()}>
            Simulate impact
          </Button>

          {simulation ? (
            <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] p-3 text-sm">
              {simulation.fullyClosed ? (
                <p className="font-semibold text-[var(--color-success)]">This amount fully closes the loan.</p>
              ) : (
                <>
                  <Row label="Outstanding after" value={formatINR(simulation.outstandingAfter)} />
                  <Row label="EMI" value={`${formatINR(simulation.emiBefore)} → ${formatINR(simulation.emiAfter)}`} />
                  <Row label="Months left" value={`${simulation.monthsBefore} → ${simulation.monthsAfter} (−${simulation.monthsSaved})`} />
                  <Row
                    label="New closing date"
                    value={
                      simulation.closingDateAfter
                        ? format(new Date(simulation.closingDateAfter), 'dd MMM yyyy')
                        : '—'
                    }
                  />
                  <Row label="Interest saved" value={formatINR(simulation.interestSaved || 0)} />
                </>
              )}
            </div>
          ) : null}

          <Button className="w-full" type="submit">
            Record prepayment
          </Button>
        </form>
      </Modal>

      {/* Foreclosure */}
      <Modal
        open={forecloseOpen}
        onClose={() => {
          setForecloseOpen(false);
          setForeclosure(null);
        }}
        title="Tentative foreclosure"
      >
        <form onSubmit={runForecloseEstimate} className="space-y-3">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Pick a date you might foreclose. We’ll estimate outstanding principal, accrued interest, charges, and months saved vs natural close.
          </p>
          <div>
            <Label>Tentative foreclosure date</Label>
            <Input
              type="date"
              required
              value={forecloseForm.tentative_date}
              onChange={(e) => setForecloseForm({ ...forecloseForm, tentative_date: e.target.value })}
            />
          </div>
          <div>
            <Label>Foreclosure charge % (on outstanding)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={forecloseForm.foreclosure_charge_percent}
              onChange={(e) => setForecloseForm({ ...forecloseForm, foreclosure_charge_percent: e.target.value })}
            />
          </div>
          <Button className="w-full" type="submit">
            Estimate foreclosure amount
          </Button>

          {foreclosure ? (
            <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] p-3 text-sm">
              <Row label="Outstanding on date" value={formatINR(foreclosure.outstandingOnDate)} />
              <Row label="Accrued interest" value={formatINR(foreclosure.accruedInterest)} />
              <Row label="Foreclosure charges" value={formatINR(foreclosure.foreclosureCharges)} />
              <Row label="Total to pay" value={formatINR(foreclosure.totalForeclosureAmount)} />
              <Row
                label="Natural closing"
                value={
                  foreclosure.naturalClosingDate
                    ? format(new Date(foreclosure.naturalClosingDate), 'dd MMM yyyy')
                    : '—'
                }
              />
              <Row label="Months saved" value={String(foreclosure.monthsSavedVsNatural)} />
              <Row label="Interest saved (approx)" value={formatINR(foreclosure.interestSavedVsNatural)} />
              <Row label="EMIs until then" value={String(foreclosure.emisPaidUntilThen)} />
            </div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-brand-soft)]/50 px-3 py-2">
      <p className="text-xs text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--color-ink-muted)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
