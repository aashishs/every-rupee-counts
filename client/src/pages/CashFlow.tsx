import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { formatINR } from '../lib/utils';
import { Card, EmptyState, PageHeader, Select, Stat } from '../components/ui';

export function CashFlowPage() {
  const [group, setGroup] = useState('month');
  const [rows, setRows] = useState<Array<{ period: string; income: string; expense: string }>>([]);

  useEffect(() => {
    api
      .get('/dashboard/reports', { params: { group } })
      .then((res) => setRows(res.data.cashFlow || []))
      .catch(() => setRows([]));
  }, [group]);

  const chart = rows.map((r) => ({
    period: r.period,
    income: Number(r.income),
    expense: Number(r.expense),
    net: Number(r.income) - Number(r.expense),
  }));

  const totals = chart.reduce(
    (acc, r) => ({
      income: acc.income + r.income,
      expense: acc.expense + r.expense,
      net: acc.net + r.net,
    }),
    { income: 0, expense: 0, net: 0 }
  );

  return (
    <div>
      <PageHeader
        title="Cash Flow"
        subtitle="Income vs expenses over time — weekly, monthly, or yearly."
        actions={
          <Select value={group} onChange={(e) => setGroup(e.target.value)} className="w-40">
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </Select>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Total income" value={formatINR(totals.income)} tone="positive" />
        <Stat label="Total expenses" value={formatINR(totals.expense)} tone="negative" />
        <Stat label="Net cash flow" value={formatINR(totals.net)} tone={totals.net >= 0 ? 'positive' : 'negative'} />
      </div>

      {chart.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-display text-lg">Income vs expense</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="period" tickFormatter={(v) => format(new Date(v), group === 'year' ? 'yyyy' : 'MMM yy')} fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                  <Legend />
                  <Bar dataKey="income" fill="#0f5c4c" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expense" fill="#c46b2b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 font-display text-lg">Net cash flow</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="period" tickFormatter={(v) => format(new Date(v), group === 'year' ? 'yyyy' : 'MMM yy')} fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                  <Line type="monotone" dataKey="net" stroke="#2f6fed" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : (
        <EmptyState title="No cash flow data" body="Add income and expenses to unlock trends." />
      )}
    </div>
  );
}
