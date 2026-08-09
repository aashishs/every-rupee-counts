import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { ASSET_CATEGORIES } from '../lib/constants';
import { formatINR, pct, uid } from '../lib/utils';
import { getDB } from '../lib/localDb';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, TextArea } from '../components/ui';

interface Asset {
  id: string;
  name: string;
  category: string;
  purchase_date?: string;
  purchase_value: number | string;
  current_value: number | string;
  notes?: string;
  client_id?: string;
}

const empty = {
  name: '',
  category: 'House',
  purchase_date: '',
  purchase_value: '',
  current_value: '',
  notes: '',
};

export function AssetsPage() {
  const [items, setItems] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(empty);

  async function load() {
    try {
      const { data } = await api.get('/assets');
      setItems(data.assets);
      const db = await getDB();
      for (const a of data.assets) {
        await db.put('assets', {
          ...a,
          client_id: a.client_id || a.id,
          purchase_value: Number(a.purchase_value),
          current_value: Number(a.current_value),
          updated_at: a.updated_at || new Date().toISOString(),
        });
      }
    } catch {
      const db = await getDB();
      setItems((await db.getAll('assets')).filter((a) => !a.deleted_at));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totals = useMemo(() => {
    const purchase = items.reduce((s, i) => s + Number(i.purchase_value), 0);
    const current = items.reduce((s, i) => s + Number(i.current_value), 0);
    return { purchase, current, gain: current - purchase };
  }, [items]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      category: form.category,
      purchase_date: form.purchase_date || undefined,
      purchase_value: Number(form.purchase_value),
      current_value: Number(form.current_value || form.purchase_value),
      notes: form.notes,
      client_id: editing?.client_id || uid(),
    };
    try {
      if (editing) await api.put(`/assets/${editing.id}`, payload);
      else await api.post('/assets', payload);
    } catch {
      const db = await getDB();
      const id = editing?.id || uid();
      await db.put('assets', {
        id,
        ...payload,
        client_id: payload.client_id,
        updated_at: new Date().toISOString(),
        dirty: true,
      });
    }
    setOpen(false);
    setEditing(null);
    setForm(empty);
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this asset?')) return;
    try {
      await api.delete(`/assets/${id}`);
    } catch {
      const db = await getDB();
      const existing = await db.get('assets', id);
      if (existing) {
        await db.put('assets', {
          ...existing,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          dirty: true,
        });
      }
    }
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Assets"
        subtitle="House, vehicle, gold, and other physical or digital assets."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setForm(empty);
              setOpen(true);
            }}
          >
            Add asset
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Purchase value</p>
          <p className="mt-1 font-display text-2xl">{formatINR(totals.purchase)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Current value</p>
          <p className="mt-1 font-display text-2xl">{formatINR(totals.current)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-ink-muted)]">Appreciation</p>
          <p className={`mt-1 font-display text-2xl ${totals.gain >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
            {formatINR(totals.gain)}
          </p>
        </Card>
      </div>

      <div className="space-y-3">
        {items.length ? (
          items.map((a) => {
            const gain = Number(a.current_value) - Number(a.purchase_value);
            const change = Number(a.purchase_value) ? (gain / Number(a.purchase_value)) * 100 : 0;
            return (
              <Card key={a.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{a.name}</p>
                  <div className="mt-1 flex gap-2">
                    <Badge>{a.category}</Badge>
                    <Badge tone={gain >= 0 ? 'success' : 'danger'}>{pct(change)}</Badge>
                  </div>
                </div>
                <div className="text-sm sm:text-right">
                  <p>Bought {formatINR(a.purchase_value)}</p>
                  <p className="font-semibold">Now {formatINR(a.current_value)}</p>
                  <div className="mt-2">
                    <button
                      className="mr-3 text-[var(--color-brand)]"
                      onClick={() => {
                        setEditing(a);
                        setForm({
                          name: a.name,
                          category: a.category,
                          purchase_date: a.purchase_date?.slice(0, 10) || '',
                          purchase_value: String(a.purchase_value),
                          current_value: String(a.current_value),
                          notes: a.notes || '',
                        });
                        setOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button className="text-[var(--color-danger)]" onClick={() => remove(a.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState title="No assets yet" body="Track property, vehicles, jewellery, and more." />
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit asset' : 'Add asset'}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {ASSET_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Purchase date</Label>
            <Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
          </div>
          <div>
            <Label>Purchase value</Label>
            <Input type="number" required min="0" value={form.purchase_value} onChange={(e) => setForm({ ...form, purchase_value: e.target.value })} />
          </div>
          <div>
            <Label>Current market value</Label>
            <Input type="number" min="0" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} />
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
