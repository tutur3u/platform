/** Internal-only transport marker; never written back to a provider. */
const marker = '__tuturuuuProviderReadonlyRecurrence';
export type ProviderReadonlyRecurrence = {
  state: 'unsupported';
  master_id: string;
  provider: 'google' | 'microsoft';
};
export function markProviderRecurrenceReadonly<T extends object>(
  event: T,
  provider: ProviderReadonlyRecurrence['provider'],
  masterId: string
): T {
  return {
    ...event,
    [marker]: { state: 'unsupported', master_id: masterId, provider },
  };
}
export function providerReadonlyProjection(event: unknown): {
  locked?: true;
  scheduling_metadata?: { provider_recurrence: ProviderReadonlyRecurrence };
} {
  if (!event || typeof event !== 'object') return {};
  const value = (event as Record<string, unknown>)[marker];
  if (!value || typeof value !== 'object') return {};
  const entry = value as Partial<ProviderReadonlyRecurrence>;
  if (
    entry.state !== 'unsupported' ||
    typeof entry.master_id !== 'string' ||
    !entry.master_id ||
    !['google', 'microsoft'].includes(entry.provider ?? '')
  )
    return {};
  return {
    locked: true,
    scheduling_metadata: {
      provider_recurrence: entry as ProviderReadonlyRecurrence,
    },
  };
}
export function isProviderRecurrenceReadonly(event: unknown): boolean {
  if (!event || typeof event !== 'object') return false;
  const metadata = (event as { scheduling_metadata?: unknown })
    .scheduling_metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  return (
    (metadata as { provider_recurrence?: { state?: unknown } })
      .provider_recurrence?.state === 'unsupported'
  );
}
