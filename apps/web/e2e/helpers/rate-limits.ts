export async function resetDbRateLimits(): Promise<void> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:7803';
  const response = await fetch(`${baseUrl}/api/dev/rate-limits/reset`, {
    method: 'POST',
  });

  if (!response.ok) {
    let message = `Failed to reset DB rate limits: ${response.status}`;

    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = `Failed to reset DB rate limits: ${body.error}`;
      }
    } catch {
      // Ignore JSON parsing issues and keep the status-based message.
    }

    throw new Error(message);
  }
}
