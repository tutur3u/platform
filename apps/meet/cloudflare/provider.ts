import { WorkerEntrypoint } from 'cloudflare:workers';
export class MeetingAIProvider extends WorkerEntrypoint {
  fetch(_request: Request) {
    return new Response('Room meeting AI is unavailable. Use Private Mira.', {
      status: 403,
    });
  }
}
