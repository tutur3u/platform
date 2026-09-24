import { spawnSync } from 'node:child_process';

const secret = process.env.MEET_REALTIME_TOKEN_SECRET;
if (!secret?.trim()) throw new Error('Missing realtime signing identity');
const result = spawnSync(
  'bun',
  [
    'x',
    '--no-install',
    'wrangler',
    'secret',
    'bulk',
    '--name',
    'tuturuuu-parley',
  ],
  {
    input: JSON.stringify({ MEET_REALTIME_TOKEN_SECRET: secret }),
    stdio: ['pipe', 'inherit', 'inherit'],
  }
);
if (result.status !== 0)
  throw new Error('Could not configure realtime identity');
