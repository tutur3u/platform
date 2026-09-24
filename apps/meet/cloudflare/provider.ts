import { WorkerEntrypoint } from 'cloudflare:workers';
import { proxyMeetingProvider } from '@tuturuuu/meet-core/cloudflare/provider-proxy';
/** Only explicitly configured Cloudflare service bindings can call this entrypoint. */
export class MeetingAIProvider extends WorkerEntrypoint<{
  GOOGLE_GENERATIVE_AI_API_KEY: string;
}> {
  fetch(request: Request) {
    return proxyMeetingProvider(request, this.env.GOOGLE_GENERATIVE_AI_API_KEY);
  }
}
