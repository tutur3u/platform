const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BLUE_GREEN_PROXY_SERVICE,
  PROD_COMPOSE_FILE,
  collectDeploymentTraffic,
} = require('./watch-blue-green/deploy-watcher-runtime.js');
const { getWatchPaths } = require('./watch-blue-green/paths.js');
const {
  MAX_REQUEST_LOG_BYTES_ENV,
  parseContainerConsoleLogEntries,
  readTelemetryState,
  redactRequestConsoleLogMessage,
} = require('./watch-blue-green/telemetry.js');

function createResult(stdout = '', { code = 0, stderr = '' } = {}) {
  return {
    code,
    signal: null,
    stderr,
    stdout,
  };
}

function createRunCommandMock(responses) {
  return async (command, args) => {
    const key = `${command} ${args.join(' ')}`;

    if (!responses.has(key)) {
      throw new Error(`Unexpected command: ${key}`);
    }

    return responses.get(key);
  };
}

function prodComposePsKey(serviceName) {
  return `docker compose -f ${PROD_COMPOSE_FILE} ps -q ${serviceName}`;
}

test('readTelemetryState backfills byte counters for existing request-log chunks', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-traffic-byte-state-')
  );
  const paths = getWatchPaths(tempDir);

  try {
    fs.mkdirSync(paths.requestLogDir, { recursive: true });
    fs.writeFileSync(
      path.join(paths.requestLogDir, 'requests-old.jsonl'),
      '{"path":"/old"}\n',
      'utf8'
    );
    fs.writeFileSync(
      paths.requestStateFile,
      JSON.stringify({
        chunks: [
          {
            count: 1,
            file: 'requests-old.jsonl',
            firstRequestAt: 1,
            lastRequestAt: 1,
          },
        ],
        currentChunkCount: 1,
        currentChunkFile: 'requests-old.jsonl',
        cursor: null,
        totalRecords: 1,
      }),
      'utf8'
    );

    const state = readTelemetryState(paths, fs);

    assert.equal(state.totalRecords, 1);
    assert.equal(state.totalBytes, Buffer.byteLength('{"path":"/old"}\n'));
    assert.equal(state.chunks[0]?.bytes, state.totalBytes);
    assert.equal(state.currentChunkCount, 1);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('parseContainerConsoleLogEntries coalesces timestamped multiline object writes', () => {
  const output = [
    '2026-05-31T06:10:00.000000000Z Sampled infrastructure resources {',
    '2026-05-31T06:10:00.000000000Z   activeBuilds: 0,',
    "2026-05-31T06:10:00.000000000Z   buildState: 'idle'",
    '2026-05-31T06:10:00.000000000Z }',
    '2026-05-31T06:10:01.000000000Z Finished sampler',
  ].join('\n');

  const entries = parseContainerConsoleLogEntries(output, {
    containerId: 'web-green',
    deploymentColor: 'green',
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0].containerId, 'web-green');
  assert.equal(entries[0].deploymentColor, 'green');
  assert.match(entries[0].message, /^Sampled infrastructure resources \{/);
  assert.match(entries[0].message, /activeBuilds: 0/);
  assert.match(entries[0].rawLine, /buildState: 'idle'/);
  assert.equal(entries[1].message, 'Finished sampler');
});

test('redactRequestConsoleLogMessage redacts sensitive route payloads', () => {
  const redacted = redactRequestConsoleLogMessage(
    `OAuth callback failed for admin@example.com /api/auth?code=oauth-code&token=secret-token Authorization: Bearer abc.def.ghi ${'x'.repeat(600)}`
  );

  assert.equal(redacted.includes('admin@example.com'), false);
  assert.equal(redacted.includes('oauth-code'), false);
  assert.equal(redacted.includes('secret-token'), false);
  assert.equal(redacted.includes('abc.def.ghi'), false);
  assert.match(redacted, /code=\[REDACTED\]/);
  assert.match(redacted, /token=\[REDACTED\]/);
  assert.match(redacted, /Authorization: \[REDACTED\]/);
  assert.match(redacted, /\.\.\. \[truncated\]$/);
});

test('collectDeploymentTraffic bounds durable request logs by bytes before appending long URIs', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-traffic-byte-cap-')
  );
  const paths = getWatchPaths(tempDir);
  const maxRequestLogBytes = 2500;
  const longQuery = 'x'.repeat(1600);
  const deployments = [
    {
      activatedAt: Date.parse('2026-04-18T10:30:00.000Z'),
      activeColor: 'green',
      commitShortHash: 'bbb222',
      deploymentStamp: 'deploy-2026-04-18T10-30-00Z',
      finishedAt: Date.parse('2026-04-18T10:30:00.000Z'),
      startedAt: Date.parse('2026-04-18T10:29:30.000Z'),
      status: 'successful',
    },
  ];
  const proxyLines = [1, 2, 3, 4].map(
    (index) =>
      `2026-04-18T11:05:0${index}.000000000Z {"host":"platform.test","method":"GET","path":"/search?payload=${index}-${longQuery}","status":200,"requestTime":0.1,"deploymentStamp":"deploy-2026-04-18T10-30-00Z","deploymentColor":"green"}`
  );

  try {
    await collectDeploymentTraffic(deployments, {
      env: {
        [MAX_REQUEST_LOG_BYTES_ENV]: String(maxRequestLogBytes),
      },
      now: Date.parse('2026-04-18T11:30:00.000Z'),
      paths,
      runCommand: createRunCommandMock(
        new Map([
          [
            prodComposePsKey(BLUE_GREEN_PROXY_SERVICE),
            createResult('proxy-123\n'),
          ],
          [
            'docker logs --timestamps --since 2026-04-18T10:30:00.000Z proxy-123',
            createResult(proxyLines.join('\n')),
          ],
        ])
      ),
    });

    const state = JSON.parse(fs.readFileSync(paths.requestStateFile, 'utf8'));
    const summary = JSON.parse(
      fs.readFileSync(paths.requestSummaryFile, 'utf8')
    );
    const chunkFiles = fs
      .readdirSync(paths.requestLogDir)
      .filter((file) => file.endsWith('.jsonl'));
    const chunkPath = path.join(paths.requestLogDir, state.currentChunkFile);
    const durableEntries = fs
      .readFileSync(chunkPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    assert.equal(summary.totalLogEntries, 4);
    assert.equal(summary.totalRequestsServed, 4);
    assert.equal(state.totalRecords, durableEntries.length);
    assert.ok(state.totalBytes <= maxRequestLogBytes);
    assert.ok(fs.statSync(chunkPath).size <= maxRequestLogBytes);
    assert.deepEqual(chunkFiles, [state.currentChunkFile]);
    assert.equal(durableEntries.length, 1);
    assert.match(durableEntries[0].path, /^\/search\?payload=4-/);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});
