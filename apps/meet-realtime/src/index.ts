import { createMeetRealtimeServer } from './server';

const server = createMeetRealtimeServer();

process.stdout.write(
  `Meet realtime listening on http://0.0.0.0:${server.port}\n`
);
