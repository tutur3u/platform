import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// The publisher mirrors the allowlists so it can drop a bad file locally.
import {
  parseReview,
  REVIEW_ARTIFACT_HOST,
  REVIEW_ARTIFACT_PATHS,
  REVIEW_FIRST_PARTY_HOSTS,
  REVIEW_IMAGE_MAX_BYTES,
  safeReviewImageUrl as mirrorImageUrl,
  safeReviewLink as mirrorLink,
} from '../../../../../../scripts/mastermind-fleet/review-extras.mjs';
import { fleetAnswerInputSchema, fleetDecisionSchema } from './contract';
import {
  FLEET_REVIEW_DOCUMENT_TYPES,
  FLEET_REVIEW_DOCUMENT_MAX_BYTES,
  sniffReviewDocument,
  FLEET_REVIEW_ARTIFACT_HOST,
  FLEET_REVIEW_ARTIFACT_PATHS,
  FLEET_REVIEW_FIRST_PARTY_HOSTS,
  FLEET_REVIEW_IMAGE_MAX_BYTES,
  fleetReviewSchema,
  safeReviewImageUrl,
  safeReviewLink,
} from './review';
import { parseReviewUpload } from './review-assets';
import { sampleFleetState } from './sample-state.fixture';
import { fleetStateView } from './view';

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
]);
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const upload = (bytes: Uint8Array, contentType = 'image/png') => ({
  contentType,
  data: Buffer.from(bytes).toString('base64'),
});

const review = {
  id: 'review-ship-tab',
  kind: 'review',
  title: 'Approve the Ship tab mockup?',
  why: 'The Ship lane builds from it next.',
  urgency: 'normal',
  review: {
    mockupUrl: 'https://claude.ai/code/artifact/0f6a2b1c',
    preview: { source: 'hosted', url: 'https://cdn.tuturuuu.com/m/ship.png' },
  },
  createdAt: '2026-11-22T00:30:00.000Z',
};

describe('review links', () => {
  it.each([
    'https://claude.ai/artifact/abc',
    'https://claude.ai/code/artifact/abc',
    'https://tuturuuu.com/design/ship',
    'https://mastermind.tuturuuu.com/mockups/v3',
  ])('allows %s', (url) => {
    expect(safeReviewLink(url)).toBe(url);
    expect(mirrorLink(url)).toBe(url);
  });

  it.each([
    'http://claude.ai/artifact/abc',
    'https://claude.ai/chat/abc',
    'https://claude.ai.evil.example/artifact/abc',
    'https://eviltuturuuu.com/x',
    'https://user:pw@tuturuuu.com/x',
    'https://tuturuuu.com:8443/x',
    'https://tuturuuu.com/x#frag',
    'javascript:alert(1)',
    'https://.tuturuuu.com/x',
  ])('refuses %s', (url) => {
    expect(safeReviewLink(url)).toBeNull();
    expect(mirrorLink(url)).toBeNull();
  });

  it('allows only first-party image files, without a query', () => {
    for (const fn of [safeReviewImageUrl, mirrorImageUrl]) {
      expect(fn('https://cdn.tuturuuu.com/m/ship.webp')).not.toBeNull();
      expect(fn('https://claude.ai/artifact/x.png')).toBeNull();
      expect(fn('https://images.example.com/ship.png')).toBeNull();
      expect(fn('https://tuturuuu.com/ship.svg')).toBeNull();
      expect(fn('https://tuturuuu.com/ship.png?w=1')).toBeNull();
    }
  });

  it('keeps the publisher mirror in step', async () => {
    const mirror =
      await import('../../../../../../scripts/mastermind-fleet/review-extras.mjs');
    expect(mirror.REVIEW_DOCUMENT_TYPES).toEqual([
      ...FLEET_REVIEW_DOCUMENT_TYPES,
    ]);
    expect(mirror.REVIEW_DOCUMENT_MAX_BYTES).toBe(
      FLEET_REVIEW_DOCUMENT_MAX_BYTES
    );
    expect(REVIEW_FIRST_PARTY_HOSTS).toEqual([
      ...FLEET_REVIEW_FIRST_PARTY_HOSTS,
    ]);
    expect(REVIEW_ARTIFACT_HOST).toBe(FLEET_REVIEW_ARTIFACT_HOST);
    expect(REVIEW_ARTIFACT_PATHS).toEqual([...FLEET_REVIEW_ARTIFACT_PATHS]);
    expect(REVIEW_IMAGE_MAX_BYTES).toBe(FLEET_REVIEW_IMAGE_MAX_BYTES);
  });
});

describe('review decisions', () => {
  it('pairs the review kind with its payload', () => {
    expect(fleetDecisionSchema.safeParse(review).success).toBe(true);
    const { review: _r, ...bare } = review;
    expect(fleetDecisionSchema.safeParse(bare).success).toBe(false);
    expect(
      fleetDecisionSchema.safeParse({ ...review, kind: 'ask' }).success
    ).toBe(false);
  });

  it('refuses an arbitrary preview or mockup host', () => {
    expect(
      fleetReviewSchema.safeParse({
        ...review.review,
        preview: { source: 'hosted', url: 'https://evil.example/x.png' },
      }).success
    ).toBe(false);
    expect(
      fleetReviewSchema.safeParse({
        mockupUrl: 'https://evil.example/mock',
      }).success
    ).toBe(false);
    expect(
      fleetReviewSchema.safeParse({
        ...review.review,
        preview: { source: 'asset', assetId: 'x', contentType: 'image/png' },
      }).success
    ).toBe(false);
  });

  it('accepts what the publisher mirror produces', () => {
    const parsed = parseReview({
      mockupUrl: review.review.mockupUrl,
      preview: { url: review.review.preview.url },
    });
    expect(fleetReviewSchema.safeParse(parsed).success).toBe(true);
    expect(parseReview({ mockupUrl: 'https://evil.example/m' })).toBeNull();
    // A bad preview is dropped, never the review.
    expect(
      parseReview({
        mockupUrl: review.review.mockupUrl,
        preview: { file: '../../etc/passwd.png' },
      })
    ).toEqual({ mockupUrl: review.review.mockupUrl });
  });

  it('needs notes to request changes', () => {
    expect(
      fleetAnswerInputSchema.safeParse({ action: 'request_changes' }).success
    ).toBe(false);
    expect(
      fleetAnswerInputSchema.safeParse({
        action: 'request_changes',
        text: 'Tighten the header',
      }).success
    ).toBe(true);
  });

  it('shows reviews only to clients that declare the feature', () => {
    const state = fleetDecisionSchema.parse(review);
    const stored = {
      ...(sampleFleetState() as never as Parameters<typeof fleetStateView>[0]),
      decisions: [state],
      resolved: [
        {
          id: 'old-review',
          kind: 'review' as const,
          title: 'Earlier review',
          resolvedAt: '2026-11-22T00:00:00.000Z',
        },
      ],
    };
    expect(fleetStateView(stored).decisions).toHaveLength(0);
    expect(fleetStateView(stored).resolved).toHaveLength(0);
    const seen = fleetStateView(stored, { features: new Set(['review']) });
    expect(seen.decisions).toHaveLength(1);
    expect(seen.resolved).toHaveLength(1);
  });
});

describe('review asset uploads', () => {
  it('accepts a content-addressed image of the declared type', () => {
    const result = parseReviewUpload(sha(PNG), upload(PNG));
    expect(result.ok).toBe(true);
  });

  it('refuses a mismatched id, type, oversize or non-image body', () => {
    expect(parseReviewUpload('a'.repeat(64), upload(PNG))).toEqual({
      ok: false,
      error: 'asset_id_mismatch',
    });
    expect(parseReviewUpload(sha(PNG), upload(PNG, 'image/jpeg'))).toEqual({
      ok: false,
      error: 'asset_type_mismatch',
    });
    const svg = new TextEncoder().encode('<svg onload="x"/>');
    expect(parseReviewUpload(sha(svg), upload(svg)).ok).toBe(false);
    expect(parseReviewUpload(sha(svg), upload(svg, 'image/svg+xml')).ok).toBe(
      false
    );
    const big = new Uint8Array(FLEET_REVIEW_IMAGE_MAX_BYTES + 1);
    big.set(PNG);
    expect(parseReviewUpload(sha(big), upload(big))).toEqual({
      ok: false,
      error: 'asset_too_large',
    });
    expect(parseReviewUpload('../x', upload(PNG)).ok).toBe(false);
  });
});

it('sniffs only UTF-8 HTML documents and validates their upload type', () => {
  for (const text of ['<!DOCTYPE html><html>', '\ufeff \n<HTML lang="en">']) {
    const bytes = new TextEncoder().encode(text);
    expect(sniffReviewDocument(bytes)).toBe('text/html');
    expect(parseReviewUpload(sha(bytes), upload(bytes, 'text/html')).ok).toBe(
      true
    );
    expect(parseReviewUpload(sha(bytes), upload(bytes, 'image/png')).ok).toBe(
      false
    );
  }
  expect(sniffReviewDocument(new Uint8Array([0xff, 0xfe, 0x3c]))).toBeNull();
  expect(
    sniffReviewDocument(new TextEncoder().encode('<script>x</script>'))
  ).toBeNull();
  expect(
    fleetReviewSchema.safeParse({
      mockupUrl: 'https://tuturuuu.com/mock',
      document: {
        source: 'asset',
        assetId: 'a'.repeat(64),
        contentType: 'text/html',
      },
    }).success
  ).toBe(true);
});
