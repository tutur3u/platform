import { answersAs, peerUrlAllowed } from './peer-lanes.mjs';
import { normalizeT3Accounting, normalizeT3Quota } from './usage-normalize.mjs';

const ZONE = 'Asia/Ho_Chi_Minh';
const DAY_MS = 86_400_000;
const MAX_FRAME = 2 * 1024 * 1024;
const RPC_TIMEOUT_MS = 6_000;

function dayInIct(now) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: ZONE }).format(now);
}

function readUsageRpc(url, { openSocket, signal, now }) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const socket = openSocket(url);
    socket.binaryType = 'arraybuffer';
    const pending = new Set(['quota', 'accounting']);
    const results = { quota: null, accounting: null };
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      signal.removeEventListener('abort', abort);
      socket.removeEventListener('open', start);
      socket.removeEventListener('message', accept);
      socket.removeEventListener('error', fail);
      socket.removeEventListener('close', fail);
      socket.close();
      if (error && pending.size === 2) reject(error);
      else resolve(results);
    };
    const abort = () => finish(new Error('usage_rpc_timeout'));
    const fail = () => finish(new Error('usage_rpc_disconnected'));
    const start = () => {
      try {
        const ask = (id, tag, payload) =>
          socket.send(
            JSON.stringify({ _tag: 'Request', id, tag, payload, headers: [] })
          );
        ask('quota', 'server.getConfig', {});
        ask('accounting', 'server.getUsageSummary', {
          sinceDay: dayInIct(new Date(now.getTime() - 6 * DAY_MS)),
          untilDay: dayInIct(now),
          timeZone: ZONE,
          resolution: 'day',
          provisional: true,
        });
      } catch {
        finish(new Error('usage_rpc_send_failed'));
      }
    };
    const accept = (event) => {
      const data = event.data;
      const length = typeof data === 'string' ? data.length : data?.byteLength;
      if (!Number.isSafeInteger(length) || length > MAX_FRAME) {
        return finish(new Error('usage_rpc_frame_invalid'));
      }
      try {
        const parsed = JSON.parse(
          typeof data === 'string'
            ? data
            : new TextDecoder('utf-8', { fatal: true }).decode(data)
        );
        const frames = Array.isArray(parsed) ? parsed : [parsed];
        if (frames.length > 64) throw new Error('usage_rpc_frame_invalid');
        for (const frame of frames) {
          if (frame?._tag !== 'Exit' || !pending.delete(frame.requestId))
            continue;
          if (frame.exit?._tag === 'Success') {
            results[frame.requestId] = frame.exit.value;
          }
        }
        if (!pending.size) finish();
      } catch {
        finish(new Error('usage_rpc_frame_invalid'));
      }
    };
    signal.addEventListener('abort', abort, { once: true });
    socket.addEventListener('open', start, { once: true });
    socket.addEventListener('message', accept);
    socket.addEventListener('error', fail, { once: true });
    socket.addEventListener('close', fail, { once: true });
  });
}

/** Connects only to the configured T3 environment using its scoped read bearer. */
export async function readT3Usage({
  origin,
  environmentId,
  bearer,
  now = new Date(),
  signal = AbortSignal.timeout(RPC_TIMEOUT_MS),
  fetchImpl = fetch,
  openSocket = (url) => new WebSocket(url),
}) {
  if (!peerUrlAllowed(origin)) throw new Error('usage_origin_invalid');
  const base = new URL(origin);
  if (base.username || base.password) throw new Error('usage_origin_invalid');
  if (
    !(await answersAs(base, environmentId, { fetchImpl, deadline: signal }))
  ) {
    throw new Error('usage_environment_mismatch');
  }
  const ticketResponse = await fetchImpl(
    new URL('/api/auth/websocket-ticket/rpc', base),
    {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}` },
      signal,
      redirect: 'error',
    }
  );
  if (!ticketResponse.ok) throw new Error('usage_ticket_refused');
  const { ticket } = await ticketResponse.json();
  if (typeof ticket !== 'string' || !ticket || ticket.length > 4096) {
    throw new Error('usage_ticket_invalid');
  }
  const url = new URL('/ws', base);
  url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('orchestrationProtocol', '2');
  url.searchParams.set('wsTicket', ticket);
  const result = await readUsageRpc(url, { openSocket, signal, now });
  return {
    ...normalizeT3Quota(result.quota, now),
    ...normalizeT3Accounting(result.accounting, { trackSources: true }),
  };
}
