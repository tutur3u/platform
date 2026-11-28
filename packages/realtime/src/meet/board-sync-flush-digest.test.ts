import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { harness } from './board-sync-core.fixtures';
import { guestElement } from './board-sync-guest.fixtures';
import { sanitizeGuestChanges } from './board-sync-guest';
import { canonicalScene, flushDigestText } from './board-sync-merge';
import {
  BOARD_GUEST_LIMITS,
  BOARD_LIMITS,
  type BoardCheckpointBody,
  type BoardElement,
  boardCheckpointRequestSchema,
} from './board-sync-schema';

const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');

/** A guest's rectangle, line, text and labelled arrow, as the room stores them. */
function guestBatch() {
  const arrow = guestElement('arrow', {
    id: 'arrow-1',
    index: 'a3',
    boundElements: [{ id: 'label-1', type: 'text' }],
  });
  const label = guestElement('text', {
    id: 'label-1',
    index: 'a3V',
    containerId: 'arrow-1',
  });
  const { changes, dropped } = sanitizeGuestChanges(
    [
      guestElement('rectangle', { id: 'rect-1', index: 'a0' }),
      guestElement('line', { id: 'line-1', index: 'a1' }),
      guestElement('text', { id: 'text-1', index: 'a2' }),
      arrow,
      label,
    ].map((element) => ({ type: 'insert' as const, element }))
  );
  expect(dropped).toBe(0);
  return changes;
}

/** How the platform reads a flush: from the body's JSON, then parsed. */
function platformReads(body: BoardCheckpointBody) {
  const raw = JSON.parse(JSON.stringify(body));
  const parsed = boardCheckpointRequestSchema.parse(raw);
  if (parsed.op !== 'flush') throw new Error('not a flush');
  return { raw: raw.elements as unknown[], parsed: parsed.elements };
}

describe('flush of a guest-authored board', () => {
  it('sends a hash the platform verifies, though parsing reorders guest keys', async () => {
    const h = harness();
    const bodies: BoardCheckpointBody[] = [];
    h.deps.hash = async (text) => sha256(text);
    h.setFlush(async () => ({ status: 200, result: { updatedAt: 't1' } }));
    const flush = h.deps.flush;
    h.deps.flush = async (body) => {
      bodies.push(structuredClone(body));
      return flush(body);
    };
    await h.room.prepare();
    await h.room.connectionsChanged();
    const { applied } = await h.room.edit(guestBatch(), {
      maxCost: BOARD_GUEST_LIMITS.maxSceneCost,
      maxArea: BOARD_GUEST_LIMITS.maxSceneCanvasPixels,
      budget: { tokens: BOARD_GUEST_LIMITS.churnCapacity },
      stripLabels: true,
    });
    expect(applied).toHaveLength(5);
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);

    expect(bodies).toHaveLength(1);
    const body = bodies[0]!;
    const { raw, parsed } = platformReads(body);
    // The guest schema puts `type` last; the board schema puts it second.
    expect(JSON.stringify(parsed)).not.toBe(JSON.stringify(raw));
    expect(sha256(flushDigestText(raw))).toBe(body.hash);
    expect(canonicalScene(parsed as BoardElement[])).toBe(
      canonicalScene(h.room.elements())
    );
    // The stored arrow keeps no label.
    const arrow = parsed.find((element) => element.id === 'arrow-1') as {
      boundElements?: unknown[];
    };
    expect(arrow.boundElements).toEqual([]);
    expect(h.broadcasts).toContainEqual({ type: 'saved', revision: 1 });
    expect(h.broadcasts).not.toContainEqual({ type: 'save-error' });
  });

  it('settles a concurrent save of the same guest content without another write', async () => {
    const h = harness();
    await h.room.prepare();
    await h.room.connectionsChanged();
    await h.room.edit(guestBatch(), { stripLabels: true });
    // Another writer stored exactly this scene; the platform answers with it
    // as its parser orders the keys.
    h.setFlush(async () => {
      const stored = boardCheckpointRequestSchema.parse({
        op: 'flush',
        elements: JSON.parse(JSON.stringify(h.room.elements())),
        revision: 0,
        baseUpdatedAt: null,
        hash: '0'.repeat(64),
      });
      return {
        status: 409,
        result: {
          updatedAt: 't9',
          elements: stored.op === 'flush' ? stored.elements : [],
        },
      };
    });
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    expect(h.ops.flushes).toBe(1);
    const meta = h.room.snapshotMeta();
    expect(meta.flushedRevision).toBe(meta.revision);
    await h.advance(10 * BOARD_LIMITS.flushWindowMs);
    expect(h.ops.flushes).toBe(1);
  });
});

describe('canonicalScene', () => {
  it('keeps an own __proto__ key and never pollutes a prototype', () => {
    const base = { id: 'rect-1', type: 'rectangle', version: 1 };
    // JSON.parse makes `__proto__` an own data property.
    const plain = JSON.parse(JSON.stringify(base)) as BoardElement;
    const withProto = JSON.parse(
      '{"id":"rect-1","type":"rectangle","version":1,"__proto__":{"polluted":true}}'
    ) as BoardElement;
    expect(Object.keys(withProto)).toContain('__proto__');

    const text = canonicalScene([withProto]);
    expect(canonicalScene([plain])).not.toBe(text);
    expect(text).toContain('"__proto__":{"polluted":true}');
    expect(JSON.parse(text)[0]).not.toHaveProperty('polluted');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});
