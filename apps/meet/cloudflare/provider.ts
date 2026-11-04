import { WorkerEntrypoint } from 'cloudflare:workers';
import { proxyMeetingProvider } from '@tuturuuu/meet-core/cloudflare/provider-proxy';
/** Parley uses a dedicated key; the Meet AI credential is never shared. */
export class MeetingAIProvider extends WorkerEntrypoint<{
  PARLEY_GOOGLE_GENERATIVE_AI_API_KEY: string;
}> {
  fetch(request: Request) {
    return proxyMeetingProvider(
      request,
      this.env.PARLEY_GOOGLE_GENERATIVE_AI_API_KEY
    );
  }
}
