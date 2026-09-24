import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { MEETING_APP } from '../../../runtime';
export async function meetingProviderTransport(): Promise<{
  apiKey?: string;
  fetch?: typeof fetch;
}> {
  if (MEETING_APP !== 'parley') return {};
  try {
    const { env } = await getCloudflareContext({ async: true });
    const binding = (
      env as unknown as {
        MEETING_AI_PROVIDER?: { fetch(request: Request): Promise<Response> };
      }
    ).MEETING_AI_PROVIDER;
    if (binding)
      return {
        apiKey: 'service-binding',
        fetch: (input, init) => binding.fetch(new Request(input, init)),
      };
  } catch {
    // Native local development can use its own explicitly configured provider.
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return {};
  throw new Error('Shared meeting provider is unavailable');
}
