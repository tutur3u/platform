import assert from 'node:assert/strict';
import test from 'node:test';
import { playgroundTemplates } from '../../../packages/utils/src/playground-templates.ts';

import './worker-test-runtime.mjs';

const { fixtureJob, fixtureTicket, isFixtureTicket } =
  await import('./fixture-source.ts');

const SECRET = 'i'.repeat(48);
const PROJECT = '00000000-0000-4000-8000-000000000002';
const NOW = 1_800_000_000_000;
const claims = (overrides = {}) => ({
  projectId: PROJECT,
  revision: 0,
  language: 'python',
  expiresAt: NOW + 60_000,
  ...overrides,
});

test('a signed ticket yields only the stock template it names', async () => {
  const ticket = await fixtureTicket(SECRET, claims({ language: 'go' }));
  assert.equal(isFixtureTicket(ticket), true);
  assert.ok(ticket.length >= 60 && ticket.length <= 2048);
  assert.deepEqual(
    await fixtureJob(SECRET, ticket, { projectId: PROJECT, revision: 0 }, NOW),
    {
      command: playgroundTemplates.go.command,
      files: [
        {
          path: playgroundTemplates.go.path,
          content: playgroundTemplates.go.content,
        },
      ],
    }
  );
});

test('a tampered, foreign, expired or misdirected ticket is refused', async () => {
  const expected = { projectId: PROJECT, revision: 0 };
  const ticket = await fixtureTicket(SECRET, claims());
  const [prefix, payload, mac] = [
    'playground-fixture.v1.',
    ...ticket.slice('playground-fixture.v1.'.length).split('.'),
  ];
  const forged = `${prefix}${Buffer.from(
    JSON.stringify(claims({ language: 'shell' }))
  ).toString('base64url')}.${mac}`;
  for (const [candidate, secret, scope, now] of [
    [forged, SECRET, expected, NOW],
    [`${prefix}${payload}.${mac.slice(0, -2)}AA`, SECRET, expected, NOW],
    [`${ticket}.extra`, SECRET, expected, NOW],
    [ticket, 'j'.repeat(48), expected, NOW],
    [ticket, SECRET, { projectId: PROJECT, revision: 1 }, NOW],
    [
      ticket,
      SECRET,
      { ...expected, projectId: '00000000-0000-4000-8000-000000000003' },
      NOW,
    ],
    [ticket, SECRET, expected, NOW + 60_000],
    [ticket, 'short', expected, NOW],
    ['s'.repeat(64), SECRET, expected, NOW],
  ])
    await assert.rejects(fixtureJob(secret, candidate, scope, now));
  // An expiry beyond the ticket lifetime is refused even when signed.
  const distant = await fixtureTicket(
    SECRET,
    claims({ expiresAt: NOW + 60 * 60_000 })
  );
  await assert.rejects(fixtureJob(SECRET, distant, expected, NOW));
});
