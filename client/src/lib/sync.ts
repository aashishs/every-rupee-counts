import { api } from './api';
import { decryptPayload, deriveKey, encryptPayload, getDeviceId } from './crypto';
import { exportLocalSnapshot, getMeta, importLocalSnapshot, setMeta } from './localDb';

export async function syncWithCloud(userSalt: string, token: string) {
  if (!navigator.onLine) {
    return { status: 'offline' as const };
  }

  const key = deriveKey(token.slice(0, 32) + userSalt, userSalt);
  const local = await exportLocalSnapshot();
  const localVersion = (await getMeta<number>('sync_version')) || local.version || 1;

  try {
    const { data } = await api.get('/sync/latest');
    const cloud = data.blob;

    if (cloud) {
      const cloudData = decryptPayload(cloud.encrypted_payload, cloud.iv, key);
      // LWW merge: prefer newer updated_at per entity by client_id
      const merged = mergeSnapshots(local, cloudData);
      const nextVersion = Math.max(localVersion, cloud.version) + 1;
      merged.version = nextVersion;
      await importLocalSnapshot(merged);

      const sealed = encryptPayload(merged, key);
      await api.post('/sync/push', {
        ...sealed,
        version: nextVersion,
        device_id: getDeviceId(),
      });
      await setMeta('sync_version', nextVersion);
      await setMeta('last_sync_at', new Date().toISOString());
      return { status: 'merged' as const, version: nextVersion };
    }

    const nextVersion = localVersion + 1;
    local.version = nextVersion;
    const sealed = encryptPayload(local, key);
    await api.post('/sync/push', {
      ...sealed,
      version: nextVersion,
      device_id: getDeviceId(),
    });
    await setMeta('sync_version', nextVersion);
    await setMeta('last_sync_at', new Date().toISOString());
    return { status: 'pushed' as const, version: nextVersion };
  } catch (err) {
    console.error('Sync failed', err);
    return { status: 'error' as const, error: err };
  }
}

function mergeByClientId<T extends { client_id?: string; id: string; updated_at: string; deleted_at?: string | null }>(
  local: T[],
  remote: T[]
) {
  const map = new Map<string, T>();
  for (const item of [...remote, ...local]) {
    const key = item.client_id || item.id;
    const existing = map.get(key);
    if (!existing || new Date(item.updated_at) >= new Date(existing.updated_at)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function mergeSnapshots(
  local: Awaited<ReturnType<typeof exportLocalSnapshot>>,
  remote: Awaited<ReturnType<typeof exportLocalSnapshot>>
) {
  return {
    version: Math.max(local.version || 1, remote.version || 1),
    exported_at: new Date().toISOString(),
    transactions: mergeByClientId(local.transactions, remote.transactions || []),
    investments: mergeByClientId(local.investments, remote.investments || []),
    assets: mergeByClientId(local.assets, remote.assets || []),
    budgets: mergeByClientId(local.budgets, remote.budgets || []),
    recurring: mergeByClientId(local.recurring, remote.recurring || []),
  };
}

export function scheduleDailySync(run: () => void) {
  const LAST = 'erc_last_auto_sync_day';
  const tick = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(LAST) !== today && navigator.onLine) {
      localStorage.setItem(LAST, today);
      run();
    }
  };
  tick();
  window.addEventListener('online', () => run());
  return window.setInterval(tick, 60 * 60 * 1000);
}
