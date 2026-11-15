/** Shared placement policy for subject and opt-in control objects. */
const LOCATION_HINTS = new Set([
  'wnam',
  'enam',
  'sam',
  'weur',
  'eeur',
  'apac',
  'oc',
  'afr',
  'me',
]);

export function locationHint(
  value?: string
): DurableObjectLocationHint | undefined {
  const hint = value?.trim() || 'apac';
  return LOCATION_HINTS.has(hint)
    ? (hint as DurableObjectLocationHint)
    : undefined;
}
