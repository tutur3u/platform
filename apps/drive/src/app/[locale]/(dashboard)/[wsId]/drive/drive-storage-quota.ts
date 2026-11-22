export const DRIVE_QUOTA_WARNING_PERCENT = 90;

export type DriveQuotaTone = 'normal' | 'warning' | 'critical';

export type DriveQuotaState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      limit: number;
      percent: number;
      tone: DriveQuotaTone;
      used: number;
    };

export function getDriveQuotaTone(percent: number): DriveQuotaTone {
  if (percent >= 100) return 'critical';
  if (percent >= DRIVE_QUOTA_WARNING_PERCENT) return 'warning';
  return 'normal';
}

export function resolveDriveQuotaState(query: {
  data?: { storageLimit: number; totalSize: number; usagePercentage: number };
  status: 'pending' | 'error' | 'success';
}): DriveQuotaState {
  if (!query.data) {
    return query.status === 'error' ? { kind: 'error' } : { kind: 'loading' };
  }
  const percent = Math.max(0, query.data.usagePercentage);
  return {
    kind: 'ready',
    limit: query.data.storageLimit,
    percent,
    tone: getDriveQuotaTone(percent),
    used: query.data.totalSize,
  };
}

export const driveQuotaIndicator: Record<DriveQuotaTone, string> = {
  normal: 'bg-primary',
  warning: 'bg-dynamic-orange',
  critical: 'bg-destructive',
};
