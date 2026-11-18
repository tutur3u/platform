import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  effectiveMarkerStatus,
  evaluateMarker,
  markerSuperseded,
} from './deployment-marker-status.mjs';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const marker = { id: 10, sha, created_at: '2026-11-17T21:59:00Z' };
const success = { id: 1, state: 'success', created_at: '2026-11-17T21:59:13Z' };
const inactive = {
  id: 3,
  state: 'inactive',
  created_at: '2026-11-17T21:59:20Z',
};
const sameShaDeployment = {
  id: 11,
  sha,
  created_at: '2026-11-17T21:59:18Z',
};
const verdict = (overrides) =>
  evaluateMarker({
    statuses: [inactive, success],
    marker,
    environmentDeployments: [sameShaDeployment, marker],
    targetSha: sha,
    ...overrides,
  });

test('success then auto-inactive by the same SHA deployment is accepted', () => {
  assert.deepEqual(verdict(), {
    accepted: true,
    state: 'success',
    reason: 'success',
  });
  assert.equal(effectiveMarkerStatus([inactive, success]).id, 1);
});

test('a plain latest success is accepted', () => {
  assert.equal(verdict({ statuses: [success] }).accepted, true);
});

test('status order in the API response does not matter', () => {
  assert.equal(verdict({ statuses: [success, inactive] }).accepted, true);
});

for (const [name, overrides, reason] of [
  [
    'inactive without any prior success',
    { statuses: [inactive] },
    'no-current-success',
  ],
  ['no statuses at all', { statuses: [] }, 'no-current-success'],
  [
    'a failure after the success',
    {
      statuses: [
        inactive,
        { id: 2, state: 'failure', created_at: '2026-11-17T21:59:15Z' },
        success,
      ],
    },
    'no-current-success',
  ],
  [
    'an error after the success',
    {
      statuses: [
        { id: 2, state: 'error', created_at: '2026-11-17T21:59:15Z' },
        success,
      ],
    },
    'no-current-success',
  ],
  [
    'a still-pending deployment',
    {
      statuses: [
        { id: 2, state: 'in_progress', created_at: '2026-11-17T21:59:15Z' },
      ],
    },
    'no-current-success',
  ],
  [
    'a SHA mismatch between marker and target',
    { targetSha: other },
    'sha-mismatch',
  ],
  ['a missing marker', { marker: undefined }, 'sha-mismatch'],
  [
    'a newer deployment of a different SHA',
    {
      environmentDeployments: [
        { id: 12, sha: other, created_at: '2026-11-17T22:10:00Z' },
        marker,
      ],
    },
    'superseded',
  ],
]) {
  test(`${name} is refused`, () => {
    const result = verdict(overrides);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, reason);
  });
}

test('an older deployment of a different SHA does not supersede the marker', () => {
  assert.equal(
    markerSuperseded({
      marker,
      environmentDeployments: [
        marker,
        { id: 5, sha: other, created_at: '2026-11-17T20:00:00Z' },
      ],
    }),
    false
  );
});

test('a marker that is not on the newest-first page cannot be proven current', () => {
  assert.equal(
    markerSuperseded({
      marker,
      environmentDeployments: [
        { id: 12, sha, created_at: '2026-11-17T22:10:00Z' },
      ],
    }),
    true
  );
  assert.equal(
    evaluateMarker({
      statuses: [inactive, success],
      marker,
      environmentDeployments: [],
      targetSha: sha,
    }).reason,
    'superseded'
  );
});

test('a full 100-row page that contains the marker is accepted', () => {
  const page = Array.from({ length: 99 }, (_, index) => ({
    id: 1000 + index,
    sha,
    created_at: '2026-11-17T21:58:00Z',
  }));
  assert.equal(
    markerSuperseded({ marker, environmentDeployments: [marker, ...page] }),
    false
  );
});

test('an unordered or undated page is refused', () => {
  const older = { id: 4, sha, created_at: '2026-11-17T20:00:00Z' };
  assert.equal(
    markerSuperseded({ marker, environmentDeployments: [older, marker] }),
    true
  );
  assert.equal(
    markerSuperseded({
      marker,
      environmentDeployments: [marker, { id: 6, sha }],
    }),
    true
  );
});

test('only rows above the marker count, whatever their timestamps', () => {
  const tie = { id: 7, sha: other, created_at: marker.created_at };
  assert.equal(
    markerSuperseded({ marker, environmentDeployments: [tie, marker] }),
    true
  );
  assert.equal(
    markerSuperseded({ marker, environmentDeployments: [marker, tie] }),
    false
  );
});

test('a non-array deployment list fails closed', () => {
  assert.equal(
    markerSuperseded({ marker, environmentDeployments: null }),
    true
  );
});

test('the CLI evaluates files and fails closed on unreadable input', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'marker-status-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    join(dir, 'statuses.json'),
    JSON.stringify([inactive, success])
  );
  writeFileSync(
    join(dir, 'deployments.json'),
    JSON.stringify([sameShaDeployment, marker])
  );
  const run = (extra) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [new URL('./deployment-marker-status.mjs', import.meta.url).pathname],
        {
          env: {
            PATH: process.env.PATH,
            MARKER_STATUSES_FILE: join(dir, 'statuses.json'),
            MARKER_DEPLOYMENTS_FILE: join(dir, 'deployments.json'),
            MARKER_DEPLOYMENT_ID: '10',
            TARGET_SHA: sha,
            ...extra,
          },
          encoding: 'utf8',
        }
      )
    );
  assert.equal(run({}).accepted, true);
  assert.equal(run({ TARGET_SHA: other }).reason, 'sha-mismatch');
  assert.deepEqual(run({ MARKER_STATUSES_FILE: join(dir, 'missing.json') }), {
    accepted: false,
    state: 'missing',
    reason: 'unreadable',
  });
});

test('the production prerequisite step evaluates markers through the helper', () => {
  const workflow = readFileSync(
    new URL(
      '../../.github/workflows/supabase-production.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(workflow, /node scripts\/ci\/deployment-marker-status\.mjs/);
  assert.match(workflow, /TARGET_SHA="\$TARGET_SHA"/);
  assert.doesNotMatch(workflow, /\.\[0\]\.state == "success"/);
});
