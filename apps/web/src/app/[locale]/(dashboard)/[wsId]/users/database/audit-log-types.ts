export type AuditLogPeriod = 'monthly' | 'yearly';
export type AuditLogStatusFilter = 'all' | 'active' | 'archived';

export interface AuditLogEntry {
  id: string;
  user_id: string;
  ws_id: string;
  archived: boolean;
  archived_until: string | null;
  creator_id: string;
  created_at: string;
  user_full_name?: string | null;
  creator_full_name?: string | null;
}

export interface AuditLogTimeOption {
  value: string;
  label: string;
}

export interface AuditLogChartStat {
  key: string;
  label: string;
  tooltipLabel: string;
  totalCount: number;
  archivedCount: number;
  activeCount: number;
}

export interface AuditLogInsightSummary {
  totalChanges: number;
  archivedCount: number;
  activeCount: number;
  affectedUsersCount: number;
  topActorName: string | null;
  topActorCount: number;
  topUserName: string | null;
  topUserCount: number;
  peakBucketLabel: string | null;
  peakBucketCount: number;
}
