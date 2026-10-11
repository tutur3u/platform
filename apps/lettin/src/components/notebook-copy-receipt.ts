// Browser-session receipts contain mutation identifiers, never notebook content.
export type CopyReceipt = {
  previewId: string;
  status: 'unknown' | 'confirmed';
  worldId?: string;
};
export function copyReceiptKey(actorId: string, wsId: string, worldId: string) {
  return `lettin-notebook-copy:v1:${JSON.stringify([actorId, wsId, worldId])}`;
}
export function readCopyReceipt(key: string): CopyReceipt | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === 'object' &&
      'previewId' in value &&
      typeof value.previewId === 'string' &&
      'status' in value &&
      value.status === 'confirmed' &&
      'worldId' in value &&
      typeof value.worldId === 'string' &&
      /^[a-zA-Z0-9-]{1,128}$/.test(value.worldId)
    ) {
      return {
        previewId: value.previewId,
        status: 'confirmed',
        worldId: value.worldId,
      };
    }
    if (
      value &&
      typeof value === 'object' &&
      'previewId' in value &&
      typeof value.previewId === 'string' &&
      'status' in value &&
      value.status === 'unknown'
    ) {
      return { previewId: value.previewId, status: 'unknown' };
    }
  } catch {
    // An unreadable receipt cannot certify that an earlier mutation did not run.
  }
  return { previewId: '', status: 'unknown' };
}
export function writeCopyReceipt(key: string, value: CopyReceipt) {
  sessionStorage.setItem(key, JSON.stringify(value));
}
export function clearExpiredCopyReceipt(
  key: string,
  previewId: string
): boolean {
  try {
    const receipt = readCopyReceipt(key);
    if (receipt?.previewId !== previewId || receipt.status !== 'unknown')
      return false;
    sessionStorage.removeItem(key);
    return sessionStorage.getItem(key) === null;
  } catch {
    return false;
  }
}
