/**
 * In-isolate memo of the last validated delivery payload per delivery origin
 * and workspace. It lets the renderer revalidate with If-None-Match and skip
 * the download and parse on a 304. Public published data only.
 */
const MAX_ENTRIES = 16;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export type DeliveryMemoEntry<Payload> = {
  etag: string;
  payload: Payload;
  version?: string;
};

const memo = new Map<string, DeliveryMemoEntry<never>>();

export function deliveryMemoKey(origin: string, workspaceId: string) {
  return `${origin}\u0000${workspaceId}`;
}

export function readDeliveryMemo<Payload>(key: string) {
  return memo.get(key) as DeliveryMemoEntry<Payload> | undefined;
}

export function writeDeliveryMemo<Payload>(
  key: string,
  entry: DeliveryMemoEntry<Payload>
) {
  memo.delete(key);
  memo.set(key, entry as DeliveryMemoEntry<never>);
  while (memo.size > MAX_ENTRIES) {
    const oldest = memo.keys().next().value;
    if (oldest === undefined) break;
    memo.delete(oldest);
  }
}

export function forgetDeliveryMemo(key: string) {
  memo.delete(key);
}

export function clearDeliveryMemo() {
  memo.clear();
}

/** Delivery version from the response header, when present and well formed. */
export function readDeliveryVersion(response: Response) {
  const value = response.headers.get('x-tuturuuu-delivery-version');
  return value && VERSION_PATTERN.test(value) ? value : undefined;
}
