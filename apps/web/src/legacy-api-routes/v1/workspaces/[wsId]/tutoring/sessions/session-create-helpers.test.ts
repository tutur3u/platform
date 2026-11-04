import { describe, expect, it } from 'vitest';
import { TutoringSessionCreateSchema } from '../shared';
import {
  buildTutoringSessionRows,
  buildTutoringSessionSlots,
} from './session-create-helpers';

const ids = {
  groupId: '11111111-1111-4111-8111-111111111111',
  studentUserId: '22222222-2222-4222-8222-222222222222',
  teacherUserId: '33333333-3333-4333-8333-333333333333',
};

function rowsFor(body: Record<string, unknown>) {
  const payload = TutoringSessionCreateSchema.parse({
    ...ids,
    reasonType: 'ABSENT_RECOVERY',
    ...body,
  });
  const slots = buildTutoringSessionSlots(payload);
  if (!slots) throw new Error('expected slots');
  return buildTutoringSessionRows({
    actorId: 'actor',
    payload,
    slots,
    wsId: 'ws',
  });
}

const slot = (sessionDate: string, extra: Record<string, unknown> = {}) => ({
  durationMinutes: 45,
  sessionDate,
  startTime: '15:15',
  ...extra,
});

describe('per-session content on create', () => {
  it('gives each slot its own content', () => {
    const rows = rowsFor({
      content: 'shared',
      sessions: [
        slot('2026-10-31', { content: '2026-10-20: Unit 4' }),
        slot('2026-11-07', { content: '2026-10-22: Unit 5' }),
      ],
    });
    expect(rows.map((row) => row.content)).toEqual([
      '2026-10-20: Unit 4',
      '2026-10-22: Unit 5',
    ]);
  });

  it('falls back to the payload content for a slot without its own', () => {
    const rows = rowsFor({
      content: 'shared',
      sessions: [slot('2026-10-31', { content: 'own' }), slot('2026-11-07')],
    });
    expect(rows.map((row) => row.content)).toEqual(['own', 'shared']);
  });

  it('keeps the shared content when no slot has content', () => {
    expect(
      rowsFor({
        content: 'shared',
        sessions: [slot('2026-10-31'), slot('2026-11-07')],
      }).map((row) => row.content)
    ).toEqual(['shared', 'shared']);
    expect(
      rowsFor({
        content: 'shared',
        sessionCount: 2,
        sessionDate: '2026-10-31',
        startTime: '15:15',
      }).map((row) => row.content)
    ).toEqual(['shared', 'shared']);
  });

  it('keeps an explicit empty slot content so the row stays linked', () => {
    const rows = rowsFor({
      content: 'shared',
      sessions: [slot('2026-10-31', { content: '' }), slot('2026-11-07')],
    });
    expect(rows.map((row) => row.content)).toEqual(['', 'shared']);
  });

  it('validates a slot content with the payload limit', () => {
    const parse = (content: string) =>
      TutoringSessionCreateSchema.safeParse({
        ...ids,
        reasonType: 'ABSENT_RECOVERY',
        sessions: [slot('2026-10-31', { content })],
      }).success;
    expect(parse('x'.repeat(10000))).toBe(true);
    expect(parse('x'.repeat(10001))).toBe(false);
  });
});
