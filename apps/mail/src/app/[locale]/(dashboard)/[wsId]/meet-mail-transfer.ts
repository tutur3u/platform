import {
  HANDOFF_WINDOW_MS,
  type MeetMailHandoff,
} from '@tuturuuu/utils/meet-mail-handoff';
export const MAIL_TRANSFER_PREFIX = '#mail-transfer=';
const idPattern =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
export function transferId(hash: string) {
  const id = hash.slice(MAIL_TRANSFER_PREFIX.length);
  return hash.startsWith(MAIL_TRANSFER_PREFIX) && idPattern.test(id)
    ? id
    : null;
}
/** Channels carry untrusted draft data; the receiver still validates actor, workspace and expiry. */
export function openMailTransfer(
  target: URL,
  raw: string,
  value: MeetMailHandoff
) {
  if (typeof BroadcastChannel === 'undefined')
    throw new Error('Private tab transfer unavailable');
  const id = crypto.randomUUID();
  const channel = new BroadcastChannel(`mail-transfer-v1:${id}`);
  let finished = false;
  const close = () => {
    if (!finished) {
      finished = true;
      channel.onmessage = null;
      channel.close();
      clearTimeout(timer);
    }
  };
  const timer = setTimeout(
    close,
    Math.min(
      60_000,
      Math.max(0, value.issuedAt + HANDOFF_WINDOW_MS - Date.now())
    )
  );
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data !== 'ready' || finished) return;
    if (Date.now() - value.issuedAt <= HANDOFF_WINDOW_MS)
      channel.postMessage({ v: 1, raw });
    close();
  };
  target.hash = `${MAIL_TRANSFER_PREFIX}${id}`;
  try {
    window.open(target.href, '_blank', 'noopener,noreferrer');
  } catch (error) {
    close();
    throw error;
  }
  return close;
}
export function receiveMailTransfer(
  id: string,
  receive: (raw: string) => void
) {
  if (!idPattern.test(id) || typeof BroadcastChannel === 'undefined')
    throw new Error('Private tab transfer unavailable');
  const channel = new BroadcastChannel(`mail-transfer-v1:${id}`);
  let finished = false;
  const close = () => {
    if (!finished) {
      finished = true;
      channel.onmessage = null;
      channel.close();
      clearTimeout(timer);
    }
  };
  const timer = setTimeout(close, 60_000);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (
      finished ||
      typeof data !== 'object' ||
      data === null ||
      !('v' in data) ||
      data.v !== 1 ||
      !('raw' in data) ||
      typeof data.raw !== 'string' ||
      data.raw.length > 16_384
    )
      return;
    close();
    receive(data.raw);
  };
  channel.postMessage('ready');
  return close;
}
