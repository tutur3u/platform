import { registry } from './registry.generated';

export { registry };
export type FlagKey = (typeof registry)[number]['key'];
export type FlagClass = 'read' | 'write' | 'ui' | 'kill';
export interface FlagDefinition<Key extends string = string> {
  readonly key: Key;
  readonly description: string;
  readonly owner: string;
  readonly class: FlagClass;
  readonly default: boolean;
  readonly removeBy: string;
}
export interface FlagContext {
  readonly userId?: string;
  readonly wsId?: string;
}

export function evaluateFlags<Key extends string>(
  definitions: readonly FlagDefinition<Key>[],
  _context: FlagContext,
  overrides: Readonly<Partial<Record<string, boolean>>> = {}
): Record<Key, boolean> {
  const entries = definitions.map(
    ({ key, default: fallback }) =>
      [
        key,
        Object.hasOwn(overrides, key) ? (overrides[key] ?? fallback) : fallback,
      ] as const
  );
  const offlineEnabled = entries.some(
    ([key, enabled]) => key === 'mobile_offline' && enabled
  );
  // Object.fromEntries loses the key union; entries contain exactly the registry keys.
  return Object.fromEntries(
    entries.map(([key, enabled]) => [
      key,
      key.startsWith('offline_') && !offlineEnabled ? false : enabled,
    ])
  ) as Record<Key, boolean>;
}
