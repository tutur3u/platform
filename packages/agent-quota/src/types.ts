export type Provider = 'codex' | 'claude';
export type WindowKind = 'short' | 'long' | 'session' | 'weekly';

export interface UsageWindow {
  kind: WindowKind;
  usedPercent?: number;
  estimated?: number;
  resetsAt?: string;
  source: string;
  observedAt: string;
  authoritative: boolean;
}

export interface AccountUsage {
  instanceId: string;
  provider: Provider;
  label: string;
  windows: UsageWindow[];
  recentTokens?: { input: number; output: number; observedAt: string };
  lastError?: string;
}

export interface ActiveAssignment {
  instanceId: string;
  count: number;
}

export interface TaskRequest {
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
  score: number;
  eligible: boolean;
  reasons: RecommendationReason[];
}

export interface Recommendation {
  ranked: RankedInstance[];
  selected: RankedInstance[];
}

export const DEFAULT_INSTANCE_LABELS: Record<string, string> = {
  codex_ai4ed: 'aiedu',
  codex: 'skora',
  claudeAgent: 'hehe',
  claude_mira: 'kv',
  claude_kv: 'mira',
  claude_dd: 'soc',
  claude_hehe: 'skora',
};
