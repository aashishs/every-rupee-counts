import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);

  async function load() {
    try {
      await api.post('/notifications/generate');
      const { data } = await api.get('/notifications');
      setItems(data.notifications);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    await load();
  }

  async function markAll() {
    await api.post('/notifications/read-all');
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Recurring reminders, budget warnings, and monthly summaries."
        actions={
          <Button variant="secondary" onClick={markAll}>
            Mark all read
          </Button>
        }
      />

      <div className="space-y-3">
        {items.length ? (
          items.map((n) => (
            <Card key={n.id} className={n.is_read ? 'opacity-70' : ''}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{n.title}</p>
                    <Badge tone={n.type.includes('budget') ? 'warn' : 'neutral'}>{n.type.replace('_', ' ')}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{n.message}</p>
                  <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                    {format(new Date(n.created_at), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
                {!n.is_read ? (
                  <Button variant="ghost" onClick={() => markRead(n.id)}>
                    Mark read
                  </Button>
                ) : null}
              </div>
            </Card>
          ))
        ) : (
          <EmptyState title="All quiet" body="Alerts for budgets and upcoming payments will show up here." />
        )}
      </div>
    </div>
  );
}
