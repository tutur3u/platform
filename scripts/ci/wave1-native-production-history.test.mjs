import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  assertNoEarlierUpload,
  publicationReceipt,
  uploadStepName,
} from './wave1-native-production-history.mjs';

const sha = 'a'.repeat(40);
const earlierSha = 'b'.repeat(40);
const versionId = '11111111-1111-1111-1111-111111111111';
function fixture() {
  const env = {
    GITHUB_REPOSITORY: 'fixture/repo',
    GITHUB_TOKEN: 'fixture',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '2',
  };
  const receipt = {
    app: 'calendar',
    sha: earlierSha,
    digest: 'c'.repeat(64),
    worker: 'tuturuuu-calendar',
    runId: '122',
    runAttempt: '1',
    versionId,
    state: 'accepted-private',
  };
  const current = {
    name: 'publish-calendar',
    run_id: 123,
    run_attempt: 2,
    status: 'in_progress',
    steps: [{ name: uploadStepName, status: 'in_progress' }],
  };
  const previous = {
    name: 'publish-calendar',
    run_id: 122,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    steps: [
      {
        name: uploadStepName,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-10-27T00:00:00Z',
      },
    ],
  };
  const state = {
    current,
    previous,
    receipt,
    artifact: true,
    expired: false,
    reads: 0,
  };
  const fetcher = async (url) => {
    if (url.includes('/jobs?')) {
      const jobs = url.includes('/123/') ? [current] : [previous];
      return Response.json({ total_count: jobs.length, jobs });
    }
    if (url.includes('/artifacts?'))
      return Response.json({
        total_count: state.artifact ? 1 : 0,
        artifacts: state.artifact
          ? [
              {
                id: 9,
                name: `wave1-calendar-production-publication-${earlierSha}-122-1`,
                expired: state.expired,
              },
            ]
          : [],
      });
    return Response.json({
      total_count: 2,
      workflow_runs: [
        { id: 123, head_sha: sha, head_branch: 'production' },
        { id: 122, head_sha: earlierSha, head_branch: 'production' },
      ],
    });
  };
  return {
    state,
    run: () =>
      assertNoEarlierUpload({
        env,
        sha,
        app: 'calendar',
        worker: 'tuturuuu-calendar',
        rollback: { versions: [{ version_id: versionId, percentage: 100 }] },
        fetcher,
        readReceipt: async () => {
          state.reads++;
          return receipt;
        },
      }),
  };
}

test('current in-progress attempt is ignored and accepted baseline closes earlier app history', async () => {
  const p = fixture();
  await p.run();
  assert.equal(p.state.reads, 1);
});
test('another app upload does not consume Calendar history', async () => {
  const p = fixture();
  p.state.previous.name = 'publish-mail';
  await p.run();
  assert.equal(p.state.reads, 0);
});
test('a read-only preflight refusal leaves upload skipped and permits a later source', async () => {
  const p = fixture();
  p.state.artifact = false;
  p.state.previous.steps[0] = {
    name: uploadStepName,
    conclusion: 'skipped',
    status: 'completed',
  };
  await p.run();
});
for (const [name, mutate] of [
  [
    'missing receipt',
    (p) => {
      p.state.artifact = false;
    },
  ],
  [
    'expired receipt',
    (p) => {
      p.state.expired = true;
    },
  ],
  [
    'pending receipt',
    (p) => {
      p.state.receipt.state = 'pending';
    },
  ],
  [
    'different app receipt',
    (p) => {
      p.state.receipt.app = 'mail';
    },
  ],
  [
    'different source receipt',
    (p) => {
      p.state.receipt.sha = sha;
    },
  ],
  [
    'different attempt receipt',
    (p) => {
      p.state.receipt.runAttempt = '2';
    },
  ],
  [
    'different rollback version',
    (p) => {
      p.state.receipt.versionId = '22222222-2222-2222-2222-222222222222';
    },
  ],
  [
    'unknown earlier upload step',
    (p) => {
      p.state.previous.steps = [];
    },
  ],
])
  test(`${name} cannot clear an earlier upload`, async () => {
    const p = fixture();
    mutate(p);
    await assert.rejects(p.run());
  });

test('receipt archive is bounded and storage request receives no GitHub credential', async () => {
  const payload = { state: 'accepted-private', versionId };
  const zip = execFileSync('python3', [
    '-c',
    `import io,sys,zipfile
b=io.BytesIO()
with zipfile.ZipFile(b,'w') as z:z.writestr('calendar-production-publication.json',${JSON.stringify(JSON.stringify(payload))})
sys.stdout.buffer.write(b.getvalue())`,
  ]);
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    if (calls === 1) {
      assert.equal(options.headers.Authorization, 'Bearer fixture');
      assert.equal(options.redirect, 'manual');
      return new Response(null, {
        status: 302,
        headers: { location: 'https://fixture.blob.core.windows.net/archive' },
      });
    }
    assert.equal(url, 'https://fixture.blob.core.windows.net/archive');
    assert.deepEqual(options.headers, {});
    return new Response(zip);
  };
  assert.deepEqual(
    await publicationReceipt({
      url: 'https://api.github.com/artifact/zip',
      env: { GITHUB_TOKEN: 'fixture' },
      app: 'calendar',
      fetcher,
    }),
    payload
  );
  assert.equal(calls, 2);
});
for (const location of [
  'https://attacker.example/archive',
  'http://fixture.blob.core.windows.net/archive',
  'https://user:pass@fixture.blob.core.windows.net/archive',
])
  test('receipt download rejects untrusted storage URL', async () => {
    let calls = 0;
    await assert.rejects(
      publicationReceipt({
        url: 'https://api.github.com/artifact/zip',
        env: { GITHUB_TOKEN: 'fixture' },
        app: 'calendar',
        fetcher: async () => {
          calls++;
          return new Response(null, { status: 302, headers: { location } });
        },
      })
    );
    assert.equal(calls, 1);
  });

test('oversized receipt download is refused before decoding', async () => {
  let calls = 0;
  await assert.rejects(
    publicationReceipt({
      url: 'https://api.github.com/artifact/zip',
      env: { GITHUB_TOKEN: 'fixture' },
      app: 'calendar',
      fetcher: async () =>
        ++calls === 1
          ? new Response(null, {
              status: 302,
              headers: {
                location: 'https://fixture.blob.core.windows.net/archive',
              },
            })
          : new Response(new Uint8Array(1024 * 1024 + 1)),
    }),
    /exceeds limit/
  );
});
