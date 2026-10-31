import { expect, it } from 'vitest';
import { routeAllowed } from './protocol';
import { ingestSchema } from './schema';

const at = 1_793_000_000_000;
const decision = {
  id: 'stable-decision',
  at,
  title: 'Change release timing',
  by: 'mastermind',
  category: 'auto',
  area: 'release',
  why: 'A dependency is ready',
  risk: 'med',
  reversible: true,
};
const observability = {
  quota_series: [{ instance: 'codex-main', t: at, pct: 80 }],
  speed_series: [{ model: 'gpt-6', t: at, tok_s_p50: 30 }],
  children_series: [
    {
      t: at,
      provider: 'codex',
      model: 'gpt-6',
      running: 2,
      started: 3,
      finished: 1,
    },
  ],
  staff: [
    {
      role: 'release-desk',
      title: 'Release Desk',
      state: 'waiting',
      last_active: at,
      model: 'gpt-6',
      runs_today: 4,
    },
  ],
  ci: [{ repo: 'tutur3u/platform', t: at, queued: 1, running: 2 }],
  cadence: [{ product: 'tuturuuu', last_prod_at: at }],
};
const envelope = {
  v: 2,
  seq: 1,
  sentAt: at,
  events: [],
  decisions: [decision],
  observability,
};
it('freezes v2 and reduces security decisions to exactly the approved five fields', () => {
  expect(ingestSchema.safeParse({ ...envelope, v: 1 }).success).toBe(false);
  const parsed = ingestSchema.parse({
    ...envelope,
    decisions: [{ ...decision, area: 'security', title: 'Review policy' }],
  });
  expect(parsed.decisions).toEqual([
    {
      id: decision.id,
      at,
      title: 'Review policy',
      area: 'security',
      risk: 'med',
    },
  ]);
});
it('rejects unknown fields in decisions, observations and every series row', () => {
  expect(
    ingestSchema.safeParse({
      ...envelope,
      decisions: [{ ...decision, token: 'forbidden' }],
    }).success
  ).toBe(false);
  expect(
    ingestSchema.safeParse({
      ...envelope,
      observability: { ...observability, raw: 'forbidden' },
    }).success
  ).toBe(false);
  for (const [series, rows] of Object.entries(observability)) {
    expect(
      ingestSchema.safeParse({
        ...envelope,
        observability: {
          ...observability,
          [series]: rows.map((row) => ({ ...row, raw: 'forbidden' })),
        },
      }).success
    ).toBe(false);
  }
});
it('caps decision authors, titles, reasons, dimensions, numeric values and batches', () => {
  for (const patch of [
    { title: 'x'.repeat(121) },
    { why: 'x'.repeat(281) },
    { by: `role:${'x'.repeat(33)}` },
    { category: 'unknown' },
    { risk: 'medium' },
  ]) {
    expect(
      ingestSchema.safeParse({
        ...envelope,
        decisions: [{ ...decision, ...patch }],
      }).success
    ).toBe(false);
  }
  expect(
    ingestSchema.safeParse({ ...envelope, decisions: Array(51).fill(decision) })
      .success
  ).toBe(false);
  expect(
    ingestSchema.safeParse({
      ...envelope,
      observability: {
        ...observability,
        quota_series: [{ instance: 'x'.repeat(65), t: at, pct: 101 }],
      },
    }).success
  ).toBe(false);
  expect(
    ingestSchema.safeParse({
      ...envelope,
      observability: {
        ...observability,
        children_series: [
          { t: at, provider: 'codex', running: 1, started: 1, finished: 1 },
        ],
      },
    }).success
  ).toBe(false);
});
it('allows only the exact v2 read parameters and bounded export cursors', () => {
  expect(
    routeAllowed('GET', '/decisions?after=123:stable-decision&category=auto')
  ).toBe(true);
  expect(routeAllowed('GET', '/decisions?category=unknown')).toBe(false);
  expect(
    routeAllowed('GET', '/observability?since=123&series=children_series')
  ).toBe(true);
  expect(routeAllowed('GET', '/observability?series=unknown')).toBe(false);
  expect(routeAllowed('GET', '/observability?since=1&since=2')).toBe(false);
  expect(
    routeAllowed('GET', '/hub/export?section=metrics&after=20&seq=3')
  ).toBe(true);
  expect(routeAllowed('GET', '/hub/export?section=flags')).toBe(false);
});

it('accepts the five-field security projection and validates any optional discarded fields', () => {
  const security = {
    id: 'redacted',
    at,
    title: 'Review policy',
    area: 'security',
    risk: 'high',
  };
  expect(
    ingestSchema.parse({ ...envelope, decisions: [security] }).decisions
  ).toEqual([security]);
  expect(
    ingestSchema.safeParse({
      ...envelope,
      decisions: [{ ...security, why: 'x'.repeat(281) }],
    }).success
  ).toBe(false);
  expect(
    ingestSchema.safeParse({
      ...envelope,
      decisions: [{ ...security, raw: 'forbidden' }],
    }).success
  ).toBe(false);
  expect(
    ingestSchema.safeParse({
      ...envelope,
      decisions: [{ ...security, area: 'release' }],
    }).success
  ).toBe(false);
});
