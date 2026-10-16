import { describe, expect, it } from 'vitest';
import { digest, type Item } from '../cli/operational-schema';
import { buildOutcomeProjectionPage } from './projection';

const identity = '11111111-1111-4111-8111-111111111111';
function item(id: string): Item {
  return {
    id,
    title: `Title ${id}`,
    kind: 'feature',
    source: 'synthetic:projection',
    acceptance: `Unique acceptance ${id}`,
    requiredEvidence: ['focused'],
    status: 'captured',
    owner: '',
    links: ['synthetic:link'],
    note: `Note ${id}`,
  };
}
function snapshot(sourceDatabaseId: string | null = identity) {
  const items = [item('alpha-outcome'), item('beta-outcome')];
  return {
    sourceDatabaseId,
    revision: 2,
    items,
    events: items.map((value, index) => ({
      seq: index + 1,
      item_id: value.id,
      at: '2026-10-12T00:00:00Z',
      action: 'capture',
      payload: JSON.stringify(value),
    })),
  };
}
describe('immutable existing outcome projection', () => {
  it('retains literal member fields and source/event provenance without claiming delivery', () => {
    const input = snapshot();
    const page = buildOutcomeProjectionPage({ snapshot: input });
    expect(page.records[0]).toEqual({
      id: 'alpha-outcome',
      canonicalId: 'alpha-outcome',
      contributingIds: ['alpha-outcome'],
      members: [
        {
          item: {
            id: 'alpha-outcome',
            title: 'Title alpha-outcome',
            kind: 'feature',
            source: 'synthetic:projection',
            acceptance: 'Unique acceptance alpha-outcome',
            requiredEvidence: ['focused'],
            status: 'captured',
            owner: '',
            links: ['synthetic:link'],
            note: 'Note alpha-outcome',
          },
          provenance: {
            itemId: 'alpha-outcome',
            source: 'synthetic:projection',
            firstEventSeq: 1,
            lastEventSeq: 1,
            events: [
              {
                seq: 1,
                at: '2026-10-12T00:00:00Z',
                action: 'capture',
                payloadHash: digest(input.items[0]),
              },
            ],
          },
        },
      ],
    });
    expect(page.semanticCacheAllowed).toBe(true);
    expect(page.sourceDatabaseId).toBe(identity);
    expect(page.liveVerificationPerformed).toBe(false);
    const original = input.items[0];
    if (!original) throw new Error('fixture missing original');
    original.note = 'changed caller input';
    expect(page.records[0]?.members[0]?.item.note).toBe('Note alpha-outcome');
    expect(Object.isFrozen(page)).toBe(true);
    expect(Object.isFrozen(page.records[0]?.members[0]?.item.links)).toBe(true);
  });

  it('denies semantic caching for a legacy store without inventing an identity', () => {
    const page = buildOutcomeProjectionPage({ snapshot: snapshot(null) });
    expect(page.sourceDatabaseId).toBeNull();
    expect(page.semanticCacheAllowed).toBe(false);
    expect(page.records.map((record) => record.id)).toEqual([
      'alpha-outcome',
      'beta-outcome',
    ]);
  });

  it('pages in stable id order and binds continuation to identity, revision and contents', () => {
    const input = snapshot();
    const first = buildOutcomeProjectionPage({ snapshot: input, limit: 1 });
    if (!first.nextCursor) throw new Error('fixture should have a second page');
    const cursor = first.nextCursor;
    expect(first.records.map((record) => record.id)).toEqual(['alpha-outcome']);
    const second = buildOutcomeProjectionPage({
      snapshot: input,
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.records.map((record) => record.id)).toEqual(['beta-outcome']);
    expect(second.nextCursor).toBeNull();
    expect(() =>
      buildOutcomeProjectionPage({
        snapshot: snapshot('22222222-2222-4222-8222-222222222222'),
        cursor: cursor,
      })
    ).toThrow('different snapshot');
    const changed = snapshot();
    const beta = changed.items[1];
    if (!beta) throw new Error('fixture missing beta');
    beta.note = 'new note';
    changed.events.push({
      seq: 3,
      item_id: beta.id,
      at: '2026-10-12T01:00:00Z',
      action: 'update',
      payload: JSON.stringify(beta),
    });
    changed.revision = 3;
    expect(() =>
      buildOutcomeProjectionPage({ snapshot: changed, cursor: cursor })
    ).toThrow('different snapshot');
    const legacy = snapshot(null);
    const legacyFirst = buildOutcomeProjectionPage({
      snapshot: legacy,
      limit: 1,
    });
    if (!legacyFirst.nextCursor)
      throw new Error('fixture should have a cursor');
    const legacyCursor = legacyFirst.nextCursor;
    const alternate = snapshot(null);
    const alpha = alternate.items[0];
    const event = alternate.events[0];
    if (!alpha || !event) throw new Error('fixture missing alpha');
    alpha.note = 'different same-revision legacy store';
    event.payload = JSON.stringify(alpha);
    expect(() =>
      buildOutcomeProjectionPage({ snapshot: alternate, cursor: legacyCursor })
    ).toThrow('different snapshot');
  });

  it('rejects gapped history, foreign event ids, missing records and divergent projections', () => {
    const gapped = snapshot();
    gapped.events = gapped.events.slice(1);
    expect(() => buildOutcomeProjectionPage({ snapshot: gapped })).toThrow(
      'contiguous history'
    );
    const foreign = snapshot();
    const event = foreign.events[0];
    if (!event) throw new Error('fixture missing event');
    event.item_id = 'foreign-outcome';
    expect(() => buildOutcomeProjectionPage({ snapshot: foreign })).toThrow(
      'event id mismatch'
    );
    const missing = snapshot();
    missing.items = [item('other-outcome'), item('beta-outcome')];
    expect(() => buildOutcomeProjectionPage({ snapshot: missing })).toThrow(
      'final event payload'
    );
    const divergent = snapshot();
    const alpha = divergent.items[0];
    if (!alpha) throw new Error('fixture missing alpha');
    alpha.acceptance = 'lost original acceptance';
    expect(() => buildOutcomeProjectionPage({ snapshot: divergent })).toThrow(
      'final event payload'
    );
  });

  it('rejects duplicate ids, invalid dependency graphs and unbounded page requests', () => {
    const duplicate = snapshot();
    duplicate.items = [item('alpha-outcome'), item('alpha-outcome')];
    expect(() => buildOutcomeProjectionPage({ snapshot: duplicate })).toThrow(
      'duplicate projection id'
    );
    const invalid = snapshot();
    const alpha = invalid.items[0];
    const event = invalid.events[0];
    if (!alpha || !event) throw new Error('fixture missing alpha');
    alpha.dependencies = ['alpha-outcome'];
    event.payload = JSON.stringify(alpha);
    expect(() => buildOutcomeProjectionPage({ snapshot: invalid })).toThrow(
      'dependency cycle'
    );
    expect(() =>
      buildOutcomeProjectionPage({ snapshot: snapshot(), limit: 501 })
    ).toThrow();
  });
});
