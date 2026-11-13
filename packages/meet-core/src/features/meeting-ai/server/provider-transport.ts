import 'server-only';
export async function meetingProviderTransport(): Promise<{
  apiKey?: string;
  fetch?: typeof fetch;
}> {
  throw new Error('Room meeting AI is unavailable. Use Private Mira.');
}
