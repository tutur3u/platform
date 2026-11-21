#!/usr/bin/env node
// Adds Vietnamese What's New to the verified internal release and promotes the
// same version code to opted-in Google Play testing tracks in one committed edit.
import { appendFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { json, jwt } from './verify-store.mjs';

const APP_ID = 'com.tuturuuu.app.mobile';
const GOOGLE_ORIGIN = 'https://androidpublisher.googleapis.com';
export const PLAY_NOTES_LIMIT = 500;
export const VI_NOTES_HEADER = 'Bản thử nghiệm mới:';
const TRACK_PATTERN = /^[a-z0-9:_-]{1,64}$/u;
const RESERVED_TRACKS = new Set(['production', 'internal', 'qa']);
const ROLLOUT_STATUSES = new Set(['inProgress', 'halted', 'draft']);

export function parseBetaTracks(value) {
  const tracks = [
    ...new Set(
      String(value ?? '')
        .split(',')
        .map((track) => track.trim())
        .filter(Boolean)
    ),
  ];
  for (const track of tracks) {
    if (!TRACK_PATTERN.test(track))
      throw new Error(`Invalid Google Play track name: ${track}`);
    // Public release stays a human App Review / rollout decision. Form-factor
    // tracks such as `wear:production` carry the same meaning after the prefix.
    if (RESERVED_TRACKS.has(track.split(':').at(-1)))
      throw new Error(`GOOGLE_PLAY_BETA_TRACKS cannot include ${track}`);
  }
  return tracks;
}

// Bullet text comes from commit summaries and stays in its source language;
// the localized header tells Vietnamese testers what the list is.
export function vietnameseNotes(englishNotes, limit = PLAY_NOTES_LIMIT) {
  const lines = String(englishNotes ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
  let text = VI_NOTES_HEADER;
  for (const line of lines) {
    const next = `${text}\n${line}`;
    if ([...next].length > limit) break;
    text = next;
  }
  return text === VI_NOTES_HEADER ? '' : text;
}

export function vietnameseListing(listings) {
  return (
    (listings?.listings ?? [])
      .map((listing) => listing.language)
      .find((language) => /^vi(-|$)/iu.test(language ?? '')) ?? null
  );
}

export function withNotes(release, notes) {
  const byLanguage = new Map(
    (release.releaseNotes ?? []).map((note) => [note.language, note])
  );
  // Hand-written notes for a language always win over generated ones.
  for (const note of notes)
    if (!byLanguage.get(note.language)?.text?.trim())
      byLanguage.set(note.language, note);
  return { ...release, releaseNotes: [...byLanguage.values()] };
}

/** A track already serving a higher version code than this build. */
export function hasNewerBuild(track, buildNumber) {
  return (track?.releases ?? []).some((release) =>
    (release.versionCodes ?? []).some(
      (code) => Number(code) > Number(buildNumber)
    )
  );
}

export function releaseForBuild(track, buildNumber) {
  return (
    track?.releases?.find(
      (release) =>
        release.status === 'completed' &&
        release.versionCodes?.map(String).includes(String(buildNumber))
    ) ?? null
  );
}

function hasNotes(release, notes) {
  return notes.every((note) =>
    release.releaseNotes?.some(
      (entry) => entry.language === note.language && entry.text?.trim()
    )
  );
}

const NOT_SENT_FOR_REVIEW = 'RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW';
// Every state a commit can safely coexist with. Anything unknown, unspecified
// or missing stops the commit, because its effect on review is unknowable.
const SETTLED_STATES = new Set([
  'RELEASE_LIFECYCLE_STATE_DRAFT',
  'RELEASE_LIFECYCLE_STATE_IN_REVIEW',
  'RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED',
  'RELEASE_LIFECYCLE_STATE_NOT_APPROVED',
  'RELEASE_LIFECYCLE_STATE_PUBLISHED',
]);

function readableTrack(page) {
  return (
    page &&
    typeof page === 'object' &&
    !Array.isArray(page) &&
    (page.releases === undefined || Array.isArray(page.releases))
  );
}

/**
 * The JSON shape of an unexpected response, for logs: types and top-level
 * key names only, never values, so store data cannot leak into CI output.
 */
export function responseShape(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value !== 'object') return typeof value;
  const keys = Object.keys(value).sort();
  const listed = keys
    .slice(0, 8)
    .map((key) => {
      const field = value[key];
      const type =
        field === null ? 'null' : Array.isArray(field) ? 'array' : typeof field;
      return `${key}:${type}`;
    })
    .join(',');
  return `object{${listed}${keys.length > 8 ? ',…' : ''}}`;
}

/** Tracks holding releases that a commit would send for review with ours. */
export function pendingReviewTracks(byTrack) {
  for (const [track, page] of Object.entries(byTrack)) {
    // An empty list may omit `releases`, or come back with no content at all
    // (204, read as null); anything else is not a list result.
    if (page !== null && !readableTrack(page))
      throw new Error(
        `Google Play returned an unreadable release list for track ${track} (${responseShape(page)})`
      );
    for (const release of page?.releases ?? []) {
      const state = release?.releaseLifecycleState;
      if (state !== NOT_SENT_FOR_REVIEW && !SETTLED_STATES.has(state))
        throw new Error(
          `Google Play returned an unknown release state on track ${track} (${typeof state === 'string' ? state : responseShape(state)})`
        );
    }
  }
  return Object.entries(byTrack)
    .filter(([, page]) =>
      (page?.releases ?? []).some(
        (release) => release.releaseLifecycleState === NOT_SENT_FOR_REVIEW
      )
    )
    .map(([track]) => track);
}

// A commit sends every change waiting for review, including releases someone
// staged by hand on another track (production included). Refuse instead.
async function assertNothingPendingReview(editUrl, headers) {
  const listed = await json(`${editUrl}/tracks`, { headers });
  if (!Array.isArray(listed?.tracks))
    throw new Error('Google Play track list is unavailable');
  const appUrl = editUrl.replace(/\/edits\/[^/]+$/u, '');
  const byTrack = {};
  for (const { track } of listed.tracks) {
    if (typeof track !== 'string' || !track)
      throw new Error('Google Play returned an unnamed track');
    byTrack[track] = await json(
      `${appUrl}/tracks/${encodeURIComponent(track)}/releases`,
      { headers }
    );
  }
  const pending = pendingReviewTracks(byTrack);
  if (pending.length)
    throw new Error(
      `Google Play has releases not yet sent for review on ${pending.length} track(s); send or discard them in Play Console before CI commits`
    );
}

/**
 * Plans one edit. `targets` maps each opted-in track to its current state, so
 * a track that already carries this build is skipped and a staged rollout is
 * never replaced.
 */
export function planPlayBeta({ internal, buildNumber, notes, targets }) {
  // Planned inside the promotion edit, so a newer internal release published
  // since the job's earlier check stops an older build from being promoted.
  if (hasNewerBuild(internal, buildNumber))
    throw new Error(
      `Google Play internal already serves a build newer than ${buildNumber}`
    );
  const release = releaseForBuild(internal, buildNumber);
  if (!release)
    throw new Error(
      `Build ${buildNumber} is not a completed Google Play internal release`
    );
  const updates = [];
  if (notes.length && !hasNotes(release, notes)) {
    updates.push({
      track: 'internal',
      releases: internal.releases.map((entry) =>
        entry === release ? withNotes(entry, notes) : entry
      ),
    });
  }
  const promoted = withNotes(
    {
      name: release.name,
      versionCodes: [String(buildNumber)],
      status: 'completed',
      releaseNotes: release.releaseNotes ?? [],
    },
    notes
  );
  for (const [track, state] of Object.entries(targets)) {
    if (!readableTrack(state))
      throw new Error(
        `Google Play track ${track} is unreadable (${responseShape(state)})`
      );
    if (hasNewerBuild(state, buildNumber))
      throw new Error(
        `Google Play track ${track} already serves a build newer than ${buildNumber}`
      );
    const existing = releaseForBuild(state, buildNumber);
    if (existing) {
      // Keep the target's own release list and metadata; only add notes.
      if (!hasNotes(existing, notes))
        updates.push({
          track,
          releases: state.releases.map((entry) =>
            entry === existing ? withNotes(entry, notes) : entry
          ),
        });
      continue;
    }
    if (state?.releases?.some((entry) => ROLLOUT_STATUSES.has(entry.status)))
      throw new Error(
        `Google Play track ${track} has a draft or staged rollout; finish or discard it in Play Console first`
      );
    updates.push({ track, releases: [promoted] });
  }
  return updates;
}

async function playHeaders() {
  const account = JSON.parse(
    await readFile(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH, 'utf8')
  );
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 600,
    },
    account.private_key
  );
  const token = await json('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  return {
    Authorization: `Bearer ${token.access_token}`,
    'Content-Type': 'application/json',
  };
}

async function withEdit(headers, run) {
  const base = `${GOOGLE_ORIGIN}/androidpublisher/v3/applications/${APP_ID}/edits`;
  const edit = await json(base, { method: 'POST', headers, body: '{}' });
  const editUrl = `${base}/${encodeURIComponent(edit.id)}`;
  let committed = false;
  try {
    await run(editUrl, async () => {
      await assertNothingPendingReview(editUrl, headers);
      // Never cancel a release that is already in Google review.
      await json(
        `${editUrl}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`,
        {
          method: 'POST',
          headers,
        }
      );
      committed = true;
    });
  } finally {
    if (!committed) {
      // A failed cleanup must not hide the original error; Play expires
      // abandoned edits on its own.
      await json(editUrl, { method: 'DELETE', headers }).catch((error) =>
        console.warn(`Google Play edit cleanup failed: ${error.message}`)
      );
    }
  }
}

const UPLOAD_TIMEOUT_MS = 15 * 60_000;

async function uploadBundle(editUrl, headers, aabPath) {
  const url = `${editUrl.replace('/androidpublisher/', '/upload/androidpublisher/')}/bundles?uploadType=media`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/octet-stream' },
    body: await readFile(aabPath),
    redirect: 'error',
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  // Play error bodies can carry account details; report only the status.
  if (!response.ok)
    throw new Error(`Google Play bundle upload failed (${response.status})`);
  const body = await response.json().catch(() => null);
  if (!Number.isSafeInteger(body?.versionCode))
    throw new Error('Google Play bundle upload returned an invalid response');
  return body;
}

/** Uploads the AAB as a completed internal release with en-US notes. */
export async function uploadInternal(buildNumber, aabPath, notesDir) {
  const english = (await readFile(`${notesDir}/whatsnew-en-US`, 'utf8')).trim();
  if (!english) throw new Error('Google Play en-US notes are empty');
  const headers = await playHeaders();
  await withEdit(headers, async (editUrl, commit) => {
    // Re-read inside the edit that writes the track: a newer release may have
    // gone live since the job's earlier check.
    const internal = await json(`${editUrl}/tracks/internal`, { headers });
    if (!readableTrack(internal))
      throw new Error(
        `Google Play internal track is unreadable (${responseShape(internal)})`
      );
    if (hasNewerBuild(internal, buildNumber))
      throw new Error(
        `Google Play internal already serves a build newer than ${buildNumber}`
      );
    const bundle = await uploadBundle(editUrl, headers, aabPath);
    if (String(bundle.versionCode) !== String(buildNumber))
      throw new Error(
        `Uploaded bundle has versionCode ${bundle.versionCode}, expected ${buildNumber}`
      );
    await json(`${editUrl}/tracks/internal`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        track: 'internal',
        releases: [
          {
            versionCodes: [String(buildNumber)],
            status: 'completed',
            releaseNotes: [{ language: 'en-US', text: english }],
          },
        ],
      }),
    });
    await commit();
  });
  console.log(`Committed Google Play internal build ${buildNumber}.`);
}

export async function internalHasBuild(buildNumber) {
  const headers = await playHeaders();
  let present = false;
  await withEdit(headers, async (editUrl) => {
    const internal = await json(`${editUrl}/tracks/internal`, { headers });
    // A rerun of a superseded build must not re-upload or move the track back.
    if (hasNewerBuild(internal, buildNumber))
      throw new Error(
        `Google Play internal already serves a build newer than ${buildNumber}`
      );
    present = Boolean(releaseForBuild(internal, buildNumber));
  });
  return present;
}

export async function publishPlayBeta(buildNumber, notesDir) {
  const tracks = parseBetaTracks(process.env.GOOGLE_PLAY_BETA_TRACKS);
  const english = await readFile(`${notesDir}/whatsnew-en-US`, 'utf8');
  const headers = await playHeaders();
  const summary = { tracks: [], vietnamese: false };
  await withEdit(headers, async (editUrl, commit) => {
    const language = vietnameseListing(
      await json(`${editUrl}/listings`, { headers })
    );
    const vi = language ? vietnameseNotes(english) : '';
    const notes = vi ? [{ language, text: vi }] : [];
    if (!language)
      console.log(
        'No Vietnamese Play listing; release notes stay en-US. Add a vi listing in Play Console to ship Vietnamese notes.'
      );
    const targets = {};
    for (const track of tracks) {
      // An unknown track 404s here instead of silently creating nothing.
      targets[track] = await json(
        `${editUrl}/tracks/${encodeURIComponent(track)}`,
        { headers }
      );
    }
    const internal = await json(`${editUrl}/tracks/internal`, { headers });
    const updates = planPlayBeta({ internal, buildNumber, notes, targets });
    summary.tracks = tracks;
    summary.vietnamese = notes.length > 0;
    if (!updates.length) return;
    for (const update of updates) {
      await json(`${editUrl}/tracks/${encodeURIComponent(update.track)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(update),
      });
    }
    await commit();
  });
  if (summary.tracks.length)
    await verifyPromotion(headers, buildNumber, tracks);
  console.log(
    `Google Play build ${buildNumber}: testing tracks [${summary.tracks.join(', ') || 'none opted in'}], Vietnamese notes ${summary.vietnamese ? 'added' : 'not added'}.`
  );
  return summary;
}

async function verifyPromotion(headers, buildNumber, tracks) {
  await withEdit(headers, async (editUrl) => {
    for (const track of tracks) {
      const state = await json(
        `${editUrl}/tracks/${encodeURIComponent(track)}`,
        { headers }
      );
      if (!releaseForBuild(state, buildNumber))
        throw new Error(
          `Build ${buildNumber} is not a completed release on Google Play track ${track}`
        );
    }
  });
}

async function main(args) {
  if (args[0] === '--upload') {
    const [, number, aabPath, uploadNotes] = args;
    if (!/^[1-9]\d*$/u.test(number ?? '') || !aabPath || !uploadNotes)
      throw new Error('Usage: play-beta.mjs --upload <build> <aab> <notes>');
    await uploadInternal(number, aabPath, uploadNotes);
    return;
  }
  const check = args[0] === '--check';
  const [buildNumber, notesDir] = check ? args.slice(1) : args;
  if (!/^[1-9]\d*$/u.test(buildNumber ?? ''))
    throw new Error('A numeric build number is required');
  if (check) {
    // A rerun of the Android job reuses the build number; skip the upload
    // when Play already holds it and continue with promotion.
    const present = await internalHasBuild(buildNumber);
    console.log(
      `Google Play internal already has build ${buildNumber}: ${present}`
    );
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `present=${present}\n`);
    return;
  }
  if (!notesDir) throw new Error('The Play notes directory is required');
  await publishPlayBeta(buildNumber, notesDir);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
