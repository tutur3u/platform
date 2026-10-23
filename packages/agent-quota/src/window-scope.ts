import type { Provider, UsageWindow } from './types';
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
  if (
    provider === 'claude' &&
    !/all\s+models|all[_-]models|generic|account-wide/i.test(label) &&
    (label.includes('·') ||
      (id.startsWith('seven_day_') &&
        !/^(default|weekly|all|generic|account)$/i.test(
          id.slice('seven_day_'.length)
        )))
  ) {
    const model =
      label.split('·')[1]?.trim().toLowerCase() ??
      id.slice('seven_day_'.length).replaceAll('_', '-');
    return model
      ? { kind: 'models', modelPrefixes: [model, `claude-${model}`] }
      : { kind: 'unknown' };
  }
  return { kind: 'account' };
}
export function coversModel(window: UsageWindow, model?: string): boolean {
  if (!window.scope || window.scope.kind === 'account') return true;
  return (
    window.scope.kind === 'models' &&
    Boolean(
      model &&
        window.scope.modelPrefixes?.some((prefix) =>
          model.toLowerCase().startsWith(prefix.toLowerCase())
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
