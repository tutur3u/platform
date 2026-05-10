import { createHiveRealtimeServer } from './server';

const server = createHiveRealtimeServer();

process.stdout.write(
  `Hive realtime listening on http://0.0.0.0:${server.port}\n`
);
