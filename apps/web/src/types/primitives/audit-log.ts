export interface AuditLog {
  id: number;
  record_id?: string | null;
  old_record_id?: string | null;
  op: Operation;
  table_oid?: number;
  table_schema?: string;
  table_name: string;
  record?: unknown;
  old_record?: unknown;
  ts?: string;
  auth_uid?: string;
  auth_role?: string;
  ws_id?: string;
}

export type Operation = 'INSERT' | 'UPDATE' | 'DELETE';
