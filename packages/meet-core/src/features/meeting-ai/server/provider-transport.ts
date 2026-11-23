import 'server-only';
import { MEETING_APP } from '../../../runtime';

/**
 * Meet's transcript and notes use the Meet Worker's own server key
 * (GOOGLE_GENERATIVE_AI_API_KEY) through the default transport. Parley's
 * room provider stays closed.
 */
export async function meetingProviderTransport(): Promise<{
  apiKey?: string;
  fetch?: typeof fetch;
}> {
  if (MEETING_APP === 'meet') return {};
  throw new Error('Room meeting AI is unavailable. Use Private Mira.');
}
