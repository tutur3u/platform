import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AccountUsage, Provider, TaskKind, TaskRequest } from './types';

export interface PacingConfig {
  baseReservePercent: number;
  perHourReservePercent: number;
  referenceWindowMins: number;
  laneHeadroomStepPercent: number;
  defaultMaxConcurrentLanes: number;
  shortHistoryLookbackMs: number;
  longHistoryLookbackMs: number;
}

export interface TaskKindConfig {
  providerWeights: Partial<Record<Provider, number>>;
  preferredModelPrefixes: string[];
}

export interface RoutingConfig {
  version: 1;
  noTopUps: boolean;
  noCreditPurchases: boolean;
  pacing: PacingConfig;
  providers: {
    gemini: { modelPriority: string[]; forbiddenModels: string[] };
    claude: {
      requireApprovalModels: string[];
      designPreferredModels: string[];
    };
    opencode: {
      requireNonPrivate: boolean;
      subscriptionPrefixes: string[];
      paidZenPrefixes: string[];
      freeModelSuffixes: string[];
      forbidPaidZen: boolean;
    };
    grok: { allowCreditsTopUp: boolean };
    cursor: { allowCreditsTopUp: boolean };
  };
  taskKinds: Record<TaskKind, TaskKindConfig>;
}

const DEFAULT_CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'routing.config.json'
);
let cachedDefaultConfig: RoutingConfig | undefined;

function readRegularJson(path: string): unknown {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 256_000)
      throw new Error('routing-config-invalid');
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally {
    closeSync(fd);
  }
}

export function defaultRoutingConfig(): RoutingConfig {
  if (!cachedDefaultConfig) {
    cachedDefaultConfig = validateRoutingConfig(
      readRegularJson(DEFAULT_CONFIG_PATH)
    );
  }
  return cachedDefaultConfig;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

function stringList(value: unknown, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new Error('routing-config-invalid-list');
  return value;
}

function positiveOrZero(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error('routing-config-invalid-number');
  return value;
}

export function validateRoutingConfig(raw: unknown): RoutingConfig {
  if (!isRecord(raw) || raw.version !== 1)
    throw new Error('routing-config-invalid-version');
  const pacing = isRecord(raw.pacing) ? raw.pacing : {};
  const providers = isRecord(raw.providers) ? raw.providers : {};
  const gemini = isRecord(providers.gemini) ? providers.gemini : {};
  const claude = isRecord(providers.claude) ? providers.claude : {};
  const opencode = isRecord(providers.opencode) ? providers.opencode : {};
  const grok = isRecord(providers.grok) ? providers.grok : {};
  const cursor = isRecord(providers.cursor) ? providers.cursor : {};
  const taskKindsRaw = isRecord(raw.taskKinds) ? raw.taskKinds : {};
  const taskKinds: Record<TaskKind, TaskKindConfig> = {} as Record<
    TaskKind,
    TaskKindConfig
  >;
  for (const kind of [
    'implementation',
    'analysis',
    'review',
    'research',
    'design',
    'ui',
  ] as TaskKind[]) {
    const entry = isRecord(taskKindsRaw[kind]) ? taskKindsRaw[kind] : {};
    const weights = isRecord(entry.providerWeights)
      ? entry.providerWeights
      : {};
    const providerWeights: Partial<Record<Provider, number>> = {};
    for (const [k, v] of Object.entries(weights)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0)
        providerWeights[k as Provider] = v;
    }
    taskKinds[kind] = {
      providerWeights,
      preferredModelPrefixes: stringList(entry.preferredModelPrefixes, []),
    };
  }

  return {
    version: 1,
    noTopUps: raw.noTopUps !== false,
    noCreditPurchases: raw.noCreditPurchases !== false,
    pacing: {
      baseReservePercent: positiveOrZero(pacing.baseReservePercent, 3),
      perHourReservePercent: positiveOrZero(pacing.perHourReservePercent, 4),
      referenceWindowMins: Math.max(
        1,
        positiveOrZero(pacing.referenceWindowMins, 300)
      ),
      laneHeadroomStepPercent: Math.max(
        1,
        positiveOrZero(pacing.laneHeadroomStepPercent, 15)
      ),
      defaultMaxConcurrentLanes: Math.max(
        1,
        Math.floor(positiveOrZero(pacing.defaultMaxConcurrentLanes, 4))
      ),
      shortHistoryLookbackMs: Math.max(
        60_000,
        positiveOrZero(pacing.shortHistoryLookbackMs, 3_600_000)
      ),
      longHistoryLookbackMs: Math.max(
        60_000,
        positiveOrZero(pacing.longHistoryLookbackMs, 86_400_000)
      ),
    },
    providers: {
      gemini: {
        modelPriority: stringList(gemini.modelPriority, [
          'gemini-4-hydrogen',
          'gemini-4-neon',
          'gemini-3.8-flash',
        ]),
        forbiddenModels: stringList(gemini.forbiddenModels, [
          'gemini-4-argon*',
          'gemini-pro-orchestrator-g1-pro*',
        ]),
      },
      claude: {
        requireApprovalModels: stringList(claude.requireApprovalModels, [
          '*fable*',
        ]),
        designPreferredModels: stringList(claude.designPreferredModels, [
          'claude-opus-*',
        ]),
      },
      opencode: {
        requireNonPrivate: opencode.requireNonPrivate !== false,
        subscriptionPrefixes: stringList(opencode.subscriptionPrefixes, [
          'opencode-go/',
        ]),
        paidZenPrefixes: stringList(opencode.paidZenPrefixes, ['opencode/']),
        freeModelSuffixes: stringList(opencode.freeModelSuffixes, ['-free']),
        forbidPaidZen: opencode.forbidPaidZen !== false,
      },
      grok: { allowCreditsTopUp: grok.allowCreditsTopUp === true },
      cursor: { allowCreditsTopUp: cursor.allowCreditsTopUp === true },
    },
    taskKinds,
  };
}

export function loadRoutingConfig(
  overridePath = process.env.AGENT_QUOTA_ROUTING_CONFIG
): RoutingConfig {
  const base = defaultRoutingConfig();
  if (!overridePath) return base;
  const override = validateRoutingConfig(readRegularJson(overridePath));
  return {
    ...base,
    ...override,
    pacing: { ...base.pacing, ...override.pacing },
    providers: {
      gemini: { ...base.providers.gemini, ...override.providers.gemini },
      claude: { ...base.providers.claude, ...override.providers.claude },
      opencode: { ...base.providers.opencode, ...override.providers.opencode },
      grok: { ...base.providers.grok, ...override.providers.grok },
      cursor: { ...base.providers.cursor, ...override.providers.cursor },
    },
    taskKinds: { ...base.taskKinds, ...override.taskKinds },
  };
}

export function matchGlob(pattern: string, value: string): boolean {
  const regex = pattern
    .split('')
    .map((char) =>
      char === '*'
        ? '.*'
        : char === '?'
          ? '.'
          : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('');
  return new RegExp(`^${regex}$`, 'i').test(value);
}

export type OpenCodeTier = 'subscription' | 'free-zen' | 'paid-zen' | 'other';

export function opencodeModelTier(
  model: string,
  config = defaultRoutingConfig()
): OpenCodeTier {
  const lower = model.toLowerCase();
  if (
    config.providers.opencode.subscriptionPrefixes.some((p) =>
      lower.startsWith(p.toLowerCase())
    )
  )
    return 'subscription';
  if (
    config.providers.opencode.paidZenPrefixes.some((p) =>
      lower.startsWith(p.toLowerCase())
    )
  ) {
    return config.providers.opencode.freeModelSuffixes.some((s) =>
      lower.endsWith(s.toLowerCase())
    )
      ? 'free-zen'
      : 'paid-zen';
  }
  return 'other';
}

export interface ModelPolicyDecision {
  allowed: boolean;
  neverUse: boolean;
  requiresApproval: boolean;
  requiresNonPrivate: boolean;
  reasons: string[];
  priorityRank: number;
}

export function evaluateModelPolicy(
  provider: Provider,
  model: string | undefined,
  task: Pick<TaskRequest, 'kind' | 'allowFable' | 'nonPrivate'>,
  config = defaultRoutingConfig()
): ModelPolicyDecision {
  const reasons: string[] = [];
  let neverUse = false;
  let requiresApproval = false;
  let requiresNonPrivate = false;

  if (
    provider === 'opencode' &&
    config.providers.opencode.requireNonPrivate &&
    task.nonPrivate !== true
  ) {
    requiresNonPrivate = true;
    reasons.push('opencode-requires-non-private');
  }
  if (model) {
    if (
      config.providers.gemini.forbiddenModels.some((p) => matchGlob(p, model))
    ) {
      neverUse = true;
      reasons.push('model-forbidden-by-policy');
    }
    if (
      config.providers.claude.requireApprovalModels.some((p) =>
        matchGlob(p, model)
      ) &&
      task.allowFable !== true
    ) {
      requiresApproval = true;
      reasons.push('fable-requires-user-approval');
    }
    if (
      provider === 'opencode' &&
      opencodeModelTier(model, config) === 'paid-zen' &&
      config.providers.opencode.forbidPaidZen
    ) {
      neverUse = true;
      reasons.push('opencode-paid-zen-forbidden');
    }
  }
  return {
    allowed: !neverUse && !requiresApproval && !requiresNonPrivate,
    neverUse,
    requiresApproval,
    requiresNonPrivate,
    reasons,
    priorityRank: modelPriorityScore(provider, model, task.kind, config),
  };
}

export function modelPriorityScore(
  provider: Provider,
  model: string | undefined,
  kind: TaskKind | undefined,
  config = defaultRoutingConfig()
): number {
  if (!model) return 0;
  const lower = model.toLowerCase();
  let score = 0;
  const geminiIndex = config.providers.gemini.modelPriority.findIndex((p) =>
    lower.startsWith(p.toLowerCase())
  );
  if (geminiIndex >= 0)
    score += (config.providers.gemini.modelPriority.length - geminiIndex) * 20;
  if (
    (kind === 'design' || kind === 'ui') &&
    config.providers.claude.designPreferredModels.some((p) =>
      matchGlob(p, model)
    )
  )
    score += 50;
  const taskCfg = kind ? config.taskKinds[kind] : undefined;
  const prefIndex = taskCfg?.preferredModelPrefixes.findIndex((p) =>
    lower.startsWith(p.toLowerCase())
  );
  if (prefIndex !== undefined && prefIndex >= 0 && taskCfg)
    score += (taskCfg.preferredModelPrefixes.length - prefIndex) * 15;
  if (
    provider === 'opencode' &&
    opencodeModelTier(model, config) === 'subscription'
  )
    score += 25;
  return score;
}

export function topUpsForbidden(
  provider: Provider,
  config: RoutingConfig = defaultRoutingConfig()
): boolean {
  if (config.noTopUps || config.noCreditPurchases) return true;
  if (provider === 'grok') return !config.providers.grok.allowCreditsTopUp;
  if (provider === 'cursor') return !config.providers.cursor.allowCreditsTopUp;
  return false;
}

export function selectAccountModels(
  account: Pick<AccountUsage, 'provider' | 'models'>,
  task: Pick<TaskRequest, 'kind' | 'model' | 'allowFable' | 'nonPrivate'>,
  config = defaultRoutingConfig()
): {
  recommendedModel?: string;
  eligibleModels: string[];
  excludedModels: Array<{ model: string; reason: string }>;
} {
  const models = account.models ?? [];
  if (!models.length) return { eligibleModels: [], excludedModels: [] };
  const eligible: Array<{ model: string; score: number }> = [];
  const excludedModels: Array<{ model: string; reason: string }> = [];
  for (const model of models) {
    const decision = evaluateModelPolicy(account.provider, model, task, config);
    if (!decision.allowed) {
      excludedModels.push({
        model,
        reason: decision.reasons[0] ?? 'excluded-by-policy',
      });
    } else {
      eligible.push({ model, score: decision.priorityRank });
    }
  }
  eligible.sort((a, b) => b.score - a.score);
  return {
    recommendedModel: eligible[0]?.model,
    eligibleModels: eligible.map((item) => item.model),
    excludedModels,
  };
}
