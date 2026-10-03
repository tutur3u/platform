export const cacheFailureModes = ['builder', 'result', 'promise'] as const;
export type CacheFailureMode = (typeof cacheFailureModes)[number];
export const privateCacheFailure = 'synthetic-private-cache-detail';
export function failingSourceColorCache(mode: CacheFailureMode): unknown {
  if (mode === 'builder') throw new Error(privateCacheFailure);
  const query = {
    update: () => query,
    eq: () => query,
    // biome-ignore lint/suspicious/noThenProperty: Model the awaited PostgREST query boundary.
    then: (
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown
    ) =>
      (mode === 'promise'
        ? Promise.reject(new Error(privateCacheFailure))
        : Promise.resolve({ error: { message: privateCacheFailure } })
      ).then(resolve, reject),
  };
  return query;
}
