import worker, {
  ChatConversationRoom as ConversationRoom,
} from '../../../src/worker';

export { ChatInboxRoom } from '../../../src/worker';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

export class ChatConversationRoom extends ConversationRoom {
  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, { ...env });
  }

  override fetch(request: Request) {
    if (new URL(request.url).pathname === '/fixture/arm-stop') {
      this.env.CHAT_REALTIME_STOPPED = 'true';
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return super.fetch(request);
  }
}

export default {
  fetch(request: Request, env: WorkerEnv) {
    const url = new URL(request.url);
    if (url.pathname === '/fixture/arm-stop') {
      const namespace = env.CONVERSATION;
      return namespace
        .get(namespace.idFromName(url.searchParams.get('room') ?? ''))
        .fetch('https://room/fixture/arm-stop');
    }
    return worker.fetch(request, env);
  },
};
