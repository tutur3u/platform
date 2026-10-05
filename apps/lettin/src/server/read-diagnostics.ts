type ReadStage =
  | 'resolve actor'
  | 'resolve bindings'
  | 'read world'
  | 'D1 world access'
  | 'D1 world record'
  | 'D1 entries'
  | 'Supabase member names'
  | 'D1 collaborators'
  | 'D1 creators'
  | 'Supabase eligible members';

// Fixed stages only: never accept actor IDs, URLs, payloads, or error values.
export async function traceLettinRead<T>(
  stage: ReadStage,
  read: () => Promise<T>
): Promise<T> {
  if (
    process.env.CI !== 'true' &&
    process.env.LETTIN_READ_DIAGNOSTICS !== 'true'
  ) {
    return read();
  }
  const started = performance.now();
  console.info('[lettin-read]', stage, 'started');
  try {
    const result = await read();
    console.info('[lettin-read]', stage, 'completed', {
      elapsedMs: Math.round(performance.now() - started),
    });
    return result;
  } catch (error) {
    console.warn('[lettin-read]', stage, 'failed', {
      elapsedMs: Math.round(performance.now() - started),
    });
    throw error;
  }
}
