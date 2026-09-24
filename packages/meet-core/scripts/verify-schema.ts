const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw new Error('Production database configuration is missing');
const deadline = Date.now() + 20 * 60_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const results = await Promise.all(
      [
        'parley_scenarios',
        'parley_sessions',
        'parley_members',
        'parley_references',
        'parley_observations',
      ].map(async (table) => {
        const response = await fetch(
          `${url}/rest/v1/${table}?select=*&limit=0`,
          {
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Accept-Profile': 'private',
            },
            signal: AbortSignal.timeout(10_000),
          }
        );
        await response.body?.cancel();
        return response.ok;
      })
    );
    const marker = await fetch(`${url}/rest/v1/rpc/parley_runtime_ready`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'private',
      },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    });
    const billingReady = marker.ok && (await marker.json()) === true;
    if (results.every(Boolean) && billingReady) {
      ready = true;
      break;
    }
  } catch {
    /* Retry transport failures without logging secrets or database bodies. */
  }
  console.log('Waiting for Parley schema readiness');
  await Bun.sleep(15_000);
}
if (!ready)
  throw new Error('Parley schema is not ready; Worker was not deployed');
console.log('Parley schema ready');
