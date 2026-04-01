export type {
  WorkspaceUserAuditChartStat as AuditLogChartStat,
  WorkspaceUserAuditEvent as AuditLogEntry,
  WorkspaceUserAuditEventKind as AuditLogEventKind,
  WorkspaceUserAuditEventKindFilter as AuditLogEventKindFilter,
  WorkspaceUserAuditPeriod as AuditLogPeriod,
  WorkspaceUserAuditSource as AuditLogSource,
  WorkspaceUserAuditSourceFilter as AuditLogSourceFilter,
  WorkspaceUserAuditSummary as AuditLogInsightSummary,
} from '@/lib/workspace-user-audit/normalize';

export interface AuditLogTimeOption {
  value: string;
  label: string;
}
