import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLogsQueryArgs,
  parseLimit,
  parseLogsQueryStdout,
  parseSinceMinutes,
  queryRecentLogs,
} from './cf-worker-observability.mjs';

test('parseSinceMinutes accepts bounded windows', () => {
  assert.equal(parseSinceMinutes(undefined), 15);
  assert.equal(parseSinceMinutes('30'), 30);
  assert.throws(() => parseSinceMinutes('0'), /sinceMinutes/);
  assert.throws(() => parseSinceMinutes('2000'), /sinceMinutes/);
});

test('parseLimit accepts bounded page sizes', () => {
  assert.equal(parseLimit(undefined), 50);
  assert.equal(parseLimit('25'), 25);
  assert.throws(() => parseLimit('0'), /limit/);
  assert.throws(() => parseLimit('500'), /limit/);
});

test('buildLogsQueryArgs pins worker, since and limit', () => {
  const args = buildLogsQueryArgs({
    worker: 'tuturuuu-api',
    sinceMinutes: 10,
    limit: 12,
  });
  assert.deepEqual(args.slice(0, 6), [
    'logs',
    'query',
    '--worker',
    'tuturuuu-api',
    '--since',
    args[5],
  ]);
  assert.ok(!Number.isNaN(Date.parse(args[5])));
  assert.deepEqual(args.slice(6), ['--limit', '12', '--json']);
});

test('parseLogsQueryStdout requires an events array', () => {
  assert.deepEqual(parseLogsQueryStdout('{"events":[{"message":"ok"}]}'), [
    { message: 'ok' },
  ]);
  assert.throws(() => parseLogsQueryStdout('{"items":[]}'), /events array/);
});

test('queryRecentLogs delegates to cf logs query', async () => {
  const calls = [];
  const events = await queryRecentLogs(
    { worker: 'tuturuuu-status-api', sinceMinutes: 5, limit: 3 },
    {
      runCf: async (args) => {
        calls.push(args);
        return '{"events":[{"level":"info"}]}';
      },
    }
  );
  assert.deepEqual(events, [{ level: 'info' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], '--worker');
  assert.equal(calls[0][3], 'tuturuuu-status-api');
});
