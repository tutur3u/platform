/** Best-effort wake signal. The runner also polls, so enqueue never depends on it. */
export async function notifyDevboxRun(runId: string) {
  const origin = process.env.TUTURUUU_DEVBOX_CONTROL_URL?.trim();
  const token = process.env.TUTURUUU_DEVBOX_CONTROL_TOKEN?.trim();
  if (!origin || !token) return;
  try {
    const url = new URL('/v1/notify', origin);
    if (url.protocol !== 'https:') throw new Error('Invalid control URL');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ runId }),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok)
      console.warn('Devbox wake signal rejected', response.status);
  } catch {
    console.warn('Devbox wake signal unavailable');
  }
}
