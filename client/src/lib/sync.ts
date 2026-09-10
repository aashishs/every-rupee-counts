import { api } from './api';
import { decryptPayload, deriveKey, encryptPayload, getDeviceId } from './crypto';
import { exportLocalSnapshot, getMeta, importLocalSnapshot, setMeta } from './localDb';

export async function syncWithCloud(userSalt: string, token: string) {
  if (!navigator.onLine) {
    return { status: 'offline' as const };
  }

  const key = deriveKey(token.slice(0, 32) + userSalt, userSalt);

  try {
    return await pushMerged(key);
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    // Version race: pull again, bump past cloud, retry once
    if (status === 409) {
      try {
        return await pushMerged(key, true);
      } catch (retryErr) {
        console.error('Sync retry failed', retryErr);
        return { status: 'error' as const, error: retryErr };
      }
    }
    console.error('Sync failed', err);
    return { status: 'error' as const, error: err };
  }
}

async function pushMerged(key: string, forceBump = false) {
  const local = await exportLocalSnapshot();
  const localVersion = (await getMeta<number>('sync_version')) || local.version || 1;
  const { data } = await api.get('/sync/latest');
  const cloud = data.blob;

  let merged = local;
  let baseVersion = localVersion;

  if (cloud) {
    const cloudData = decryptPayload(cloud.encrypted_payload, cloud.iv, key);
    merged = mergeSnapshots(local, cloudData);
    baseVersion = Math.max(localVersion, Number(cloud.version) || 0);
  }

  if (forceBump && cloud) {
    baseVersion = Math.max(baseVersion, Number(cloud.version) || 0);
  }

  const nextVersion = baseVersion + 1;
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
  return { status: cloud ? ('merged' as const) : ('pushed' as const), version: nextVersion };
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
