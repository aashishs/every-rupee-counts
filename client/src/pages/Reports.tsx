import { useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { formatINR } from '../lib/utils';
import { Card, EmptyState, Input, Label, PageHeader, Select } from '../components/ui';

const COLORS = ['#0f5c4c', '#c46b2b', '#2f6fed', '#8b5e3c', '#5b7c6a', '#b42318', '#1b7a4e'];

export function ReportsPage() {
  const [group, setGroup] = useState('month');
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<{
    expenseBreakdown: Array<{ category: string; total: string }>;
    incomeBreakdown: Array<{ category: string; total: string }>;
    cashFlow: Array<{ period: string; income: string; expense: string }>;
    investmentAllocation: Array<{ type: string; invested: string; current: string }>;
    assetBreakdown: Array<{ category: string; purchase: string; current: string }>;
  } | null>(null);

  useEffect(() => {
    api
      .get('/dashboard/reports', { params: { group, from, to } })
      .then((res) => setData(res.data))
      .catch(() => setData(null));
  }, [group, from, to]);

  return (
    <div>
      <PageHeader title="Reports & Analytics" subtitle="Daily to yearly insights across spend, income, investments, and assets." />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div>
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label>Group by</Label>
          <Select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Yearly</option>
          </Select>
        </div>
      </div>

      {!data ? (
        <EmptyState title="No report data" body="Connect to the API or add transactions to generate reports." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-display text-lg">Expense breakdown</h2>
            <BreakdownChart data={data.expenseBreakdown.map((d) => ({ name: d.category, value: Number(d.total) }))} />
          </Card>
          <Card>
            <h2 className="mb-3 font-display text-lg">Income breakdown</h2>
            <BreakdownChart data={data.incomeBreakdown.map((d) => ({ name: d.category, value: Number(d.total) }))} />
          </Card>
          <Card className="lg:col-span-2">
            <h2 className="mb-3 font-display text-lg">Cash flow</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.cashFlow.map((r) => ({
                    period: format(new Date(r.period), 'dd MMM'),
                    income: Number(r.income),
                    expense: Number(r.expense),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="period" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                  <Bar dataKey="income" fill="#0f5c4c" />
                  <Bar dataKey="expense" fill="#c46b2b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 font-display text-lg">Investment allocation</h2>
            <BreakdownChart
              data={data.investmentAllocation.map((d) => ({ name: d.type, value: Number(d.current) }))}
            />
          </Card>
          <Card>
            <h2 className="mb-3 font-display text-lg">Asset appreciation</h2>
            <div className="space-y-3">
              {data.assetBreakdown.length ? (
                data.assetBreakdown.map((a) => (
                  <div key={a.category} className="flex items-center justify-between text-sm">
                    <span>{a.category}</span>
                    <span className="font-semibold">
                      {formatINR(a.current)}{' '}
                      <span className="text-[var(--color-ink-muted)]">from {formatINR(a.purchase)}</span>
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--color-ink-muted)]">No assets recorded.</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function BreakdownChart({ data }: { data: Array<{ name: string; value: number }> }) {
  if (!data.length) return <EmptyState title="Nothing here" body="No data for this range." />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => formatINR(Number(v))} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
