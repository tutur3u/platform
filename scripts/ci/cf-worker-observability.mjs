// Bounded Worker log inventory for recent invocations. Replaces one-shot
// wrangler tail review with cf logs query; live streaming remains a Wrangler gap.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const WORKER_NAME = /^[a-z0-9-]{1,64}$/;

export function parseSinceMinutes(raw, fallback = 15) {
  const value = raw === undefined ? fallback : Number(raw);
  assert.ok(
    Number.isFinite(value) && value > 0 && value <= 1440,
    'sinceMinutes must be between 1 and 1440'
  );
  return Math.floor(value);
}

export function parseLimit(raw, fallback = 50) {
  const value = raw === undefined ? fallback : Number(raw);
  assert.ok(
    Number.isInteger(value) && value > 0 && value <= 200,
    'limit must be an integer between 1 and 200'
  );
  return value;
}

export function buildLogsQueryArgs({ worker, sinceMinutes, limit }) {
  assert.match(worker, WORKER_NAME, 'worker name');
  const since = new Date(Date.now() - sinceMinutes * 60_000).toISOString();
  return [
    'logs',
    'query',
    '--worker',
    worker,
    '--since',
    since,
    '--limit',
    String(limit),
    '--json',
  ];
}

export function parseLogsQueryStdout(stdout) {
  const trimmed = stdout.trim();
  assert.ok(trimmed.length > 0, 'cf logs query returned empty output');
  const parsed = JSON.parse(trimmed);
  assert.ok(
    parsed && typeof parsed === 'object' && Array.isArray(parsed.events),
    'cf logs query JSON must include an events array'
  );
  return parsed.events;
}

export function runCfCommand(args, { spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl('cf', args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `cf ${args.join(' ')} exited ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`
          )
        );
        return;
      }
      resolve(stdout);
    });
  });
}

export async function queryRecentLogs(options, deps = {}) {
  const worker = options.worker?.trim();
  assert.match(worker, WORKER_NAME, 'worker name');
  const sinceMinutes = parseSinceMinutes(options.sinceMinutes);
  const limit = parseLimit(options.limit);
  const args = buildLogsQueryArgs({ worker, sinceMinutes, limit });
  const stdout = await (deps.runCf ?? runCfCommand)(args);
  return parseLogsQueryStdout(stdout);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      since: { type: 'string' },
      limit: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(`Usage: node scripts/ci/cf-worker-observability.mjs <worker> [--since minutes] [--limit n]

Query recent Worker invocation logs with cf logs query. This path is bounded and
non-streaming; wrangler tail remains required for a live tail until cf supports it.`);
    return;
  }
  const worker = positionals[0];
  assert.ok(worker, 'worker name is required');
  const events = await queryRecentLogs({
    worker,
    sinceMinutes: values.since,
    limit: values.limit,
  });
  process.stdout.write(
    `${JSON.stringify({ worker, count: events.length, events })}\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
