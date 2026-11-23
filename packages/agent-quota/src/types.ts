export type Provider =
  | 'codex'
  | 'claude'
  | 'antigravity'
  | 'grok'
  | 'cursor'
  | 'opencode';
export type WindowKind = 'short' | 'long' | 'session' | 'weekly';
export type ModelFamily = 'opus' | 'sonnet' | 'haiku' | 'fable';
export type TaskKind =
  | 'implementation'
  | 'analysis'
  | 'review'
  | 'research'
  | 'design'
  | 'ui';

export interface UsageWindow {
  kind: WindowKind;
  providerWindowKind?: 'session' | 'weekly' | 'monthly' | 'other';
  freshnessTtlMs?: number;
  id?: string;
  label?: string;
  scope?: {
    kind: 'account' | 'models' | 'unknown';
    modelPrefixes?: string[];
    modelFamilies?: ModelFamily[];
  };
  usedPercent?: number;
  estimated?: number;
  resetsAt?: string | null;
  windowDurationMins?: number;
  source: string;
  confidence?: 'provider' | 'manual';
  observedAt: string;
  authoritative: boolean;
}

export interface BalanceTelemetry {
  remaining?: number;
  total?: number;
  used?: number;
  currency?: string;
  unit?: string;
  exhausted?: boolean;
  label?: string;
  source?: string;
}

export interface AccountUsage {
  instanceId: string;
  provider: Provider;
  label: string;
  windows: UsageWindow[];
  models?: string[];
  modelOptions?: Record<string, { id: string; values: (string | boolean)[] }[]>;
  accountIdentityHash?: string;
  alias?: string;
  instanceIds?: string[];
  available?: boolean;
  recentTokens?: { input: number; output: number; observedAt: string };
  lastError?: string;
  providerStatus?: string;
  statusMessage?: string;
  balance?: BalanceTelemetry;
  neverUseModels?: string[];
}

export interface ActiveAssignment {
  instanceId: string;
  count: number;
  reservationIds?: string[];
}

export interface TaskRequest {
  kind?: TaskKind;
  provider?: Provider | 'any';
  model?: string;
  weight?: number;
  allowFable?: boolean;
  nonPrivate?: boolean;
}

export interface AccountReserve {
  minRemainingPercent?: number;
  maxConcurrent?: number;
  excluded?: boolean;
}

export interface RecommendationReason {
  code: string;
  message: string;
}

export interface WindowPacing {
  windowId: string;
  label?: string;
  kind: WindowKind;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetsAt: string | null;
  msToReset: number | null;
  hoursToReset: number | null;
  glideFloorPercent: number | null;
  headroomAboveFloorPercent: number | null;
  burnRatePercentPerHour: number | null;
  observationCount: number;
  projectedExhaustionAt: string | null;
  projectedExhaustionBeforeReset: boolean | null;
  safeToAdmit: boolean;
  reasons: string[];
}

export interface AccountPacing {
  tightestRemainingPercent: number | null;
  soonestResetAt: string | null;
  soonestMsToReset: number | null;
  effectiveGlideFloorPercent: number | null;
  headroomAboveFloorPercent: number | null;
  burnRatePercentPerHour: number | null;
  projectedExhaustionAt: string | null;
  projectedExhaustionBeforeReset: boolean | null;
  safeToAdmit: boolean;
  recommendedMaxConcurrentLanes: number;
  remainingSafeLanes: number;
  reasons: string[];
  windows: WindowPacing[];
}

export interface RankedInstance {
  instanceId: string;
  provider: Provider;
  label: string;
  state: 'healthy' | 'near' | 'exhausted' | 'UNKNOWN';
  ageMs: number | null;
  ttlMs: number;
  activeCount: number;
  action: 'delegate' | 'drain' | 'wait';
  instanceIds: string[];
  score: number;
  unknownOrderHint?: number | null;
  eligible: boolean;
  reasons: RecommendationReason[];
  pacing?: AccountPacing;
  recommendedModel?: string;
  eligibleModels?: string[];
  excludedModels?: Array<{ model: string; reason: string }>;
  providerStatus?: string;
  statusMessage?: string;
  balance?: BalanceTelemetry;
}

export interface Recommendation {
  ranked: RankedInstance[];
  selected: RankedInstance[];
}

export const DEFAULT_INSTANCE_LABELS: Record<string, string> = {
  antigravity: 'Antigravity',
  codex_ai4ed: 'aiedu',
  codex: 'skora',
  claudeAgent: 'hehe',
  claude_mira: 'kv',
  claude_kv: 'mira',
  claude_dd: 'soc',
  claude_hehe: 'skora',
};
