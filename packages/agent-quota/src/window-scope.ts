import type { Provider, UsageWindow } from './types';
export function windowScope(
  provider: Provider,
  id: string,
  label: string
): NonNullable<UsageWindow['scope']> {
  if (provider === 'antigravity') {
    if (id.startsWith('gemini-'))
      return { kind: 'models', modelPrefixes: ['gemini-'] };
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
    (id.startsWith('seven_day_') || label.includes('·'))
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
