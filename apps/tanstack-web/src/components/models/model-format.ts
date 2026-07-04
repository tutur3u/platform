import type { GatewayModelRow } from '@tuturuuu/internal-api';
import type { ModelsMessages } from './models-types';

export function interpolateShowingCount(
  template: string,
  values: { count: number; total: number }
) {
  return template
    .replace('{count}', String(values.count))
    .replace('{total}', String(values.total));
}

export function numberValue(value: number | string | null | undefined) {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatTokens(
  tokens: number | null | undefined,
  messages: ModelsMessages
) {
  if (!tokens) {
    return messages.not_available;
  }

  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(0)}M`;
  }

  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}K`;
  }

  return tokens.toString();
}

export function formatPrice(
  price: number | string | null | undefined,
  messages: ModelsMessages
) {
  const parsed = numberValue(price);

  if (parsed == null) {
    return messages.not_available;
  }

  if (parsed === 0) {
    return messages.free;
  }

  return `$${(parsed * 1_000_000).toFixed(2)}/1M`;
}

export function modelType(model: GatewayModelRow) {
  return model.type || 'language';
}
