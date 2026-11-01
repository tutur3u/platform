import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  type AskCard,
  askCardSchema,
  formatAskTimestamp,
  parseAskCard,
  parseAskTimestamp,
} from './ask-v2.js';

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (path: string) =>
  JSON.parse(readFileSync(join(here, path), 'utf8'));

const fixture = readJson('fixtures/ask-v2.fixture.json') as {
  now: string;
  rows: Record<string, unknown>[];
};
const NOW = new Date(fixture.now);
const normalizedPath = 'fixtures/ask-v2.normalized.json';

const base = {
  id: `item-${'0'.repeat(19)}1`,
  version_hash: 'a'.repeat(64),
};
const parse = (extra: Record<string, unknown> = {}) =>
  parseAskCard({ ...base, ...extra }, NOW) as AskCard;

describe('ask-v2 shared fixture', () => {
  it('has the agreed 14-row mix', () => {
    const cards = fixture.rows.map((row) => parseAskCard(row, NOW) as AskCard);
    expect(cards).toHaveLength(14);
    const count = (pick: (card: AskCard) => boolean) =>
      cards.filter(pick).length;
    expect(count((c) => c.inbox_class === 'urgent')).toBe(4);
    expect(count((c) => c.inbox_class === 'decision')).toBe(7);
    expect(count((c) => c.inbox_class === 'fyi')).toBe(3);
    expect(count((c) => c.incomplete)).toBe(1);
    expect(count((c) => c.risky)).toBe(1);
    expect(count((c) => c.phase === 'expired')).toBe(1);
  });

  it('validates every row against the JSON schema', () => {
    const schema = z.fromJSONSchema(readJson('ask-v2.schema.json'));
    for (const row of fixture.rows) {
      expect(schema.safeParse(row).success, JSON.stringify(row.id)).toBe(true);
    }
  });

  it('is synthetic only', () => {
    const raw = readFileSync(
      join(here, 'fixtures/ask-v2.fixture.json'),
      'utf8'
    );
    for (const pattern of [
      /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
      /https?:\/\//,
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
      /(?:\/Users\/|\/home\/)/,
    ]) {
      expect(pattern.test(raw)).toBe(false);
    }
  });

  it('reads to the committed normalized snapshot (shared with Dart)', () => {
    const actual = {
      now: fixture.now,
      cards: fixture.rows.map((row) => parseAskCard(row, NOW)),
    };
    if (process.env.UPDATE_ASK_V2_SNAPSHOT === '1') {
      writeFileSync(
        join(here, normalizedPath),
        `${JSON.stringify(actual, null, 2)}\n`
      );
    }
    expect(actual).toEqual(readJson(normalizedPath));
    for (const card of actual.cards) askCardSchema.parse(card);
  });
});

describe('field fallback', () => {
  it('reads old-only keys with positional option ids', () => {
    const card = parse({
      title: 'Q',
      body: 'B',
      options: ['Yes', 'No'],
      recommended_option: 'No',
    });
    expect(card.options.map((o) => o.id)).toEqual(['opt-0', 'opt-1']);
    expect([card.recommended_id, card.recommended_label]).toEqual([
      'opt-1',
      'No',
    ]);
    expect(card.recommended_why).toBeNull();
  });

  it('prefers options_v2 and recommended_id when present', () => {
    const card = parse({
      title: 'Q',
      body: 'B',
      options: ['Old A', 'Old B'],
      recommended_option: 'Old A',
      options_v2: [
        { id: 'a', label: 'New A', note: 'n' },
        { id: 'b', label: 'New B' },
      ],
      recommended_id: 'b',
      recommended_why: 'Because.',
    });
    expect(card.options).toEqual([
      { id: 'a', label: 'New A', note: 'n' },
      { id: 'b', label: 'New B', note: null },
    ]);
    expect(card.recommended_id).toBe('b');
    expect(card.recommended_why).toBe('Because.');
  });

  it('accepts new-only keys (no legacy options)', () => {
    const card = parse({
      title: 'Q',
      body: 'B',
      options_v2: [{ id: 'a', label: 'A' }],
      recommended_id: 'a',
    });
    expect(card.recommended_label).toBe('A');
    expect(card.incomplete).toBe(false);
  });

  it('falls back to the recommended label when recommended_id is unknown', () => {
    const card = parse({
      title: 'Q',
      body: 'B',
      options_v2: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      recommended_id: 'zzz',
      recommended_option: 'A',
    });
    expect(card.recommended_id).toBe('a');
  });

  it('drops a recommendation that matches no option', () => {
    const card = parse({
      title: 'Q',
      body: 'B',
      options: ['A'],
      recommended_option: 'Nope',
      recommended_why: 'Orphan why',
    });
    expect([card.recommended_id, card.recommended_why]).toEqual([null, null]);
  });

  it('falls back to legacy options when options_v2 is unusable', () => {
    for (const bad of [
      [
        { id: 'a', label: 'A' },
        { id: 'a', label: 'dup' },
      ],
      [{ id: 'a' }],
      'nope',
      new Array(9).fill({ id: 'x', label: 'y' }),
    ]) {
      const card = parse({
        title: 'Q',
        body: 'B',
        options: ['Legacy'],
        options_v2: bad,
        recommended_id: 'a',
        recommended_option: 'Legacy',
      });
      expect(card.options.map((o) => o.label)).toEqual(['Legacy']);
      expect(card.recommended_id).toBe('opt-0');
    }
  });

  it('ignores unknown keys, unknown enums and oversize optional text', () => {
    const card = parse({
      title: 'Q',
      body: 'B',
      options: ['A'],
      recommended_option: 'A',
      recommended_why: 'x'.repeat(281),
      inbox_class: 'banana',
      risk_class: 'lava',
      urgency: 'yesterday',
      resolved_via: 'pigeon',
      deadline_at: 'soon-ish',
      future_field: { a: 1 },
    });
    expect(card.recommended_why).toBeNull();
    expect(card.inbox_class).toBe('decision');
    expect(card.risk_class).toBeNull();
    expect(card.urgency).toBeNull();
    expect(card.resolved_via).toBeNull();
    expect(card.deadline_at).toBeNull();
  });

  it('rejects only a malformed identity', () => {
    expect(parseAskCard(null, NOW)).toBeNull();
    expect(parseAskCard([], NOW)).toBeNull();
    expect(parseAskCard({ id: base.id }, NOW)).toBeNull();
    expect(parseAskCard({ ...base, id: 'bad' }, NOW)).toBeNull();
    expect(parseAskCard(base, NOW)).not.toBeNull();
  });
});

describe('inbox_class derivation', () => {
  const cls = (extra: Record<string, unknown>) => parse(extra).inbox_class;
  it('maps urgency', () => {
    expect(cls({ urgency: 'now' })).toBe('urgent');
    expect(cls({ urgency: 'today' })).toBe('decision');
    expect(cls({ urgency: 'soon' })).toBe('decision');
    expect(cls({ urgency: 'whenever' })).toBe('fyi');
  });
  it('without urgency, fyi kind is fyi and the rest are decisions', () => {
    expect(cls({ kind: 'fyi' })).toBe('fyi');
    expect(cls({ kind: 'action' })).toBe('decision');
    expect(cls({})).toBe('decision');
  });
  it('a past deadline is urgent, even over whenever', () => {
    expect(
      cls({ urgency: 'whenever', deadline_at: '2026-11-02T02:59:59Z' })
    ).toBe('urgent');
    expect(
      cls({ urgency: 'whenever', deadline_at: '2026-11-02T03:00:00Z' })
    ).toBe('fyi');
    expect(
      cls({ urgency: 'today', deadline_at: '2026-11-02T09:00:00+07:00' })
    ).toBe('urgent');
  });
  it('a closed ask is not promoted by its deadline', () => {
    const past = { urgency: 'soon', deadline_at: '2026-11-01T00:00:00Z' };
    expect(cls({ ...past, status: 'expired' })).toBe('decision');
    expect(cls({ ...past, state: 'answered' })).toBe('decision');
  });
  it('an explicit inbox_class wins', () => {
    expect(
      cls({
        inbox_class: 'fyi',
        urgency: 'now',
        deadline_at: '2020-01-01T00:00:00Z',
      })
    ).toBe('fyi');
  });
});

describe('incomplete rule', () => {
  const ok = { title: 'Q', body: 'B', options: ['A'] };
  const reasons = (extra: Record<string, unknown>) =>
    parse({ ...ok, ...extra }).incomplete_reasons;

  it('a full card is complete', () => {
    expect(parse(ok).incomplete).toBe(false);
  });
  it('flags missing question text', () => {
    expect(reasons({ title: '  ' })).toEqual(['missing_question']);
    expect(reasons({ body: '' })).toEqual(['missing_text']);
    expect(reasons({ body: '', ask_text: 'Full text' })).toEqual([]);
  });
  it('flags missing options on answerable asks only', () => {
    expect(reasons({ options: [] })).toEqual(['missing_options']);
    expect(reasons({ options: [], urgency: 'now' })).toEqual([
      'missing_options',
    ]);
    expect(reasons({ options: [], kind: 'fyi' })).toEqual([]);
    expect(reasons({ options: [], urgency: 'whenever' })).toEqual([]);
    expect(reasons({ options: ['ok', 7] })).toEqual(['missing_options']);
  });
  it('flags truncated and text_complete=false', () => {
    expect(reasons({ ask_truncated: true })).toEqual(['truncated']);
    expect(reasons({ text_complete: false })).toEqual(['text_incomplete']);
  });
  it('lists every reason in a fixed order', () => {
    expect(
      parse({ options: [], ask_truncated: true }).incomplete_reasons
    ).toEqual([
      'missing_question',
      'missing_text',
      'truncated',
      'missing_options',
    ]);
  });
});

describe('timestamps', () => {
  it('normalizes offsets to UTC seconds', () => {
    const seconds = parseAskTimestamp(
      '2026-11-02T10:30:00.987+07:00'
    ) as number;
    expect(formatAskTimestamp(seconds)).toBe('2026-11-02T03:30:00Z');
  });
  it('rejects naive, date-only and impossible values', () => {
    for (const bad of [
      '2026-11-02T10:30:00',
      '2026-11-02',
      '2026-02-30T00:00:00Z',
      '2026-13-01T00:00:00Z',
      '2026-11-02T24:00:00Z',
      '2026-11-02T10:30:00+24:00',
      '1969-12-31T23:59:59Z',
      42,
      null,
    ]) {
      expect(parseAskTimestamp(bad), String(bad)).toBeUndefined();
    }
  });
});
