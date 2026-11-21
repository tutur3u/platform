import { postPrivateRpc } from './processors/maintenance-rpc';

type StopEnv = { SUPABASE_URL?: string; SUPABASE_SECRET_KEY?: string };

function isDatabaseOrigin(value: string) {
  try {
    const origin = new URL(value);
    const loopback =
      origin.hostname === '127.0.0.1' || origin.hostname === 'localhost';
    return (
      !origin.username &&
      !origin.password &&
      origin.pathname === '/' &&
      !origin.search &&
      !origin.hash &&
      (origin.protocol === 'https:' ||
        (loopback && origin.protocol === 'http:'))
    );
  } catch {
    return false;
  }
}

/** The ledger is already stopped when this function runs. A missing or
 * ambiguous database receipt leaves the operator action pending. */
export async function stopTaskRecurrence(env: StopEnv, fetcher: typeof fetch) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key || !isDatabaseOrigin(url)) return null;
  const now = Date.now;
  const context = {
    deadline: now() + 20_000,
    env: { SUPABASE_URL: url, SUPABASE_SECRET_KEY: key },
    fetch: fetcher,
    now,
  };

  try {
    const slot = Math.floor(now() / 900_000) * 900;
    const current = await postPrivateRpc(context, 'task_recurrence_probe', {
      p_slot: slot,
    });
    if (
      current.kind !== 'ok' ||
      typeof current.value !== 'object' ||
      current.value === null
    )
      return null;
    const probe = current.value as Record<string, unknown>;
    const epoch = probe.epoch;
    if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch < 1)
      return null;
    if (probe.request_enabled === false && probe.scheduler_enabled === false)
      return epoch;

    const stopped = await postPrivateRpc(
      context,
      'task_recurrence_disable_control',
      { p_expected_epoch: epoch }
    );
    if (
      stopped.kind !== 'ok' ||
      typeof stopped.value !== 'object' ||
      stopped.value === null
    )
      return null;
    const receipt = stopped.value as Record<string, unknown>;
    return receipt.request_enabled === false &&
      receipt.scheduler_enabled === false &&
      typeof receipt.epoch === 'number' &&
      Number.isSafeInteger(receipt.epoch) &&
      receipt.epoch >= epoch
      ? receipt.epoch
      : null;
  } catch {
    return null;
  }
}
