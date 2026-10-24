import type { ModelFamily, Provider, UsageWindow } from './types';

export const MODEL_FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const;
const SHORT_WINDOW_MAX_AGE_MS = 5 * 60 * 60_000;
const WEEK_WINDOW_MAX_AGE_MS = 7 * 86400_000;
const MONTH_WINDOW_MAX_AGE_MS = 31 * 86400_000;

export function noResetWindowMaxAgeMs(
  window: Pick<UsageWindow, 'id' | 'kind' | 'windowDurationMins'>
) {
  if (
    typeof window.windowDurationMins === 'number' &&
    Number.isFinite(window.windowDurationMins) &&
    window.windowDurationMins > 0 &&
    window.windowDurationMins <= 366 * 24 * 60
  )
    return window.windowDurationMins * 60_000;
  const id = (window.id ?? '').toLowerCase();
  if (window.kind === 'short' || /five.?hour|session/.test(id))
    return SHORT_WINDOW_MAX_AGE_MS;
  if (/month/.test(id)) return MONTH_WINDOW_MAX_AGE_MS;
  if (/week|seven.?day/.test(id) || window.kind === 'long')
    return WEEK_WINDOW_MAX_AGE_MS;
  return WEEK_WINDOW_MAX_AGE_MS;
}

function modelFamiliesInLabel(label: string): ModelFamily[] {
  if (
    /\b(?:except|excluding|without)\b|\bother\s+than\b|\bnon[-\s]/i.test(label)
  )
    return [];
  const found = [...label.matchAll(/\b(opusplan|opus|sonnet|haiku|fable)\b/gi)]
    .map((match) =>
      match[1]?.toLowerCase() === 'opusplan' ? 'opus' : match[1]?.toLowerCase()
    )
    .filter((family): family is ModelFamily =>
      MODEL_FAMILIES.includes(family as ModelFamily)
    );
  return [...new Set(found)];
}

export function normalizeModelId(model: string): string {
  return model
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '')
    .replace(/opusplan/g, 'opus');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function windowScope(
  provider: Provider,
  id: string,
  label: string
): NonNullable<UsageWindow['scope']> {
  if (provider === 'antigravity') {
    if (id.startsWith('gemini-'))
      return {
        kind: 'models',
        modelPrefixes: [
          id.match(/^(gemini-\d(?:\.\d+)?-[a-z]+)/i)?.[1] ?? 'gemini-',
        ],
      };
    if (id.startsWith('3p-'))
      return { kind: 'models', modelPrefixes: ['claude-', 'gpt-'] };
    if (id.startsWith('claude-'))
      return { kind: 'models', modelPrefixes: ['claude-'] };
    if (id.startsWith('gpt-'))
      return { kind: 'models', modelPrefixes: ['gpt-'] };
    return { kind: 'unknown' };
  }
  if (provider === 'claude') {
    const modelFamilies = modelFamiliesInLabel(label);
    if (modelFamilies.length) return { kind: 'models', modelFamilies };
  }
  return { kind: 'account' };
}
export function coversModel(window: UsageWindow, model?: string): boolean {
  if (!window.scope || window.scope.kind === 'account') return true;
  if (!model) return false;
  const normalizedModel = normalizeModelId(model);
  return (
    window.scope.kind === 'models' &&
    Boolean(
      window.scope.modelPrefixes?.some((prefix) =>
        normalizedModel.startsWith(normalizeModelId(prefix))
      ) ||
        window.scope.modelFamilies?.some(
          (family) =>
            MODEL_FAMILIES.includes(family) &&
            new RegExp(
              `(?:^|[-_/])${escapeRegExp(family)}(?:$|[-_/])`,
              'i'
            ).test(normalizedModel)
        )
    )
  );
}

export function receiptWindowScope(
  provider: Provider,
  model: string | undefined,
  message: string
): NonNullable<UsageWindow['scope']> {
  if (provider === 'antigravity') {
    if (model?.startsWith('gemini-'))
      return {
        kind: 'models',
        modelPrefixes: [model.replace(/-(low|medium|high)$/, '')],
      };
    return windowScope(
      provider,
      model?.startsWith('claude-') || model?.startsWith('gpt-')
        ? '3p-receipt'
        : '',
      ''
    );
  }
  if (provider === 'claude') {
    const scoped = message.match(
      /(?:weekly\s*[·:—-]\s*|seven_day_)([a-z][a-z0-9_-]*)/i
    );
    if (scoped?.[1])
      return windowScope(
        provider,
        `seven_day_${scoped[1]}`,
        `Weekly · ${scoped[1]}`
      );
  }
  return { kind: 'account' };
}
export function receiptCovers(
  event: { windowScope?: UsageWindow['scope']; model?: string },
  provider: Provider,
  model?: string
) {
  const scope =
    event.windowScope ?? receiptWindowScope(provider, event.model, '');
  // Unknown scope cannot establish safe headroom for any model in that pool.
  return (
    scope.kind === 'unknown' || coversModel({ scope } as UsageWindow, model)
  );
}
