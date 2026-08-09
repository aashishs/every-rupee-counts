import { useState } from 'react';
import { useAuth } from '../store/auth';
import { Button, Card, Label, PageHeader, Select } from '../components/ui';

export function SettingsPage() {
  const { user, setTheme, syncNow, lastSync, online } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function onTheme(theme: 'light' | 'dark' | 'system') {
    await setTheme(theme);
  }

  async function onSync() {
    setBusy(true);
    setMessage('');
    try {
      await syncNow();
      setMessage('Encrypted sync completed.');
    } catch {
      setMessage('Sync failed. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  async function requestNotifications() {
    if (!('Notification' in window)) {
      setMessage('Notifications are not supported in this browser.');
      return;
    }
    const permission = await Notification.requestPermission();
    setMessage(`Notification permission: ${permission}`);
    if (permission === 'granted') {
      new Notification('Every Rupee Counts', {
        body: 'Reminders are enabled on this device.',
        icon: '/icons/icon-192.png',
      });
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Theme, sync, and notification preferences." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold">Profile</h2>
          <p className="mt-2 text-sm">{user?.name}</p>
          <p className="text-sm text-[var(--color-ink-muted)]">{user?.email}</p>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">Currency: {user?.currency || 'INR'}</p>
        </Card>

        <Card>
          <h2 className="mb-3 font-display text-lg font-semibold">Appearance</h2>
          <Label>Theme</Label>
          <Select value={user?.theme || 'system'} onChange={(e) => onTheme(e.target.value as 'light' | 'dark' | 'system')}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </Card>

        <Card>
          <h2 className="mb-2 font-display text-lg font-semibold">Cloud sync</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Local data is encrypted before upload. Sync runs daily and whenever you reconnect.
          </p>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            Status: {online ? 'Online' : 'Offline'}
            {lastSync ? ` · Last sync ${new Date(lastSync).toLocaleString('en-IN')}` : ''}
          </p>
          <Button className="mt-4" onClick={onSync} disabled={!online || busy}>
            {busy ? 'Syncing…' : 'Sync now'}
          </Button>
        </Card>

        <Card>
          <h2 className="mb-2 font-display text-lg font-semibold">Push notifications</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Enable browser notifications for recurring payments and budget alerts.
          </p>
          <Button className="mt-4" variant="secondary" onClick={requestNotifications}>
            Enable notifications
          </Button>
        </Card>
      </div>

      {message ? <p className="mt-4 text-sm text-[var(--color-brand)]">{message}</p> : null}

      <Card className="mt-6">
        <h2 className="font-display text-lg font-semibold">Architecture ready for</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Bank linking, UPI import, SMS parsing, OCR receipts, family accounts, multi-currency, and CSV/Excel/PDF
          export — the data model and sync layer are designed to extend without rewrite.
        </p>
      </Card>
    </div>
  );
}
