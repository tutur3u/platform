import { expect, test } from 'vitest';
import { fleetStateResponseSchema } from './contract';
import { fleetResponseFixture } from './fleet-fixture';
import { inboxLanes } from './inbox-lanes';

const now = Date.parse('2026-11-22T00:30:00.000Z');

function snapshot(
  extra: (raw: ReturnType<typeof fleetResponseFixture>) => void = () => {}
) {
  const raw = fleetResponseFixture(now);
  extra(raw);
  return fleetStateResponseSchema.parse(raw);
}

const review = {
  id: 'review-ship',
  kind: 'review',
  title: 'Approve the Ship mockup?',
  urgency: 'normal',
  review: { mockupUrl: 'https://claude.ai/artifact/abc' },
  createdAt: new Date(now - 60_000).toISOString(),
};

test('Needs you holds asks, reviews and open sign-ins, most urgent first', () => {
  const lanes = inboxLanes(
    snapshot((raw) => {
      (raw.state.decisions as unknown[]).push(review);
    }),
    {},
    now
  );
  expect(
    lanes.needs.map((item) =>
      item.kind === 'login' ? item.request.decision.id : item.decision.id
    )
  ).toEqual(['roll-back', 'gh-login', 'review-ship']);
  expect(lanes.fyi.asks.map((item) => item.decision.id)).toEqual(['ci-sample']);
  expect(lanes.fyi.resolved.map((d) => d.id)).toEqual(['retire-cron']);
  expect(lanes.recent.map((item) => item.decision.id)).toEqual([
    'answered-ask',
  ]);
});

test('snoozed asks leave Needs you; closed sign-ins never enter it', () => {
  const lanes = inboxLanes(
    snapshot((raw) => {
      const login = raw.state.decisions.find((d) => d.id === 'gh-login') as {
        login: Record<string, unknown>;
      };
      login.login = { service: 'github', flow: 'device', state: 'verified' };
    }),
    { 'roll-back': now + 60_000 },
    now
  );
  expect(lanes.needs).toHaveLength(0);
  expect(lanes.snoozed.map((item) => item.decision.id)).toEqual(['roll-back']);
});
