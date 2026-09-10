import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { formatINR } from '../lib/utils';
import { Badge, Card, EmptyState, PageHeader, Stat } from '../components/ui';

const COLORS = ['#0f5c4c', '#c46b2b', '#2f6fed', '#8b5e3c', '#5b7c6a', '#b42318', '#1b7a4e'];

interface DashboardData {
  overview: {
    monthlyIncome: number;
    monthlyExpenses: number;
    netSavings: number;
    cashFlow: number;
    budgetUtilization: number;
    investmentPortfolio: number;
    investedAmount: number;
    investmentGain: number;
    totalAssets: number;
    netWorth: number;
    financialHealthScore: number;
    accountBalance: number;
    emailHoldings?: number;
    importedTrades?: number;
    importJobsThisMonth?: number;
  };
  expenseByCategory: { category: string; total: string }[];
  cashFlowTrend: { period: string; income: number; expense: number; net: number }[];
  upcomingPayments: Array<{
    id: string;
    description?: string;
    category: string;
    amount: string;
    next_due_date: string;
    type: string;
  }>;
  recentTransactions: Array<{
    id: string;
    type: string;
    category: string;
    amount: string;
    date: string;
    description?: string;
  }>;
  recentInvestmentTrades?: Array<{
    id: string;
    trade_date: string;
    side: string;
    asset_type: string;
    name: string;
    symbol?: string;
    amount: string | number;
    broker?: string;
  }>;
  investmentAllocation?: Array<{
    type: string;
    current: number;
    invested: number;
  }>;
  mailImport?: {
    importedJobs: number;
    tradesImported: number;
    jobsThisMonth: number;
  };
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/dashboard')
      .then((res) => setData(res.data))
      .catch(() => setError('Could not load dashboard. You can still work offline from other screens after syncing once.'));
  }, []);

  if (error && !data) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Your financial overview" />
        <EmptyState title="Dashboard unavailable" body={error} />
      </div>
    );
  }

  if (!data) {
    return <p className="text-[var(--color-ink-muted)]">Loading dashboard…</p>;
  }

  const o = data.overview;
  const pieData = data.expenseByCategory.map((c) => ({
    name: c.category,
    value: Number(c.total),
  }));
  const allocData = (data.investmentAllocation || [])
    .filter((a) => a.current > 0)
    .map((a) => ({ name: a.type, value: a.current }));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="A clear snapshot of income, spend, investments, and health."
        actions={
          <Link
            to="/mail-import"
            className="rounded-xl bg-[var(--color-brand-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand)]"
          >
            Import from mail
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="h-3 w-40 overflow-hidden rounded-full bg-[var(--color-brand-soft)]">
          <div
            className="h-full rounded-full bg-[var(--color-brand)] transition-all duration-700"
            style={{ width: `${o.financialHealthScore}%` }}
          />
        </div>
        <Badge tone={o.financialHealthScore >= 70 ? 'success' : o.financialHealthScore >= 40 ? 'warn' : 'danger'}>
          Health score {o.financialHealthScore}/100
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Monthly income" value={formatINR(o.monthlyIncome)} tone="positive" />
        <Stat label="Monthly expenses" value={formatINR(o.monthlyExpenses)} tone="negative" />
        <Stat label="Net savings" value={formatINR(o.netSavings)} tone={o.netSavings >= 0 ? 'positive' : 'negative'} />
        <Stat label="Budget used" value={`${o.budgetUtilization.toFixed(0)}%`} />
        <Stat label="Investments" value={formatINR(o.investmentPortfolio)} hint={`Gain ${formatINR(o.investmentGain)}`} />
        <Stat label="Assets" value={formatINR(o.totalAssets)} />
        <Stat label="Net worth" value={formatINR(o.netWorth)} />
        <Stat label="Cash flow" value={formatINR(o.cashFlow)} tone={o.cashFlow >= 0 ? 'positive' : 'negative'} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Mail-imported trades"
          value={String(o.importedTrades || data.mailImport?.tradesImported || 0)}
          hint={`${o.emailHoldings || 0} holdings from email`}
        />
        <Stat
          label="Imports this month"
          value={String(o.importJobsThisMonth || data.mailImport?.jobsThisMonth || 0)}
          hint={`${data.mailImport?.importedJobs || 0} successful jobs total`}
        />
        <Stat
          label="Invested capital"
          value={formatINR(o.investedAmount)}
          hint="Cost basis across portfolio"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <h2 className="mb-4 font-display text-lg font-semibold">Cash flow trend</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.cashFlowTrend}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f5c4c" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0f5c4c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="period"
                  tickFormatter={(v) => format(new Date(v), 'MMM')}
                  stroke="var(--color-ink-muted)"
                  fontSize={12}
                />
                <YAxis stroke="var(--color-ink-muted)" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip formatter={(v) => formatINR(Number(v))} />
                <Area type="monotone" dataKey="income" stroke="#0f5c4c" fill="url(#incomeFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" stroke="#c46b2b" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-display text-lg font-semibold">
            {allocData.length ? 'Portfolio mix' : 'Expense mix'}
          </h2>
          {(allocData.length ? allocData : pieData).length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocData.length ? allocData : pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {(allocData.length ? allocData : pieData).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No expenses yet" body="Add transactions to see your spending mix." />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-lg font-semibold">Recent transactions</h2>
          <div className="space-y-3">
            {data.recentTransactions.length ? (
              data.recentTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3 last:border-0">
                  <div>
                    <p className="font-medium">{t.description || t.category}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      {t.category} · {format(new Date(t.date), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <p className={t.type === 'income' ? 'font-semibold text-[var(--color-success)]' : 'font-semibold text-[var(--color-danger)]'}>
                    {t.type === 'income' ? '+' : '-'}
                    {formatINR(t.amount)}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState title="No activity" body="Your latest transactions will appear here." />
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Broker / MF imports</h2>
            <Link to="/mail-import" className="text-sm font-medium text-[var(--color-brand)]">
              Manage
            </Link>
          </div>
          <div className="space-y-3">
            {data.recentInvestmentTrades?.length ? (
              data.recentInvestmentTrades.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3 last:border-0">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      {t.side.toUpperCase()} · {t.asset_type.replace('_', ' ')} ·{' '}
                      {format(new Date(t.trade_date), 'dd MMM yyyy')}
                      {t.broker ? ` · ${t.broker}` : ''}
                    </p>
                  </div>
                  <p className="font-semibold">{formatINR(t.amount)}</p>
                </div>
              ))
            ) : data.upcomingPayments.length ? (
              data.upcomingPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3 last:border-0">
                  <div>
                    <p className="font-medium">{p.description || p.category}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">Due {format(new Date(p.next_due_date), 'dd MMM')}</p>
                  </div>
                  <p className="font-semibold">{formatINR(p.amount)}</p>
                </div>
              ))
            ) : (
              <EmptyState
                title="No imported trades yet"
                body="Connect Gmail or upload a contract note / CAS from Mail import."
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
