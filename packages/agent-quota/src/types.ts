export type Provider = 'codex' | 'claude' | 'antigravity';
export type WindowKind = 'short' | 'long' | 'session' | 'weekly';

export interface UsageWindow {
  kind: WindowKind;
  id?: string;
  label?: string;
  scope?: { kind: 'account' | 'models' | 'unknown'; modelPrefixes?: string[] };
  usedPercent?: number;
  estimated?: number;
  resetsAt?: string | null;
  source: string;
  confidence?: 'provider' | 'manual';
  observedAt: string;
  authoritative: boolean;
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
}

export interface ActiveAssignment {
  instanceId: string;
  count: number;
  reservationIds?: string[];
}

export interface TaskRequest {
  kind?: 'implementation' | 'analysis' | 'review' | 'research';
  provider?: Provider | 'any';
  model?: string;
  weight?: number;
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
  eligible: boolean;
  reasons: RecommendationReason[];
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
