import { createChatRealtimeServer } from './server';

const server = createChatRealtimeServer();

process.stdout.write(
  `Chat realtime listening on http://0.0.0.0:${server.port}\n`
);
