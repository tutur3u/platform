import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAY_NOTES_LIMIT,
  pendingReviewTracks,
  VI_NOTES_HEADER,
  parseBetaTracks,
  planPlayBeta,
  vietnameseListing,
  vietnameseNotes,
} from './play-beta.mjs';

test('beta tracks are opt-in, deduplicated, and never public or internal', () => {
  assert.deepEqual(parseBetaTracks(''), []);
  assert.deepEqual(parseBetaTracks(undefined), []);
  assert.deepEqual(parseBetaTracks(' alpha, beta ,alpha'), ['alpha', 'beta']);
  assert.throws(() => parseBetaTracks('alpha,production'), /production/);
  assert.throws(() => parseBetaTracks('internal'), /internal/);
  assert.throws(() => parseBetaTracks('qa'), /qa/);
  assert.throws(() => parseBetaTracks('wear:production'), /wear:production/);
  assert.throws(() => parseBetaTracks('tv:internal'), /tv:internal/);
  assert.deepEqual(parseBetaTracks('wear:beta'), ['wear:beta']);
  assert.throws(() => parseBetaTracks('Alpha Track'), /Invalid/);
});

test('Vietnamese Play notes keep whole bullets within the Play limit', () => {
  assert.equal(vietnameseNotes(''), '');
  assert.equal(
    vietnameseNotes('- Fix login\n- Add tasks\n'),
    `${VI_NOTES_HEADER}\n- Fix login\n- Add tasks`
  );
  const long = Array.from(
    { length: 40 },
    (_, i) => `- Change ${i} ${'x'.repeat(20)}`
  ).join('\n');
  const notes = vietnameseNotes(long);
  assert.ok([...notes].length <= PLAY_NOTES_LIMIT);
  assert.ok(
    notes
      .split('\n')
      .slice(1)
      .every((line) => long.includes(line))
  );
  assert.equal(vietnameseNotes(`- ${'y'.repeat(600)}`), '');
});

test('Vietnamese notes are written only when the listing has Vietnamese', () => {
  assert.equal(vietnameseListing({ listings: [{ language: 'en-US' }] }), null);
  assert.equal(
    vietnameseListing({
      listings: [{ language: 'en-US' }, { language: 'vi' }],
    }),
    'vi'
  );
  assert.equal(vietnameseListing({}), null);
});

const internal = {
  track: 'internal',
  releases: [
    {
      name: '0.27.20',
      versionCodes: ['578001'],
      status: 'completed',
      releaseNotes: [{ language: 'en-US', text: '- Fix login' }],
    },
  ],
};

test('promotion reuses the exact verified internal version code', () => {
  const vi = [{ language: 'vi', text: `${VI_NOTES_HEADER}\n- Fix login` }];
  const updates = planPlayBeta({
    internal,
    buildNumber: '578001',
    notes: vi,
    targets: { alpha: { track: 'alpha', releases: [] } },
  });
  assert.deepEqual(
    updates.map((update) => update.track),
    ['internal', 'alpha']
  );
  assert.deepEqual(updates[1].releases, [
    {
      name: '0.27.20',
      versionCodes: ['578001'],
      status: 'completed',
      releaseNotes: [internal.releases[0].releaseNotes[0], vi[0]],
    },
  ]);
  assert.deepEqual(
    updates[0].releases[0].releaseNotes.map((note) => note.language),
    ['en-US', 'vi']
  );
});

test('nothing is committed without notes or opted-in tracks', () => {
  assert.deepEqual(
    planPlayBeta({ internal, buildNumber: '578001', notes: [], targets: {} }),
    []
  );
});

test('promotion refuses a build missing from the internal track', () => {
  assert.throws(
    () =>
      planPlayBeta({
        internal,
        buildNumber: '999001',
        notes: [],
        targets: { alpha: {} },
      }),
    /not a completed Google Play internal release/
  );
});

test('a rerun skips tracks that already carry the build and its notes', () => {
  const alpha = { track: 'alpha', releases: [internal.releases[0]] };
  assert.deepEqual(
    planPlayBeta({
      internal,
      buildNumber: '578001',
      notes: [],
      targets: { alpha },
    }),
    []
  );
});

test('promotion never replaces a staged rollout', () => {
  assert.throws(
    () =>
      planPlayBeta({
        internal,
        buildNumber: '578001',
        notes: [],
        targets: {
          beta: {
            releases: [
              {
                status: 'inProgress',
                versionCodes: ['577001'],
                userFraction: 0.2,
              },
            ],
          },
        },
      }),
    /draft or staged rollout/
  );
});

test('notes merge into an existing target release without dropping metadata', () => {
  const vi = [{ language: 'vi', text: `${VI_NOTES_HEADER}\n- Fix login` }];
  const target = {
    track: 'alpha',
    releases: [
      {
        name: 'Alpha 0.27.20',
        versionCodes: ['578001'],
        status: 'completed',
        releaseNotes: [{ language: 'fr-FR', text: 'Corrections' }],
      },
      { versionCodes: ['570001'], status: 'completed' },
    ],
  };
  const [, alpha] = planPlayBeta({
    internal,
    buildNumber: '578001',
    notes: vi,
    targets: { alpha: target },
  });
  assert.equal(alpha.releases.length, 2);
  assert.equal(alpha.releases[0].name, 'Alpha 0.27.20');
  assert.deepEqual(
    alpha.releases[0].releaseNotes.map((note) => note.language),
    ['fr-FR', 'vi']
  );
  assert.deepEqual(alpha.releases[1], target.releases[1]);
});

test('internal upload commits with ERROR_IF_IN_REVIEW and cleans up on failure', async (t) => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { uploadInternal } = await import('./play-beta.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'play-upload-'));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(
    path.join(dir, 'account.json'),
    JSON.stringify({
      client_email: 'ci@example.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    })
  );
  writeFileSync(path.join(dir, 'app.aab'), 'bundle');
  writeFileSync(path.join(dir, 'whatsnew-en-US'), '- Fix login\n');
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH = path.join(
    dir,
    'account.json'
  );
  const calls = [];
  const respond = (body) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  let pending = false;
  let newer = false;
  const run = async (versionCode) => {
    calls.length = 0;
    t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
      calls.push({
        url: String(url),
        method: options.method ?? 'GET',
        body: options.body,
      });
      if (String(url).includes('oauth2')) return respond({ access_token: 'x' });
      if (String(url).endsWith('/edits')) return respond({ id: 'e1' });
      if (String(url).includes('/bundles')) return respond({ versionCode });
      if (String(url).endsWith('/edits/e1/tracks/internal'))
        return respond({
          track: 'internal',
          releases: newer
            ? [{ status: 'completed', versionCodes: ['1000009'] }]
            : [],
        });
      if (String(url).endsWith('/edits/e1/tracks'))
        return respond({
          tracks: [{ track: 'internal' }, { track: 'production' }],
        });
      if (String(url).endsWith('/releases'))
        return respond({
          releases:
            pending && String(url).includes('/tracks/production/')
              ? [
                  {
                    releaseLifecycleState:
                      'RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW',
                  },
                ]
              : [
                  {
                    releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_PUBLISHED',
                  },
                ],
        });
      return respond({});
    });
    return uploadInternal('578001', path.join(dir, 'app.aab'), dir);
  };

  await run(578001);
  const urls = calls.map((call) => `${call.method} ${call.url}`);
  assert.ok(
    urls.some((url) =>
      url.includes(
        'POST https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/com.tuturuuu.app.mobile/edits/e1/bundles?uploadType=media'
      )
    )
  );
  const put = calls.find((call) => call.method === 'PUT');
  assert.deepEqual(JSON.parse(put.body).releases, [
    {
      versionCodes: ['578001'],
      status: 'completed',
      releaseNotes: [{ language: 'en-US', text: '- Fix login' }],
    },
  ]);
  assert.ok(
    urls.some((url) =>
      url.endsWith(
        '/edits/e1:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW'
      )
    )
  );
  assert.ok(!urls.some((url) => url.startsWith('DELETE')));

  assert.ok(
    urls.some((url) =>
      url.endsWith(
        '/applications/com.tuturuuu.app.mobile/tracks/production/releases'
      )
    )
  );

  pending = true;
  await assert.rejects(run(578001), /not yet sent for review/);
  assert.ok(!calls.some((call) => call.url.includes(':commit')));
  pending = false;

  newer = true;
  await assert.rejects(run(578001), /newer than 578001/);
  assert.ok(!calls.some((call) => call.url.includes('/bundles')));
  newer = false;

  await assert.rejects(run(999), /expected 578001/);
  assert.ok(!calls.some((call) => call.url.includes(':commit')));
  assert.ok(calls.some((call) => call.method === 'DELETE'));
});

test('generated notes never replace a hand-written translation', () => {
  const manual = { language: 'vi', text: 'Bản dịch thủ công' };
  const generated = [
    { language: 'vi', text: `${VI_NOTES_HEADER}\n- Fix login` },
  ];
  const withManual = {
    ...internal,
    releases: [
      {
        ...internal.releases[0],
        releaseNotes: [internal.releases[0].releaseNotes[0], manual],
      },
    ],
  };
  const updates = planPlayBeta({
    internal: withManual,
    buildNumber: '578001',
    notes: generated,
    targets: {
      alpha: { releases: [{ ...withManual.releases[0] }] },
    },
  });
  assert.deepEqual(updates, []);
});

test('pending releases on any track are reported before a commit', () => {
  assert.deepEqual(
    pendingReviewTracks({
      internal: {
        releases: [
          { releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_PUBLISHED' },
        ],
      },
      production: {
        releases: [
          {
            releaseLifecycleState:
              'RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW',
          },
        ],
      },
      alpha: {},
    }),
    ['production']
  );
});

test('promotion never replaces a draft release', () => {
  assert.throws(
    () =>
      planPlayBeta({
        internal,
        buildNumber: '578001',
        notes: [],
        targets: {
          alpha: {
            releases: [{ status: 'draft', versionCodes: ['577001'] }],
          },
        },
      }),
    /draft or staged rollout/
  );
});

test('an unreadable release list fails closed before a commit', () => {
  for (const page of [null, [], { releases: {} }, 'x']) {
    assert.throws(
      () => pendingReviewTracks({ production: page }),
      /unreadable release list/
    );
  }
  assert.deepEqual(pendingReviewTracks({ alpha: {} }), []);
});

test('an unreadable target track is never planned over', () => {
  for (const state of [null, [], 'x', { releases: {} }]) {
    assert.throws(
      () =>
        planPlayBeta({
          internal,
          buildNumber: '578001',
          notes: [],
          targets: { alpha: state },
        }),
      /is unreadable/
    );
  }
});

test('an unknown or missing release state stops the commit', () => {
  for (const release of [
    {},
    { releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_UNSPECIFIED' },
    { releaseLifecycleState: 'SOMETHING_NEW' },
    null,
  ]) {
    assert.throws(
      () => pendingReviewTracks({ production: { releases: [release] } }),
      /unknown release state/
    );
  }
});

test('promotion never moves a track back to an older build', () => {
  assert.throws(
    () =>
      planPlayBeta({
        internal,
        buildNumber: '578001',
        notes: [],
        targets: {
          alpha: {
            releases: [{ status: 'completed', versionCodes: ['1000004'] }],
          },
        },
      }),
    /newer than 578001/
  );
});

test('promotion refuses when internal already serves a newer code', () => {
  assert.throws(
    () =>
      planPlayBeta({
        internal: {
          ...internal,
          releases: [
            ...internal.releases,
            { status: 'completed', versionCodes: ['1000009'] },
          ],
        },
        buildNumber: '578001',
        notes: [],
        targets: { alpha: {} },
      }),
    /internal already serves a build newer than 578001/
  );
});
