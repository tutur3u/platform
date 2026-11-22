import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { baseFleetState, parseDecisionExtras } from './decision-extras.mjs';
import {
  attachReviewAssets,
  parseReview,
  readReviewDocument,
  readReviewImage,
} from './review-extras.mjs';

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

test('uploads HTML with a fallback URL, shares budget, and retries failed document-only reviews', async () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(
      path.join(dir, 'mock.html'),
      '<!DOCTYPE html><html><body>Mock</body></html>'
    );
    const asset = readReviewDocument(path.join(dir, 'mock.html'));
    assert.equal(asset.contentType, 'text/html');
    assert.equal(parseReview({ document: { file: '../mock.html' } }), null);
    const make = () => ({
      kind: 'review',
      review: parseReview({ document: { file: 'mock.html' } }),
    });
    const decisions = [make(), make(), make(), make()];
    let uploads = 0;
    await attachReviewAssets(decisions, {
      dir,
      origin: 'https://tuturuuu.com',
      put: async () => {
        uploads++;
      },
      now: NOW,
    });
    assert.equal(uploads, 3);
    assert.equal(decisions.length, 3);
    assert.deepEqual(decisions[0].review.document, {
      source: 'asset',
      assetId: asset.assetId,
      contentType: 'text/html',
    });
    assert.equal(
      decisions[0].review.mockupUrl,
      `https://tuturuuu.com/api/v1/mastermind/fleet/review-assets/${asset.assetId}`
    );
    const failed = [make()];
    await attachReviewAssets(failed, {
      dir,
      origin: 'https://tuturuuu.com',
      put: async () => {
        throw new Error('offline');
      },
    });
    assert.equal(failed.length, 0);
    const fallback = [
      {
        kind: 'review',
        review: parseReview({
          mockupUrl: MOCKUP,
          document: { file: 'mock.html' },
        }),
      },
    ];
    await attachReviewAssets(fallback, {
      dir,
      put: async () => {
        throw new Error('offline');
      },
    });
    assert.deepEqual(fallback[0].review, { mockupUrl: MOCKUP });
    fs.symlinkSync(path.join(dir, 'mock.html'), path.join(dir, 'link.html'));
    assert.equal(readReviewDocument(path.join(dir, 'link.html')), null);
    fs.writeFileSync(path.join(dir, 'bad.html'), Buffer.from([0xff, 0x3c]));
    assert.equal(readReviewDocument(path.join(dir, 'bad.html')), null);
    fs.writeFileSync(
      path.join(dir, 'big.html'),
      '<html>' + 'x'.repeat(200 * 1024)
    );
    assert.equal(readReviewDocument(path.join(dir, 'big.html')), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed renewal keeps an open review on its still-valid asset', async () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(
      path.join(dir, 'mock.html'),
      '<!DOCTYPE html><html><body>Mock</body></html>'
    );
    const asset = readReviewDocument(path.join(dir, 'mock.html'));
    const make = () => [
      {
        kind: 'review',
        review: parseReview({ document: { file: 'mock.html' } }),
      },
    ];
    const offline = async () => {
      throw new Error('offline');
    };
    const daysAgo = (days) =>
      new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    // Due for renewal (4 days old), the upload fails: Web still holds it.
    const renewing = make();
    const kept = await attachReviewAssets(renewing, {
      dir,
      origin: 'https://tuturuuu.com',
      put: offline,
      uploaded: { [asset.assetId]: daysAgo(4) },
      now: NOW,
    });
    assert.equal(renewing.length, 1);
    assert.equal(renewing[0].review.document.assetId, asset.assetId);
    assert.equal(kept[asset.assetId], daysAgo(4));
    // Past Web's seven days the asset is gone, so the review waits.
    const lapsed = make();
    await attachReviewAssets(lapsed, {
      dir,
      origin: 'https://tuturuuu.com',
      put: offline,
      uploaded: { [asset.assetId]: daysAgo(8) },
      now: NOW,
    });
    assert.equal(lapsed.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
