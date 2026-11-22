import { findRequestContentViolation } from '@tuturuuu/utils/request-emoji-limit';
import { describe, expect, it } from 'vitest';
import { FLEET_MAX_BODY_BYTES, fleetStateSchema } from './contract';

// The orchestrator publisher is plain Node ESM outside the app; a computed
// specifier keeps it out of the app's type graph.
const load = (file: string) =>
  import(
    /* @vite-ignore */ new URL(
      `../../../../../../scripts/mastermind-fleet/${file}`,
      import.meta.url
    ).href
  );

const NOW = new Date('2026-11-21T03:00:00.000Z');
const CJK = '部署检查失败需要确认版本发布计划';

/** Hostile-but-plausible orchestrator input: every field at its worst. */
async function worstCaseSnapshot() {
  const { buildFleetState } = await load('fleet-state.mjs');
  const { fitToBudget, parseDecision } = await load('publish.mjs');
  const decisions = Array.from({ length: 50 }, (_, i) =>
    parseDecision({
      id: `iris-decision-${i}`,
      title: `${'🚀'.repeat(14)} ${CJK.repeat(30)}`,
      body: `**Context**\n\n- ${'🔥'.repeat(20)} ${CJK.repeat(80)}`,
      urgency: i % 2 ? 'urgent' : 'nonsense',
      options: [
        { id: 'stars', label: '***' },
        { id: 'bearer', label: 'bearer#example' },
        {
          id: 'go',
          label: `${'✅'.repeat(12)} ${CJK.repeat(10)}`,
          description: `${'🔥'.repeat(20)} Context https://example.com ${CJK.repeat(20)}`,
        },
        ...Array.from({ length: 6 }, (_, j) => ({
          id: `o${j}`,
          label: CJK.repeat(10),
        })),
      ],
      recommendedOptionId: 'stars',
      createdAt: '2026-11-21T09:00:00+07:00',
      deadlineAt: '+275760-09-13T00:00:00.000Z',
    })
  );
  const thread = (i: number, state: string) => ({
    threadId: `remote-${i}`,
    title:
      i % 2
        ? `${'🚀'.repeat(10)}🇦🚀🇧X`
        : `${'🧪'.repeat(12)} ${CJK.repeat(12)} https://x.example/y`,
    state,
    provider: CJK,
    model: CJK,
    projectTitle: CJK.repeat(5),
    parentThreadId: i > 0 ? `remote-${i - 1}` : undefined,
    updatedAt: new Date(NOW.getTime() - i * 1000).toISOString(),
  });
  const rows = {
    active: [],
    recent: [],
    threads: new Map(),
    peers: [
      {
        environment_id: 'env-1',
        label: `${'💻'.repeat(12)} ${CJK.repeat(10)}`,
        status: 'online',
        live: true,
        lastSeenAt: NOW.toISOString(),
        threads: Array.from({ length: 400 }, (_, i) =>
          thread(i, ['running', 'waiting', 'queued', 'failed', 'idle'][i % 5]!)
        ),
      },
      // Same label slug as the first machine; still its own machine.
      { environment_id: 'env-2', label: '💻', status: 'offline', threads: [] },
    ],
  };
  const built = buildFleetState(rows, {
    now: NOW,
    decisions,
    localMachine: { id: 'skr-m4', label: 'M4' },
  });
  return { built, fitted: fitToBudget(built) };
}

describe('fleet publisher output', () => {
  it('passes the edge guard, the contract and the body cap at its worst', async () => {
    const { built, fitted } = await worstCaseSnapshot();
    const body = JSON.stringify(fitted.state);

    expect(findRequestContentViolation(JSON.parse(body))).toBeNull();
    const parsed = fleetStateSchema.safeParse(JSON.parse(body));
    expect(parsed.success, JSON.stringify(parsed.error?.issues[0])).toBe(true);
    expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(
      FLEET_MAX_BODY_BYTES
    );

    // Counts keep every lane even when the budget trims the list.
    expect(fitted.state.counts).toEqual(built.counts);
    // Each lane counts once by state; resolution counts overlap `idle`.
    const { recovered, quotaRecovered, cancelled, ...byState } =
      built.counts as Record<string, number>;
    expect(Object.values(byState).reduce((a, b) => a + b)).toBe(400);
    expect(recovered! + quotaRecovered! + cancelled!).toBeLessThanOrEqual(
      byState.idle!
    );
    const machineIds = fitted.state.machines.map((m: { id: string }) => m.id);
    expect(new Set(machineIds).size).toBe(machineIds.length);
    for (const decision of fitted.state.decisions) {
      expect(
        decision.options.some((o: { id: string }) =>
          ['stars', 'bearer'].includes(o.id)
        )
      ).toBe(false);
      expect(decision.recommendedOptionId).toBeUndefined();
      expect(decision.deadlineAt).toBeUndefined();
    }
  });

  it('carries secret requests and pairings the route stores unchanged', async () => {
    const { parseDecision } = await load('publish.mjs');
    const { buildFleetState } = await load('fleet-state.mjs');
    const fixtureUrl = new URL(
      '../../../../../../scripts/mastermind-fleet/secret-fixture.json',
      import.meta.url
    );
    const { readFile } = await import('node:fs/promises');
    const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
    const at = new Date('2026-11-22T10:00:00.000Z');
    const {
      code: _code,
      codeHex: _codeHex,
      keyHex: _keyHex,
      ownerKey: _ownerKey,
      ownerMac: _ownerMac,
      ...pairing
    } = fixture.pairing;
    const decisions = [
      parseDecision(
        {
          id: fixture.request.requestId,
          kind: 'secret',
          title: fixture.request.purpose,
          urgency: 'high',
          createdAt: '2026-11-22T09:55:00.000Z',
          secret: {
            mode: 'request',
            ...fixture.request,
            sig: fixture.requestSig,
          },
        },
        at
      ),
      parseDecision(
        {
          id: pairing.pairingId,
          kind: 'secret',
          title: 'Pair Skora M4',
          urgency: 'high',
          createdAt: '2026-11-22T10:00:00.000Z',
          secret: { mode: 'pair', v: '1', ...pairing },
        },
        at
      ),
    ];
    expect(decisions.every(Boolean)).toBe(true);
    const state = buildFleetState(
      { active: [], recent: [], threads: new Map(), peers: [] },
      { now: at, decisions, localMachine: { id: 'skr-m4', label: 'M4' } }
    );
    const parsed = fleetStateSchema.safeParse(
      JSON.parse(JSON.stringify(state))
    );
    expect(parsed.success, JSON.stringify(parsed.error?.issues[0])).toBe(true);
    // Signed fields reach the phone byte for byte.
    expect(parsed.data?.decisions.map((d) => d.secret)).toEqual(
      decisions.map((d: { secret: unknown }) => d.secret)
    );
  });

  it('matches what the route stores, so a second scrub changes nothing', async () => {
    const { fitted } = await worstCaseSnapshot();
    const parsed = fleetStateSchema.parse(
      JSON.parse(JSON.stringify(fitted.state))
    );
    expect(parsed.lanes.map((lane) => lane.title)).toEqual(
      fitted.state.lanes.map((lane: { title: string }) => lane.title)
    );
    expect(parsed.decisions.map((d) => d.title)).toEqual(
      fitted.state.decisions.map((d: { title: string }) => d.title)
    );
  });
});
