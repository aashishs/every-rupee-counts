import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface LocalTransaction {
  id: string;
  client_id: string;
  type: 'expense' | 'income';
  amount: number;
  category: string;
  description?: string;
  notes?: string;
  tags?: string[];
  date: string;
  is_recurring?: boolean;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean;
}

export interface LocalInvestment {
  id: string;
  client_id: string;
  name: string;
  type: string;
  invested_amount: number;
  current_value: number;
  purchase_date?: string;
  notes?: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean;
}

export interface LocalAsset {
  id: string;
  client_id: string;
  name: string;
  category: string;
  purchase_date?: string;
  purchase_value: number;
  current_value: number;
  notes?: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean;
}

export interface LocalBudget {
  id: string;
  client_id: string;
  category: string;
  amount: number;
  month: string;
  alert_threshold?: number;
  updated_at: string;
  dirty?: boolean;
}

export interface LocalRecurring {
  id: string;
  client_id: string;
  type: 'expense' | 'income';
  amount: number;
  category: string;
  description?: string;
  frequency: string;
  start_date: string;
  next_due_date: string;
  is_paused?: boolean;
  auto_enter?: boolean;
  reminder_enabled?: boolean;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean;
}

interface ERCDB extends DBSchema {
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
  transactions: {
    key: string;
    value: LocalTransaction;
    indexes: { 'by-date': string; 'by-dirty': number };
  };
  investments: {
    key: string;
    value: LocalInvestment;
  };
  assets: {
    key: string;
    value: LocalAsset;
  };
  budgets: {
    key: string;
    value: LocalBudget;
  };
  recurring: {
    key: string;
    value: LocalRecurring;
  };
}

let dbPromise: Promise<IDBPDatabase<ERCDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ERCDB>('every-rupee-counts', 1, {
      upgrade(db) {
        db.createObjectStore('meta', { keyPath: 'key' });
        const tx = db.createObjectStore('transactions', { keyPath: 'id' });
        tx.createIndex('by-date', 'date');
        tx.createIndex('by-dirty', 'dirty');
        db.createObjectStore('investments', { keyPath: 'id' });
        db.createObjectStore('assets', { keyPath: 'id' });
        db.createObjectStore('budgets', { keyPath: 'id' });
        db.createObjectStore('recurring', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function setMeta(key: string, value: unknown) {
  const db = await getDB();
  await db.put('meta', { key, value });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const row = await db.get('meta', key);
  return row?.value as T | undefined;
}

export async function putMany<T extends { id: string }>(
  store: 'transactions' | 'investments' | 'assets' | 'budgets' | 'recurring',
  items: T[]
) {
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  await Promise.all(items.map((item) => tx.store.put(item as never)));
  await tx.done;
}

export async function getAllActive<T extends { deleted_at?: string | null }>(
  store: 'transactions' | 'investments' | 'assets' | 'budgets' | 'recurring'
) {
  const db = await getDB();
  const all = await db.getAll(store);
  return (all as unknown as T[]).filter((i) => !i.deleted_at);
}

export async function exportLocalSnapshot() {
  const db = await getDB();
  const [transactions, investments, assets, budgets, recurring, version] = await Promise.all([
    db.getAll('transactions'),
    db.getAll('investments'),
    db.getAll('assets'),
    db.getAll('budgets'),
    db.getAll('recurring'),
    getMeta<number>('sync_version'),
  ]);
  return {
    version: version || 1,
    exported_at: new Date().toISOString(),
    transactions,
    investments,
    assets,
    budgets,
    recurring,
  };
}

export async function importLocalSnapshot(snapshot: Awaited<ReturnType<typeof exportLocalSnapshot>>) {
  await putMany('transactions', snapshot.transactions);
  await putMany('investments', snapshot.investments);
  await putMany('assets', snapshot.assets);
  await putMany('budgets', snapshot.budgets);
  await putMany('recurring', snapshot.recurring);
  await setMeta('sync_version', snapshot.version);
  await setMeta('last_sync_at', snapshot.exported_at);
}
