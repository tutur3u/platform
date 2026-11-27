import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isDraftAppRejection, publishPlayBeta } from './play-beta.mjs';
import { GOOGLE_ORIGIN } from './verify-store.mjs';

const APP_ID = 'com.tuturuuu.app.mobile';
const DRAFT_APP_MESSAGE =
  'Only releases with status draft may be created on draft app.';
const BUILD = '578001';

// The message shape CI logged for the rejected promotion commit.
const draftAppError = () =>
  new Error(
    `Store API request failed (400, /androidpublisher/v3/applications/[redacted]/edits/[redacted]:commit; INVALID_ARGUMENT, 400, ${DRAFT_APP_MESSAGE})`
  );

test("only Play's draft-app rejection, returned as a 400, selects draft status", () => {
  assert.equal(isDraftAppRejection(draftAppError()), true);
  assert.equal(
    isDraftAppRejection(
      new Error(
        `Store API request failed (403, /androidpublisher/v3/applications/x/edits/y:commit; PERMISSION_DENIED, 403, ${DRAFT_APP_MESSAGE})`
      )
    ),
    false
  );
  assert.equal(
    isDraftAppRejection(
      new Error(
        'Store API request failed (400, /androidpublisher/v3/applications/x/edits/y:commit; INVALID_ARGUMENT, 400, Release notes are too long.)'
      )
    ),
    false
  );
  assert.equal(isDraftAppRejection(new Error('network down')), false);
  assert.equal(isDraftAppRejection(undefined), false);
});

// In-memory Play: staged edits become visible only on a successful commit, and
// a commit of a non-draft testing release is rejected while the app is a draft.
function fakePlay({ draftApp, commitError = null }) {
  const committed = {
    internal: {
      track: 'internal',
      releases: [
        {
          name: '0.27.20',
          versionCodes: [BUILD],
          status: 'completed',
          releaseNotes: [{ language: 'en-US', text: '- Fix login' }],
        },
      ],
    },
    alpha: { track: 'alpha', releases: [] },
  };
  const edits = new Map();
  const state = { commitAttempts: 0, nextEdit: 0 };
  const reply = (body, status = 200) =>
    status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
  const handler = async (url, options = {}) => {
    const href = String(url);
    const { pathname } = new URL(href);
    const method = options.method ?? 'GET';
    if (href.startsWith('https://oauth2.googleapis.com'))
      return reply({ access_token: 'token' });
    const appPath = `/androidpublisher/v3/applications/${APP_ID}`;
    if (pathname === `${appPath}/edits` && method === 'POST') {
      const id = `e${++state.nextEdit}`;
      edits.set(id, { tracks: {} });
      return reply({ id });
    }
    const releases = pathname.match(
      new RegExp(`^${appPath}/tracks/([^/]+)/releases$`, 'u')
    );
    if (releases) return reply({ releases: [] });
    const edit = pathname.match(
      new RegExp(`^${appPath}/edits/([^/:]+)(.*)$`, 'u')
    );
    if (!edit) throw new Error(`Unexpected request ${method} ${pathname}`);
    const [, id, rest] = edit;
    const staged = edits.get(id);
    if (!staged) throw new Error(`Unknown edit ${id}`);
    if (rest === '' && method === 'DELETE') {
      edits.delete(id);
      return reply(null, 204);
    }
    if (rest === ':commit') {
      state.commitAttempts += 1;
      const next = { ...committed, ...staged.tracks };
      const testing = Object.entries(next).filter(
        ([track]) => track !== 'internal'
      );
      if (commitError) return reply({ error: commitError }, 400);
      if (
        draftApp &&
        testing.some(([, track]) =>
          track.releases?.some((release) => release.status === 'completed')
        )
      )
        return reply(
          {
            error: {
              code: 400,
              status: 'INVALID_ARGUMENT',
              message: DRAFT_APP_MESSAGE,
            },
          },
          400
        );
      Object.assign(committed, staged.tracks);
      edits.delete(id);
      return reply({});
    }
    if (rest === '/listings')
      return reply({ listings: [{ language: 'en-US' }, { language: 'vi' }] });
    if (rest === '/tracks')
      return reply({
        tracks: Object.keys(committed).map((track) => ({ track })),
      });
    const track = rest.match(/^\/tracks\/([^/]+)$/u);
    if (track) {
      const name = decodeURIComponent(track[1]);
      if (method === 'PUT') {
        staged.tracks[name] = JSON.parse(options.body);
        return reply(staged.tracks[name]);
      }
      return reply(staged.tracks[name] ?? committed[name]);
    }
    throw new Error(`Unexpected edit request ${method} ${rest}`);
  };
  return { handler, committed, state };
}

async function publishFor(t, play) {
  const dir = mkdtempSync(path.join(tmpdir(), 'play-beta-draft-'));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(
    path.join(dir, 'account.json'),
    JSON.stringify({
      client_email: 'ci@example.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    })
  );
  writeFileSync(path.join(dir, 'whatsnew-en-US'), '- Fix login\n');
  const previous = {
    tracks: process.env.GOOGLE_PLAY_BETA_TRACKS,
    account: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH,
  };
  process.env.GOOGLE_PLAY_BETA_TRACKS = 'alpha';
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH = path.join(
    dir,
    'account.json'
  );
  const logs = [];
  t.mock.method(console, 'log', (message) => logs.push(String(message)));
  t.mock.method(globalThis, 'fetch', play.handler);
  t.after(() => {
    for (const [key, value] of [
      ['GOOGLE_PLAY_BETA_TRACKS', previous.tracks],
      ['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH', previous.account],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const outcome = await publishPlayBeta(BUILD, dir).then(
    (summary) => ({ summary }),
    (error) => ({ error })
  );
  return { ...outcome, logs };
}

test('a published app keeps testing releases completed without a retry', async (t) => {
  const play = fakePlay({ draftApp: false });
  const { summary, error, logs } = await publishFor(t, play);
  assert.equal(error, undefined);
  assert.equal(summary.testingStatus, 'completed');
  assert.equal(play.state.commitAttempts, 1);
  assert.equal(play.committed.alpha.releases[0].status, 'completed');
  assert.equal(play.committed.alpha.releases[0].versionCodes[0], BUILD);
  assert.equal(play.committed.internal.releases[0].status, 'completed');
  assert.ok(
    !logs.some((line) => line.includes('still in draft')),
    'a published app must not log the draft fallback'
  );
});

test('a draft app retries once with draft testing releases and logs why', async (t) => {
  const play = fakePlay({ draftApp: true });
  const { summary, error, logs } = await publishFor(t, play);
  assert.equal(error, undefined);
  assert.equal(summary.testingStatus, 'draft');
  assert.equal(play.state.commitAttempts, 2);
  assert.equal(play.committed.alpha.releases[0].status, 'draft');
  assert.equal(play.committed.alpha.releases[0].versionCodes[0], BUILD);
  // Internal stays completed: Play accepts completed releases there.
  assert.equal(play.committed.internal.releases[0].status, 'completed');
  assert.ok(
    logs.some(
      (line) => line.includes('still in draft') && line.includes('draft status')
    ),
    'the draft fallback must be logged'
  );
});

test('a rerun reuses its own draft release without a rejected commit', async (t) => {
  const play = fakePlay({ draftApp: true });
  play.committed.alpha.releases = [
    {
      name: '0.27.20',
      versionCodes: [BUILD],
      status: 'draft',
      releaseNotes: [],
    },
  ];
  const { summary, error, logs } = await publishFor(t, play);
  assert.equal(error, undefined);
  assert.equal(summary.testingStatus, 'draft');
  // Only the internal notes commit runs; no completed attempt is rejected first.
  assert.equal(play.state.commitAttempts, 1);
  assert.equal(play.committed.alpha.releases.length, 1);
  assert.equal(play.committed.alpha.releases[0].status, 'draft');
  assert.ok(logs.some((line) => line.includes('already has a draft release')));
  assert.ok(!logs.some((line) => line.includes('still in draft')));
});

test('a draft left by an earlier build still blocks promotion and is never replaced', async (t) => {
  const play = fakePlay({ draftApp: true });
  play.committed.alpha.releases = [
    {
      name: '0.27.19',
      versionCodes: ['577001'],
      status: 'draft',
      releaseNotes: [],
    },
  ];
  const { error } = await publishFor(t, play);
  assert.match(error?.message ?? '', /draft or staged rollout/u);
  assert.equal(play.state.commitAttempts, 0);
  assert.equal(play.committed.alpha.releases[0].versionCodes[0], '577001');
});

test('other commit rejections still fail without the draft fallback', async (t) => {
  const play = fakePlay({
    draftApp: false,
    commitError: {
      code: 400,
      status: 'INVALID_ARGUMENT',
      message: 'Release notes are too long.',
    },
  });
  const { error } = await publishFor(t, play);
  assert.match(error?.message ?? '', /Store API request failed \(400/u);
  assert.equal(play.state.commitAttempts, 1);
  assert.equal(play.committed.alpha.releases.length, 0);
});
