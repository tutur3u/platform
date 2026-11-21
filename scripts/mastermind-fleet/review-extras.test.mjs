import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { baseFleetState, parseDecisionExtras } from './decision-extras.mjs';
import { attachReviewAssets, readReviewImage } from './review-extras.mjs';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const MOCKUP = 'https://claude.ai/code/artifact/0f6a2b1c';
const NOW = new Date('2026-11-22T00:30:00.000Z');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-review-'));
}

test('parses the review kind and refuses an unsafe mockup link', () => {
  assert.deepEqual(
    parseDecisionExtras({ kind: 'review', review: { mockupUrl: MOCKUP } }),
    { kind: 'review', review: { mockupUrl: MOCKUP } }
  );
  assert.equal(
    parseDecisionExtras({
      kind: 'review',
      review: { mockupUrl: 'https://evil.example/m' },
    }),
    null
  );
  assert.equal(parseDecisionExtras({ kind: 'review' }), null);
});

test('uploads a file preview once and swaps in its asset id', async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'ship.png'), PNG);
  const id = createHash('sha256').update(PNG).digest('hex');
  const puts = [];
  const put = async (p, body) => puts.push([p, JSON.parse(body)]);
  const decision = () => ({
    kind: 'review',
    review: {
      mockupUrl: MOCKUP,
      preview: { source: 'file', file: 'ship.png' },
    },
  });
  const first = [decision()];
  const uploaded = await attachReviewAssets(first, { dir, put, now: NOW });
  assert.deepEqual(first[0].review.preview, {
    source: 'asset',
    assetId: id,
    contentType: 'image/png',
  });
  assert.deepEqual(puts, [
    [
      `/api/v1/mastermind/fleet/review-assets/${id}`,
      { contentType: 'image/png', data: PNG.toString('base64') },
    ],
  ]);
  const second = [decision()];
  await attachReviewAssets(second, { dir, put, uploaded, now: NOW });
  assert.equal(puts.length, 1);
  assert.equal(second[0].review.preview.assetId, id);
});

test('drops a preview it cannot read or upload, never the review', async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'fake.png'), '<svg/>');
  fs.writeFileSync(path.join(dir, 'ok.png'), PNG);
  fs.symlinkSync(path.join(dir, 'ok.png'), path.join(dir, 'link.png'));
  const decisions = ['fake.png', 'missing.png', 'link.png', 'ok.png'].map(
    (file) => ({
      kind: 'review',
      review: { mockupUrl: MOCKUP, preview: { source: 'file', file } },
    })
  );
  const failing = async () => {
    throw new Error('PUT 503');
  };
  const uploaded = await attachReviewAssets(decisions, {
    dir,
    put: failing,
    now: NOW,
  });
  for (const d of decisions) {
    assert.equal(d.review.mockupUrl, MOCKUP);
    assert.equal(d.review.preview, undefined);
  }
  assert.deepEqual(uploaded, {});
  assert.equal(readReviewImage(path.join(dir, 'link.png')), null);
});

test('the v1 fallback leaves reviews and the failure split out', () => {
  const state = {
    counts: {
      running: 1,
      waiting: 0,
      queued: 0,
      idle: 2,
      failed: 0,
      recovered: 1,
      cancelled: 1,
    },
    lanes: [{ id: 'lane-a', state: 'idle', resolution: 'recovered' }],
    decisions: [
      { id: 'a', kind: 'review', review: { mockupUrl: MOCKUP } },
      { id: 'b', title: 'Plain ask' },
    ],
  };
  const base = baseFleetState(state);
  assert.deepEqual(base.counts, {
    running: 1,
    waiting: 0,
    queued: 0,
    idle: 2,
    failed: 0,
  });
  assert.deepEqual(base.lanes, [{ id: 'lane-a', state: 'idle' }]);
  assert.deepEqual(base.decisions, [{ id: 'b', title: 'Plain ask' }]);
});
