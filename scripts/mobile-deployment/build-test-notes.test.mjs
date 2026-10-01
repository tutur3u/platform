import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureBuildWhatsNew,
  originalBuildHistory,
  renderBuildTestNotes,
} from './build-test-notes.mjs';
import { distributeTestFlightBuild } from './verify-store.mjs';

const sha = 'e'.repeat(40);
const identity = { version: '0.20.4', number: '307001', sourceSha: sha };
const history = {
  build: identity,
  releases: [
    {
      version: '0.20.4',
      changes: ['add scoped timezone settings and preserve calendar instants'],
    },
    { version: '0.20.5', changes: ['later settings changes'] },
  ],
};

test('renders only exact version notes, excluding later unshipped changes', () => {
  assert.equal(
    renderBuildTestNotes(history, identity),
    'Please test 0.20.4:\n- add scoped timezone settings and preserve calendar instants'
  );
});
for (const field of ['version', 'number', 'sourceSha']) {
  test(`refuses artifact ${field} mismatch`, () => {
    assert.throws(
      () =>
        renderBuildTestNotes(
          {
            ...history,
            build: {
              ...identity,
              [field]: field === 'sourceSha' ? 'a'.repeat(40) : 'other',
            },
          },
          identity
        ),
      /does not match/
    );
  });
}
test('does not infer missing, empty or ambiguous version history', () => {
  for (const releases of [
    [],
    [{ version: '0.20.5', changes: ['later'] }],
    [{ version: '0.20.4', changes: [] }],
    [history.releases[0], history.releases[0]],
  ]) {
    assert.throws(() =>
      renderBuildTestNotes({ ...history, releases }, identity)
    );
  }
});

function localizationApi(initial, { readbackFails = false } = {}) {
  let english = initial;
  const calls = [];
  const other = {
    id: 'vi',
    attributes: { locale: 'vi', whatsNew: 'Existing Vietnamese notes' },
  };
  return {
    calls,
    apple: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === '/v1/builds/build/betaBuildLocalizations?limit=200')
        return { data: [...(english ? [english] : []), other] };
      const body = JSON.parse(options.body);
      if (!readbackFails)
        english = {
          id: 'english',
          attributes: {
            locale: 'en-US',
            whatsNew: body.data.attributes.whatsNew,
          },
        };
      return { data: english };
    },
  };
}
for (const initial of [
  undefined,
  { id: 'english', attributes: { locale: 'en-US', whatsNew: '' } },
  { id: 'english', attributes: { locale: 'en-US', whatsNew: '  ' } },
]) {
  test(`fills ${initial ? 'blank' : 'absent'} English notes and verifies readback`, async () => {
    const api = localizationApi(initial);
    await ensureBuildWhatsNew(api.apple, 'build', 'Exact build notes');
    const mutations = api.calls.filter(({ options }) => options.method);
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].options.method, initial ? 'PATCH' : 'POST');
    assert.ok(!mutations[0].path.includes('/vi'));
    assert.equal(
      api.calls.at(-1).path,
      '/v1/builds/build/betaBuildLocalizations?limit=200'
    );
  });
}
test('preserves nonempty manual text without resolving replacement history', async () => {
  const api = localizationApi({
    id: 'english',
    attributes: { locale: 'en-US', whatsNew: 'Manually approved text' },
  });
  assert.equal(
    await ensureBuildWhatsNew(api.apple, 'build', () => {
      throw new Error('Must not replace');
    }),
    'preserved'
  );
  assert.equal(api.calls.length, 1);
});
test('readback failure is reported', async () => {
  const api = localizationApi(undefined, { readbackFails: true });
  await assert.rejects(
    ensureBuildWhatsNew(api.apple, 'build', 'Exact notes'),
    /readback failed/
  );
});

for (const artifactMismatch of [false, true]) {
  test(`retry resolves attempt 1 after run 207 advances to attempt 2${artifactMismatch ? ' and rejects mismatched history' : ''}`, async () => {
    const calls = [];
    const run = (_command, args) => {
      calls.push(args);
      const path = args[1];
      if (_command === 'unzip')
        return JSON.stringify(
          artifactMismatch
            ? { ...history, build: { ...identity, number: '307002' } }
            : history
        );
      if (path.includes('/workflows/'))
        return JSON.stringify({
          workflow_runs: [
            {
              id: 999,
              run_number: 209,
              run_attempt: 1,
              head_branch: 'production',
              head_sha: 'a'.repeat(40),
            },
            {
              id: 207,
              run_number: 207,
              run_attempt: 2,
              head_branch: 'production',
              head_sha: sha,
            },
          ],
        });
      if (path.endsWith('/runs/207/attempts/1'))
        return JSON.stringify({
          id: 207,
          run_number: 207,
          run_attempt: 1,
          head_branch: 'production',
          head_sha: sha,
          event: 'push',
        });
      if (path.includes('/runs/207/artifacts'))
        return JSON.stringify({
          artifacts: [
            {
              id: 17,
              name: 'mobile-beta-release-history',
              expired: false,
              size_in_bytes: 400,
            },
          ],
        });
      if (path.endsWith('/artifacts/17/zip'))
        return Buffer.from('synthetic archive');
      throw new Error('Unexpected source lookup');
    };
    if (artifactMismatch) {
      await assert.rejects(
        originalBuildHistory('307001', '0.20.4', { run }),
        /does not match/
      );
    } else {
      assert.match(
        await originalBuildHistory('307001', '0.20.4', { run }),
        /calendar instants/
      );
    }
    assert.ok(calls.some((args) => args[1]?.endsWith('/runs/207/attempts/1')));
    assert.ok(calls.some((args) => args[1]?.includes('/runs/207/artifacts')));
    assert.ok(!calls.some((args) => args[1]?.includes('/runs/999/artifacts')));
  });
}
for (const expired of [true, false]) {
  test(`retry refuses ${expired ? 'expired artifact' : 'unmapped upload'} without using checkout notes`, async () => {
    const run = (_command, args) =>
      JSON.stringify(
        args[1].includes('/attempts/')
          ? {
              id: 207,
              run_number: 207,
              run_attempt: 1,
              head_branch: 'production',
              head_sha: sha,
              event: 'push',
            }
          : args[1].includes('/workflows/')
            ? {
                workflow_runs: expired
                  ? [
                      {
                        id: 207,
                        run_number: 207,
                        run_attempt: 1,
                        head_branch: 'production',
                        head_sha: sha,
                      },
                    ]
                  : [],
              }
            : {
                artifacts: [
                  {
                    id: 17,
                    name: 'mobile-beta-release-history',
                    expired: true,
                  },
                ],
              }
      );
    await assert.rejects(originalBuildHistory('307001', '0.20.4', { run }));
  });
}

for (const deferral of ['metadata', 'unsafe reviewer', 'pending', 'history']) {
  test(`notes and internal group availability remain separate from ${deferral} review deferral`, async () => {
    const api = localizationApi({
      id: 'english',
      attributes: { locale: 'en-US', whatsNew: '' },
    });
    const groups = [
      { id: 'internal', attributes: { isInternalGroup: true } },
      { id: 'external', attributes: { isInternalGroup: false } },
    ];
    const reviewCalls = [];
    const apple = async (path, options = {}) => {
      if (path.includes('betaBuildLocalizations'))
        return api.apple(path, options);
      reviewCalls.push({ path, options });
      if (path === '/v1/apps/app/betaGroups?limit=200') return { data: groups };
      if (path === '/v1/builds/build?include=betaGroups')
        return { data: { relationships: { betaGroups: { data: groups } } } };
      if (path.startsWith('/v1/betaAppReviewSubmissions?')) return { data: [] };
      if (path === '/v1/builds/build?include=preReleaseVersion')
        return {
          data: {
            relationships: { preReleaseVersion: { data: { id: 'version' } } },
          },
        };
      if (path.startsWith('/v1/builds?'))
        return {
          data:
            deferral === 'pending'
              ? [
                  {
                    id: 'older',
                    relationships: {
                      preReleaseVersion: { data: { id: 'version' } },
                    },
                  },
                ]
              : [],
        };
      if (path === '/v1/apps/app/betaAppReviewDetail')
        return {
          data: {
            attributes:
              deferral === 'unsafe reviewer'
                ? {
                    demoAccountRequired: true,
                    demoAccountName: 'review@tuturuuu.com',
                    demoAccountPassword: 'synthetic-test-value',
                    notes: 'Synthetic review instructions',
                  }
                : { demoAccountRequired: false },
          },
        };
      throw new Error('Unexpected request');
    };
    assert.deepEqual(
      await distributeTestFlightBuild(apple, 'app', 'build', {
        enabled: 'true',
        groups: 'all',
        loadTestNotes: async () => {
          if (deferral === 'history') throw new Error('Source mismatch');
          return renderBuildTestNotes(history, identity);
        },
      }),
      groups
    );
    assert.ok(reviewCalls.every(({ options }) => !options.method));
    assert.equal(
      api.calls.filter(({ options }) => options.method).length,
      deferral === 'history' ? 0 : 1
    );
  });
}
