import type { WorkspaceCronExecution, WorkspaceCronJob } from '@tuturuuu/types';

export type ManagedCronHttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export interface ManagedCronHeaderConfig {
  name?: string;
  secretName?: string | null;
  value?: string | null;
}

export type ManagedWorkspaceCronJob = Omit<WorkspaceCronJob, 'dataset_id'> & {
  dataset_id: string | null;
  endpoint_url: string | null;
  failure_count: number | null;
  headers_config: ManagedCronHeaderConfig[] | null;
  http_method: ManagedCronHttpMethod | null;
  last_run_at: string | null;
  last_status: string | null;
  next_run_at: string | null;
  retry_count: number | null;
  timeout_ms: number | null;
};

export type ManagedWorkspaceCronExecution = WorkspaceCronExecution & {
  duration_ms?: number | null;
  endpoint_url?: string | null;
  error?: string | null;
  href?: string;
  http_status?: number | null;
  job?: string | null;
  workspace_cron_jobs?: { name?: string | null } | null;
};
