import { describe, expect, it } from 'vitest';
import { LIVE_ACTIVITY_LIMITS } from './live-activities';
import {
  action,
  cohost,
  error,
  guest,
  host,
  other,
  read,
  room,
} from './live-activities.fixtures';
import { serializedMeetBytes } from './live-activity-rate';
import { mineView, publicView } from './live-activity-views';
import { MEET_MAX_MESSAGE_BYTES } from './message-size';
import type { MeetRoomSnapshot } from './room';

describe('assessment', () => {
  const items = [
    { prompt: ' Question ', kind: 'choice', options: [' A ', 'B'], answer: 1 },
    { prompt: 'Explain', kind: 'long' },
  ];
  it('gates host actions, replaces submissions, and releases only the actor’s grade', () => {
    const initial = room();
    expect(
      action(initial, guest, { kind: 'assessment.set', items }).reply
    ).toMatchObject(error('permission_denied'));
    const configured = action(initial, cohost, {
      kind: 'assessment.set',
      items,
    });
    const snapshot = configured.broadcast.find(
      (frame) => frame.type === 'activity.snapshot'
    )?.snapshot;
    const [question, long] = snapshot?.assessment.items ?? [];
    expect(question).toEqual({
      id: expect.any(String),
      prompt: 'Question',
      kind: 'choice',
      options: ['A', 'B'],
    });
    if (!question || !long) throw new Error('Missing configured items');
    const open = action(configured.state, host, {
      kind: 'assessment.status',
      status: 'open',
    }).state;
    expect(
      action(open, host, { kind: 'assessment.set', items }).reply
    ).toMatchObject(error('activity_assessment_not_draft'));
    expect(
      action(open, guest, {
        kind: 'assessment.submit',
        itemId: question.id,
        choice: 2,
      }).reply
    ).toMatchObject(error('activity_invalid_answer'));

    const submitted = action(open, guest, {
      kind: 'assessment.submit',
      itemId: long.id,
      answer: 'old answer',
    });
    const replaced = action(submitted.state, guest, {
      kind: 'assessment.submit',
      itemId: long.id,
      answer: ' private answer ',
    });
    const grade = {
      kind: 'assessment.grade',
      itemId: long.id,
      participantId: guest.userId,
      score: 85,
      feedback: 'Private feedback',
    };
    // Grades and results attach to final answers only.
    expect(
      action(replaced.state, cohost, { ...grade, revision: 1 }).reply
    ).toMatchObject(error('activity_assessment_not_closed'));
    expect(
      action(replaced.state, host, {
        kind: 'assessment.release',
        released: true,
      }).reply
    ).toMatchObject(error('activity_assessment_not_closed'));
    const closed = action(replaced.state, host, {
      kind: 'assessment.status',
      status: 'closed',
    });
    expect(closed.toManagers).toMatchObject([
      { host: { assessment: { responses: [{ revision: 1 }] } } },
    ]);
    // A grade written for the first answer does not land on its replacement.
    const stale = action(closed.state, cohost, { ...grade, revision: 0 });
    expect(stale.reply).toMatchObject(error('activity_answer_changed'));
    expect(stale.state).toBe(closed.state);
    const graded = action(closed.state, cohost, { ...grade, revision: 1 });
    expect(graded.broadcast).toMatchObject([
      { snapshot: { assessment: { counts: { [long.id]: 1 } } } },
    ]);
    expect(graded.toManagers).toMatchObject([
      {
        type: 'activity.host',
        host: {
          assessment: {
            responses: [
              {
                answer: 'private answer',
                score: 85,
                feedback: 'Private feedback',
              },
            ],
          },
        },
      },
    ]);
    expect(JSON.stringify(graded.broadcast)).not.toMatch(
      /correct|private answer|Private feedback/
    );
    expect(JSON.stringify(read(graded.state, other).reply)).not.toMatch(
      /correct|private answer|Private feedback|activity.host/
    );
    expect(JSON.stringify(read(graded.state, guest).reply)).toContain(
      'private answer'
    );
    expect(JSON.stringify(read(graded.state, guest).reply)).not.toContain(
      'Private feedback'
    );

    expect(
      action(graded.state, guest, {
        kind: 'assessment.submit',
        itemId: long.id,
        answer: 'too late',
      }).reply
    ).toMatchObject(error('activity_assessment_closed'));
    const released = action(graded.state, host, {
      kind: 'assessment.release',
      released: true,
    });
    expect(
      action(released.state, guest, {
        kind: 'assessment.submit',
        itemId: long.id,
        answer: 'after the key',
      }).reply
    ).toMatchObject(error('activity_assessment_closed'));
    expect(released.broadcast).toMatchObject([
      {
        snapshot: {
          assessment: {
            released: true,
            items: [{ correct: 1 }, { id: long.id }],
          },
        },
      },
    ]);
    expect(released.direct).toMatchObject([
      {
        userId: guest.userId,
        message: {
          type: 'activity.mine',
          mine: {
            assessment: {
              [long.id]: { score: 85, feedback: 'Private feedback' },
            },
          },
        },
      },
    ]);
    expect(JSON.stringify(read(released.state, other).reply)).not.toContain(
      'private answer'
    );

    // Answers closed without a release can open again and keep what is there.
    const kept = action(graded.state, host, {
      kind: 'assessment.status',
      status: 'open',
    }).state.liveActivities?.assessment;
    expect(kept?.responses).toHaveLength(1);
    expect(kept?.items.map(({ id }) => id)).toEqual([question.id, long.id]);

    // The key went out, so that attempt is over: opening again is a new one.
    const reopened = action(released.state, cohost, {
      kind: 'assessment.status',
      status: 'open',
    });
    const fresh = reopened.state.liveActivities?.assessment;
    expect(fresh).toMatchObject({
      status: 'open',
      released: false,
      sealed: false,
      responses: [],
    });
    const freshIds = fresh?.items.map(({ id }) => id) ?? [];
    expect(freshIds).toHaveLength(2);
    expect(freshIds).not.toContain(question.id);
    expect(freshIds).not.toContain(long.id);
    expect(JSON.stringify(reopened.broadcast)).not.toContain('"correct"');
    expect(reopened.direct).toMatchObject([
      { userId: guest.userId, message: { type: 'activity.mine' } },
    ]);
    expect(JSON.stringify(reopened.direct)).not.toMatch(
      /Private feedback|"score"|private answer/
    );
    // Nobody who saw the key can answer the questions it belonged to.
    expect(
      action(reopened.state, guest, {
        kind: 'assessment.submit',
        itemId: long.id,
        answer: 'second thoughts',
      }).reply
    ).toMatchObject(error('activity_item_not_found'));

    // Hiding the results again does not make the released attempt reopenable.
    const hiddenAgain = action(released.state, host, {
      kind: 'assessment.release',
      released: false,
    });
    expect(hiddenAgain.broadcast).toMatchObject([
      { snapshot: { assessment: { released: false, sealed: true } } },
    ]);
    expect(
      action(hiddenAgain.state, host, {
        kind: 'assessment.status',
        status: 'open',
      }).state.liveActivities?.assessment
    ).toMatchObject({ status: 'open', sealed: false, responses: [] });

    const draft = action(released.state, host, {
      kind: 'assessment.status',
      status: 'draft',
    });
    expect(draft.direct).toMatchObject([
      { userId: guest.userId, message: { mine: { assessment: {} } } },
    ]);
    expect(draft.state.liveActivities?.assessment).toMatchObject({
      released: false,
      responses: [],
    });
  });

  it('refuses a delayed grade once the questions were reset and answered again', () => {
    const step = (state: MeetRoomSnapshot, status: string) =>
      action(state, host, { kind: 'assessment.status', status }).state;
    const answer = (state: MeetRoomSnapshot) => {
      const [, long] = state.liveActivities?.assessment.items ?? [];
      const next = action(state, guest, {
        kind: 'assessment.submit',
        itemId: long?.id,
        answer: 'An answer',
      }).state;
      return { itemId: long?.id, state: next };
    };
    const configured = action(room(), host, { kind: 'assessment.set', items });
    const first = answer(step(configured.state, 'open'));
    // The grade the host is about to send for the first answer, revision 0.
    const grade = {
      kind: 'assessment.grade',
      itemId: first.itemId,
      participantId: guest.userId,
      revision: 0,
      score: 10,
    };
    // Meanwhile the questions go back to draft and are answered again.
    const second = answer(step(step(step(first.state, 'closed'), 'draft'), 'open'));
    expect(second.itemId).not.toBe(first.itemId);
    const closed = step(second.state, 'closed');
    expect(closed.liveActivities?.assessment.responses).toMatchObject([
      { itemId: second.itemId, revision: 0 },
    ]);
    const late = action(closed, cohost, grade);
    expect(late.reply).toMatchObject(error('activity_response_not_found'));
    expect(late.state).toBe(closed);
    expect(
      closed.liveActivities?.assessment.responses[0]?.score
    ).toBeUndefined();
    // The same grade for the answer that is there now is accepted.
    expect(
      action(closed, cohost, { ...grade, itemId: second.itemId }).state
        .liveActivities?.assessment.responses
    ).toMatchObject([{ score: 10 }]);
  });

  it('treats an assessment stored as released while open as closed for good', () => {
    const configured = action(room(), host, { kind: 'assessment.set', items });
    const open = action(configured.state, host, {
      kind: 'assessment.status',
      status: 'open',
    }).state;
    const [question] = open.liveActivities?.assessment.items ?? [];
    const answered = action(open, guest, {
      kind: 'assessment.submit',
      itemId: question?.id,
      choice: 0,
    }).state;
    const activities = answered.liveActivities;
    if (!activities || !question) throw new Error('Missing activities');
    const leaked = {
      ...activities,
      assessment: {
        ...activities.assessment,
        released: true,
        responses: activities.assessment.responses.map((response) => ({
          ...response,
          score: 50,
        })),
      },
    };
    // Neither projection hands out results while answers are open.
    expect(publicView(leaked).assessment).toMatchObject({ released: false });
    expect(JSON.stringify(publicView(leaked))).not.toContain('"correct"');
    expect(JSON.stringify(mineView(leaked, guest.userId))).not.toContain(
      '"score"'
    );

    // The room reads that state as a released attempt: closed, key visible.
    const stored = { ...answered, liveActivities: leaked };
    expect(read(stored, guest).reply).toMatchObject([
      {
        snapshot: {
          assessment: { status: 'closed', released: true, sealed: true },
        },
      },
      { mine: { assessment: { [question.id]: { choice: 0, score: 50 } } } },
    ]);
    expect(
      action(stored, guest, {
        kind: 'assessment.submit',
        itemId: question.id,
        choice: 1,
      }).reply
    ).toMatchObject(error('activity_assessment_closed'));
    expect(
      action(stored, host, { kind: 'assessment.status', status: 'open' }).state
        .liveActivities?.assessment
    ).toMatchObject({ status: 'open', released: false, responses: [] });
  });

  it('rejects aggregate escaped JSON beyond the view budget without changing state', () => {
    const configured = action(room(), host, {
      kind: 'assessment.set',
      items: Array.from({ length: 20 }, () => ({
        prompt: 'Response',
        kind: 'long',
      })),
    }).state;
    let state = action(configured, host, {
      kind: 'assessment.status',
      status: 'open',
    }).state;
    let blocked = 0;
    for (const item of state.liveActivities?.assessment.items ?? []) {
      const result = action(state, guest, {
        kind: 'assessment.submit',
        itemId: item.id,
        answer: '\u0000'.repeat(2000),
      });
      if (result.state === state) {
        expect(result.reply).toMatchObject(error('activity_full'));
        blocked++;
      }
      state = result.state;
      for (const frame of [
        ...result.reply,
        ...result.broadcast,
        ...result.toManagers,
      ])
        expect(serializedMeetBytes(frame)).toBeLessThan(MEET_MAX_MESSAGE_BYTES);
    }
    expect(blocked).toBeGreaterThan(0);
    expect(serializedMeetBytes(state.liveActivities)).toBeLessThan(
      LIVE_ACTIVITY_LIMITS.stateBytes
    );
  });
});
