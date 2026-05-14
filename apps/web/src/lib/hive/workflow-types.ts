export type {
  HiveWorkflow,
  HiveWorkflowDefinition,
  HiveWorkflowEdge,
  HiveWorkflowNode,
  HiveWorkflowNodeType,
  HiveWorkflowPayload,
  HiveWorkflowRun,
  HiveWorkflowRunPayload,
  HiveWorkflowRunStatus,
  HiveWorkflowStepTrace,
} from '@tuturuuu/internal-api/hive';

export type HiveWorkflowRow = {
  archived_at: string | null;
  created_at: string;
  created_by: string | null;
  definition: unknown;
  description: string | null;
  enabled: boolean;
  id: string;
  name: string;
  server_id: string;
  updated_at: string;
  updated_by: string | null;
  version: number;
};

export type HiveWorkflowRunRow = {
  actor_user_id: string | null;
  created_at: string;
  error: string | null;
  finished_at: string | null;
  id: string;
  input: unknown;
  output: unknown;
  server_id: string;
  started_at: string;
  status: 'completed' | 'failed' | 'running';
  step_trace: unknown;
  workflow_id: string;
};
