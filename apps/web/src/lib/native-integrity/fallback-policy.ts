const actorPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function nativeIntegrityTurnstileEnabled() {
  return process.env.NATIVE_INTEGRITY_TURNSTILE_ENABLED === 'true';
}

/** Only operator-owned actor policy can classify a platform as unsupported. */
export async function nativeIntegrityActorEligibility(
  actorId: string
): Promise<'unsupported-platform' | 'native-required'> {
  const serialized =
    process.env.NATIVE_INTEGRITY_UNSUPPORTED_PLATFORM_ACTOR_IDS ?? '';
  if (serialized.length > 20_000)
    throw new Error('Native integrity actor policy unavailable');
  const actors = serialized
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (actors.length > 500 || actors.some((actor) => !actorPattern.test(actor)))
    throw new Error('Native integrity actor policy unavailable');
  return actors.includes(actorId.toLowerCase())
    ? 'unsupported-platform'
    : 'native-required';
}
