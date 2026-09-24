const deadline = Date.now() + 20 * 60_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(
      'https://meet.tuturuuu.com/.well-known/meeting-runtime',
      { signal: AbortSignal.timeout(10_000), redirect: 'error' }
    );
    const body = response.ok
      ? ((await response.json()) as { version?: number })
      : null;
    if (body?.version === 1) {
      ready = true;
      break;
    }
  } catch {
    /* Meet can be deploying concurrently on the same production SHA. */
  }
  console.log('Waiting for shared meeting provider runtime');
  await Bun.sleep(15_000);
}
if (!ready)
  throw new Error(
    'Shared meeting provider is not ready; Parley was not deployed'
  );
console.log('Shared provider runtime ready');
