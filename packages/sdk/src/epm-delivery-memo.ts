/**
 * Last-seen delivery ETag and body per (baseUrl, workspace), kept in module
 * memory so repeated public delivery reads can revalidate with If-None-Match
 * and reuse the body on a 304. Preview reads never use this memo.
 */
const MAX_ENTRIES = 64;

interface DeliveryMemoEntry {
  body: unknown;
  etag: string;
}

const memo = new Map<string, DeliveryMemoEntry>();

export function getDeliveryMemoKey(baseUrl: string, workspaceId: string) {
  return `${baseUrl.replace(/\/$/, '')}\u0000${workspaceId}`;
}

export function readDeliveryMemo(key: string) {
  return memo.get(key);
}

export function writeDeliveryMemo(key: string, entry: DeliveryMemoEntry) {
  // Re-insert so the Map iterates in least-recently-written order.
  memo.delete(key);
  memo.set(key, entry);

  while (memo.size > MAX_ENTRIES) {
    const oldest = memo.keys().next().value;
    if (oldest === undefined) break;
    memo.delete(oldest);
  }
}

export function clearEpmDeliveryMemo() {
  memo.clear();
}
