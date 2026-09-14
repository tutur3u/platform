export {};

const expected = process.env.EXPECTED_VERSION_TAG;
if (!expected) throw new Error('EXPECTED_VERSION_TAG is required');
const origin = 'https://lettin.tuturuuu.com';
let verified = false;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const response = await fetch(`${origin}/api/v1/lettin/health`, {
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json()) as {
      service?: string;
      status?: string;
      deployment?: { tag?: string };
      storage?: { database?: string; artwork?: string };
    };
    if (
      response.ok &&
      data.service === 'lettin' &&
      data.status === 'ok' &&
      data.deployment?.tag === expected &&
      data.storage?.database === 'd1' &&
      data.storage?.artwork === 'r2'
    ) {
      verified = true;
      break;
    }
  } catch {
    // DNS and Worker propagation can briefly lag deployment completion.
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (!verified)
  throw new Error('Lettin version and storage verification failed');
for (const path of ['/login', '/api/v1/lettin/worlds']) {
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Lettin smoke check failed: ${path}`);
}
console.info(`Verified Lettin Worker ${expected}, D1, R2, and public routes`);
