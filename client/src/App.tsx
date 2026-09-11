import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import { AppShell } from './components/AppShell';
import { LoginPage, RegisterPage } from './pages/Auth';
import { DashboardPage } from './pages/Dashboard';
import { TransactionsPage } from './pages/Transactions';
import { InvestmentsPage } from './pages/Investments';
import { AssetsPage } from './pages/Assets';
import { CashFlowPage } from './pages/CashFlow';
import { BudgetsPage } from './pages/Budgets';
import { RecurringPage } from './pages/Recurring';
import { ReportsPage } from './pages/Reports';
import { NotificationsPage } from './pages/Notifications';
import { SettingsPage } from './pages/Settings';
import { MailImportPage } from './pages/MailImport';

function Protected({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-[var(--color-ink-muted)]">
        Loading Every Rupee Counts…
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="loans" element={<LoansPage />} />
          <Route path="investments" element={<InvestmentsPage />} />
          <Route path="mail-import" element={<MailImportPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="cashflow" element={<CashFlowPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="recurring" element={<RecurringPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
