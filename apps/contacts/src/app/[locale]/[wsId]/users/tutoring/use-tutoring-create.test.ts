import { describe, expect, it } from 'vitest';
import {
  storedTutoringContent,
  storedTutoringSessions,
} from './use-tutoring-create';

describe('stored tutoring content', () => {
  it('keeps untouched make-up notes linked by saving them empty', () => {
    expect(
      storedTutoringContent({
        content: '2026-10-20: Unit 4',
        linkedContent: '2026-10-20: Unit 4',
        reasonType: 'ABSENT_RECOVERY',
      })
    ).toBe('');
    expect(
      storedTutoringContent({
        content: '',
        linkedContent: '',
        reasonType: 'ABSENT_RECOVERY',
      })
    ).toBe('');
  });

  it('saves edited make-up notes and other reasons as written', () => {
    expect(
      storedTutoringContent({
        content: 'Revise Unit 4 vocabulary',
        linkedContent: '2026-10-20: Unit 4',
        reasonType: 'ABSENT_RECOVERY',
      })
    ).toBe('Revise Unit 4 vocabulary');
    expect(
      storedTutoringContent({
        content: 'Reading practice',
        linkedContent: 'Reading practice',
        reasonType: 'WEAK_SUPPORT',
      })
    ).toBe('Reading practice');
  });
});

describe('stored tutoring sessions', () => {
  const slot = (
    sessionDate: string,
    extra: {
      content?: string;
      linkedContent?: string;
      pairedMissedDate?: string;
    } = {}
  ) => ({
    durationMinutes: 45,
    sessionDate,
    startTime: '15:15',
    teacherUserId: 'tutor',
    ...extra,
  });

  it('leaves content out of a slot without its own so the form content applies', () => {
    expect(
      storedTutoringSessions({
        reasonType: 'CUSTOM',
        sessionSlots: [slot('2026-10-31'), slot('2026-11-07')],
      })
    ).toEqual([
      {
        durationMinutes: 45,
        sessionDate: '2026-10-31',
        startTime: '15:15',
        teacherUserId: 'tutor',
      },
      {
        durationMinutes: 45,
        sessionDate: '2026-11-07',
        startTime: '15:15',
        teacherUserId: 'tutor',
      },
    ]);
  });

  const unit4 = (sessionDate: string) =>
    slot(sessionDate, {
      content: '2026-10-20: Unit 4',
      linkedContent: '2026-10-20: Unit 4',
      pairedMissedDate: '2026-10-20',
    });
  const unit5 = (sessionDate: string, content = '2026-10-22: Unit 5') =>
    slot(sessionDate, {
      content,
      linkedContent: '2026-10-22: Unit 5',
      pairedMissedDate: '2026-10-22',
    });
  const missedClassDates = ['2026-10-20', '2026-10-22'];

  it('keeps each untouched make-up slot linked and saves edited ones as written', () => {
    const sessions = storedTutoringSessions({
      missedClassDates,
      reasonType: 'ABSENT_RECOVERY',
      sessionSlots: [unit4('2026-10-31'), unit5('2026-11-07', 'Revise Unit 5')],
    });
    expect(sessions.map((session) => session.content)).toEqual([
      '',
      'Revise Unit 5',
    ]);
  });

  it('saves linked text for every untouched slot while all stay in order', () => {
    const sessions = storedTutoringSessions({
      missedClassDates,
      reasonType: 'ABSENT_RECOVERY',
      sessionSlots: [unit4('2026-10-31'), unit5('2026-11-07')],
    });
    expect(sessions.map((session) => session.content)).toEqual(['', '']);
    expect(sessions[0]).not.toHaveProperty('pairedMissedDate');
    expect(sessions[0]).not.toHaveProperty('linkedContent');
  });

  it('saves the shown text when the first slot is removed and the second is untouched', () => {
    // The server would now pair the lone blank session with the oldest absence.
    const sessions = storedTutoringSessions({
      missedClassDates,
      reasonType: 'ABSENT_RECOVERY',
      sessionSlots: [unit5('2026-11-07')],
    });
    expect(sessions.map((session) => session.content)).toEqual([
      '2026-10-22: Unit 5',
    ]);
  });

  it('saves linked text as shown when the slots are out of date order', () => {
    const sessions = storedTutoringSessions({
      missedClassDates,
      reasonType: 'ABSENT_RECOVERY',
      sessionSlots: [unit4('2026-11-07'), unit5('2026-10-31')],
    });
    expect(sessions.map((session) => session.content)).toEqual([
      '2026-10-20: Unit 4',
      '2026-10-22: Unit 5',
    ]);
  });

  it('saves the shown text when the slot is dated before its missed class', () => {
    const sessions = storedTutoringSessions({
      missedClassDates,
      reasonType: 'ABSENT_RECOVERY',
      sessionSlots: [unit4('2026-10-19'), unit5('2026-11-07')],
    });
    // The server skips the early slot, so the later one would take 10-20.
    expect(sessions.map((session) => session.content)).toEqual([
      '2026-10-20: Unit 4',
      '2026-10-22: Unit 5',
    ]);
  });

  it('saves the shown text when an early slot shifts the server pairing', () => {
    const sessions = storedTutoringSessions({
      missedClassDates,
      reasonType: 'ABSENT_RECOVERY',
      sessionSlots: [unit4('2026-10-31'), unit5('2026-10-21')],
    });
    expect(sessions.map((session) => session.content)).toEqual([
      '2026-10-20: Unit 4',
      '2026-10-22: Unit 5',
    ]);
  });

  it('saves the shown text for slots sharing a date and time', () => {
    const sessions = storedTutoringSessions({
      missedClassDates,
      reasonType: 'ABSENT_RECOVERY',
      sessionSlots: [unit4('2026-10-31'), unit5('2026-10-31')],
    });
    expect(sessions.map((session) => session.content)).toEqual([
      '2026-10-20: Unit 4',
      '2026-10-22: Unit 5',
    ]);
  });

  it('saves linked text as shown when the missed dates are unknown', () => {
    const sessions = storedTutoringSessions({
      reasonType: 'ABSENT_RECOVERY',
      sessionSlots: [unit4('2026-10-31'), unit5('2026-11-07')],
    });
    expect(sessions.map((session) => session.content)).toEqual([
      '2026-10-20: Unit 4',
      '2026-10-22: Unit 5',
    ]);
  });

  it('sends weak-support slot content as written', () => {
    const sessions = storedTutoringSessions({
      reasonType: 'WEAK_SUPPORT',
      sessionSlots: [
        slot('2026-10-31', { content: 'Reading', linkedContent: 'Reading' }),
      ],
    });
    expect(sessions[0]?.content).toBe('Reading');
  });
});
