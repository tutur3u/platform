import type { QuotaBlock } from './block-ledger';
import type { AccountUsage, ActiveAssignment, TaskRequest } from './types';

export interface AdmissionRequest {
  requestId: string;
  threadId: string;
  currentInstanceId: string;
  recovery?: {
    threadId: string;
    runId: string;
    failure: 'usage-limit' | 'capacity' | 'auth' | 'other';
  };
  requirements: {
    capability: NonNullable<TaskRequest['kind']>;
    authorizedInstanceIds: string[];
    privacyApprovedInstanceIds: string[];
    candidates: { instanceId: string; model: string; capabilities: string[] }[];
    authorInstanceId?: string;
    taskClass?: 'mechanical' | 'standard' | 'security-review';
  };
  policy: {
    orchestratorReservePercent: number;
    nearUsedPercent: number;
    unknownMaxConcurrent: number;
    preferenceWeights?: Record<string, number>;
    orchestratorRole?: 'main' | 'child';
    allowNonClaudeFallback?: boolean;
  };
}
export interface Observation {
  model?: string;
  windowScope?: import('./types').UsageWindow['scope'];
  clearedAt?: string;
  eventId: string;
  instanceId: string;
  accountKey: string;
  outcome: 'success' | 'usage-limit' | 'capacity-error';
  observedAt: string;
  resetsAt?: string;
  nextEligibleAt?: string;
  requestId?: string;
  terminal?: boolean;
  nativeReservationId?: string;
}
export interface Reservation {
  requestId: string;
  threadId: string;
  instanceId: string;
  accountKey: string;
  model: string;
  createdAt: string;
  expiresAt?: string;
  nativeReservationId?: string;
}
export interface SwitchLease {
  threadId: string;
  accountKey: string;
  attemptId: string;
  pid: number;
  processStartedAt: string;
  acquiredAt: string;
  expiresAt: string;
}
export interface FutureQuarantine {
  quarantinedAt: string;
  latestReceiptAt?: string;
  models: string[];
  accountWide: boolean;
}
export interface HookLedger {
  poolHolds?: Record<string, boolean>;
  lastAdmissions?: Record<string, number>;
  futureQuarantines?: Record<string, FutureQuarantine | string>;
  version: 1;
  observations: Observation[];
  retiredRequests?: { requestId: string; retiredAt: string }[];
  reservations: Reservation[];
  leases: SwitchLease[];
  leaseHistory: {
    action: 'acquire' | 'release' | 'expired-takeover' | 'expired';
    at: string;
    lease: SwitchLease;
  }[];
}
export interface AdmissionContext {
  poolSettings?: Record<string, import('./pool-settings').PoolSettings>;
  blocks?: QuotaBlock[];
  accounts: AccountUsage[];
  active: ActiveAssignment[];
  ledger: HookLedger;
  now: Date;
}
export interface SwitchEvidence {
  threadId: string;
  attemptId: string;
  accountKey: string;
  observedAt: string;
  threadIdle: boolean;
  queue: { threadId: string; complete: boolean; items: string[] };
  unfinishedWriterIds: string[];
  backgroundJobIds: string[];
  children: { preserved: boolean; ids: string[] };
  watches: { preserved: boolean; ids: string[] };
  uncertainMutationIds: string[];
}
