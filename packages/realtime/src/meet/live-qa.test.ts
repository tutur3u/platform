import { describe, expect, it } from 'vitest';
import { LIVE_QA_LIMITS } from './live-qa';
import {
  ask,
  attach,
  errorOf,
  guest,
  host,
  member,
  now,
  room,
  send,
  waiting,
} from './live-qa.fixtures';
import { cleanLiveQaText } from './live-qa-schema';
import { meetRealtimeClientMessageSchema } from './messages';
import { receivesMeetToolFrame } from './permissions';
import type { MeetRoomSnapshot } from './room';

describe('live Q&A questions', () => {
  it('records the author and time from the room, never from the client', () => {
    const { result } = ask(room(), member, { authorName: 'Spoofed' });
    const [shared] = result.broadcast;
    expect(shared).toMatchObject({
      type: 'qa.snapshot',
      snapshot: {
        revision: 1,
        settings: { anonymous: false, answers: 'everyone' },
        questions: [
          {
            text: 'Why?',
            participantId: member.userId,
            authorName: 'Minh Member',
            createdAt: now,
            pinned: false,
            answers: [],
          },
        ],
      },
    });
    // The stored actor key stays on the server.
    expect(JSON.stringify(result.broadcast)).not.toContain('"actor"');
    expect(result.reply[0]).toMatchObject({
      type: 'qa.snapshot',
      self: { actor: member.accountId, participantId: member.userId },
    });
  });

  it('keeps the fields old pages read and their meaning', () => {
    const { result } = ask(room());
    const question = result.state.liveQa?.questions[0];
    expect(question).toMatchObject({
      upvotes: [],
      answered: false,
      hidden: false,
      participantId: member.userId,
    });
  });

  it('strips control and bidirectional override characters and rejects empty text', () => {
    expect(cleanLiveQaText(' a\u0000b‮c\n\n\n\nd​ ')).toBe('abc\n\nd');
    const result = send(room(), member, { type: 'qa.ask', text: '\u0007‮' });
    expect(errorOf(result)).toMatchObject({ error: 'qa_invalid_length' });
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        type: 'qa.ask',
        text: 'x'.repeat(LIVE_QA_LIMITS.questionChars + 1),
      }).success
    ).toBe(false);
  });

  it('refuses people who are not admitted', () => {
    const state = room();
    const held = {
      ...state,
      waiting: {
        [waiting.userId]: {
          displayName: 'W',
          role: 'speaker',
          userId: waiting.userId,
        },
      },
    } as MeetRoomSnapshot;
    expect(
      errorOf(send(held, waiting, { type: 'qa.ask', text: 'Hi' }))
    ).toMatchObject({ error: 'awaiting_admission' });
  });

  it('caps the number of questions', () => {
    let state = room();
    state = {
      ...state,
      liveQa: {
        questions: Array.from({ length: LIVE_QA_LIMITS.questions }, () => ({
          id: crypto.randomUUID(),
          participantId: member.userId,
          text: 'q',
          upvotes: [],
          answered: false,
          hidden: false,
        })),
      },
    };
    expect(
      errorOf(send(state, host, { type: 'qa.ask', text: 'One more' }))
    ).toMatchObject({ error: 'qa_full' });
  });

  it('caps the stored size', () => {
    const state: MeetRoomSnapshot = {
      ...room(),
      liveQa: {
        questions: Array.from({ length: 150 }, () => ({
          id: crypto.randomUUID(),
          participantId: member.userId,
          text: 'q'.repeat(400),
          upvotes: Array.from({ length: 20 }, () => crypto.randomUUID()),
          answered: false,
          hidden: false,
        })),
      },
    };
    expect(
      errorOf(send(state, host, { type: 'qa.ask', text: 'x'.repeat(400) }))
    ).toMatchObject({ error: 'qa_full' });
  });
  it("attaches only the asker's own unshared files to a question", () => {
    const own = attach(room(), member.accountId!);
    const asked = send(own.state, member, {
      type: 'qa.ask',
      text: 'What about this slide?',
      attachmentIds: [own.id],
    });
    expect(errorOf(asked)).toBe(undefined);
    expect(asked.state.liveQa?.questions[0]?.attachmentIds).toEqual([own.id]);
    expect(asked.state.attachments?.[own.id]?.published).toBe(true);
    const theirs = attach(room(), host.accountId!);
    expect(
      errorOf(
        send(theirs.state, member, {
          type: 'qa.ask',
          text: 'Borrowed',
          attachmentIds: [theirs.id],
        })
      )
    ).toMatchObject({ error: 'attachment_unavailable' });
  });
});

describe('live Q&A votes', () => {
  it('toggles one vote per actor, keyed by account or guest room id', () => {
    const { state, id } = ask(room());
    const byGuest = send(state, guest, {
      type: 'qa.upvote',
      questionId: id,
      upvoted: true,
    });
    const twice = send(byGuest.state, guest, {
      type: 'qa.upvote',
      questionId: id,
      upvoted: true,
    });
    const byMember = send(twice.state, member, {
      type: 'qa.upvote',
      questionId: id,
      upvoted: true,
    });
    expect(byMember.state.liveQa?.questions[0]?.upvotes).toEqual([
      guest.userId,
      member.accountId,
    ]);
    // A guest's reply names the key its vote is stored under.
    expect(byGuest.reply[0]).toMatchObject({
      self: { actor: guest.userId },
    });
    const undone = send(byMember.state, guest, {
      type: 'qa.upvote',
      questionId: id,
      upvoted: false,
    });
    expect(undone.state.liveQa?.questions[0]?.upvotes).toEqual([
      member.accountId,
    ]);
  });

  it('rate limits every mutating command per actor', () => {
    let { state, id } = ask(room());
    for (let index = 1; index < LIVE_QA_LIMITS.actionsPerMinute; index++)
      state = send(state, member, {
        type: 'qa.upvote',
        questionId: id,
        upvoted: index % 2 === 0,
      }).state;
    for (const input of [
      { type: 'qa.ask', text: 'More' },
      { type: 'qa.answer', questionId: id, text: 'An answer' },
      { type: 'qa.upvote', questionId: id, upvoted: true },
    ])
      expect(errorOf(send(state, member, input))).toMatchObject({
        error: 'qa_rate_limited',
      });
    // Others are unaffected, and the bucket resets after a minute.
    expect(errorOf(send(state, guest, { type: 'qa.ask', text: 'Hi' }))).toBe(
      undefined
    );
    expect(
      errorOf(send(state, member, { type: 'qa.ask', text: 'Later' }, 61_000))
    ).toBe(undefined);
  });
});

describe('live Q&A answers', () => {
  it('lets any admitted participant answer, with the server name and role', () => {
    const { state, id } = ask(room());
    const answered = send(state, guest, {
      type: 'qa.answer',
      questionId: id,
      text: ' Because. ',
    });
    expect(answered.state.liveQa?.questions[0]?.answers).toMatchObject([
      {
        participantId: guest.userId,
        authorName: 'Gia Guest',
        text: 'Because.',
        attachmentIds: [],
        createdAt: now,
        byHost: false,
      },
    ]);
    const fromHost = send(answered.state, host, {
      type: 'qa.answer',
      questionId: id,
      text: 'Agreed.',
    });
    expect(fromHost.state.liveQa?.questions[0]?.answers?.[1]).toMatchObject({
      byHost: true,
    });
  });

  it('limits answers to hosts when the host setting says so', () => {
    const { state, id } = ask(room());
    const settings = send(state, host, {
      type: 'qa.settings',
      answers: 'hosts',
    });
    expect(
      errorOf(
        send(settings.state, member, {
          type: 'qa.answer',
          questionId: id,
          text: 'Mine',
        })
      )
    ).toMatchObject({ error: 'permission_denied' });
    expect(
      errorOf(
        send(settings.state, host, {
          type: 'qa.answer',
          questionId: id,
          text: 'Ok',
        })
      )
    ).toBe(undefined);
  });

  it('validates answer length, emptiness and the per-question cap', () => {
    const { state, id } = ask(room());
    expect(
      errorOf(
        send(state, member, { type: 'qa.answer', questionId: id, text: ' ' })
      )
    ).toMatchObject({ error: 'qa_invalid_length' });
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        type: 'qa.answer',
        questionId: id,
        text: 'x'.repeat(LIVE_QA_LIMITS.answerChars + 1),
      }).success
    ).toBe(false);
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        type: 'qa.answer',
        questionId: 'not-a-uuid',
        text: 'x',
      }).success
    ).toBe(false);
    let full = state;
    for (let index = 0; index < LIVE_QA_LIMITS.answersPerQuestion; index++)
      full = send(
        full,
        index % 2 ? host : guest,
        { type: 'qa.answer', questionId: id, text: `A${index}` },
        index * 7_000
      ).state;
    expect(
      errorOf(
        send(full, member, { type: 'qa.answer', questionId: id, text: 'Late' })
      )
    ).toMatchObject({ error: 'qa_answers_full' });
    expect(
      errorOf(
        send(state, member, {
          type: 'qa.answer',
          questionId: crypto.randomUUID(),
          text: 'Nowhere',
        })
      )
    ).toMatchObject({ error: 'qa_not_found' });
  });

  it('accepts only unshared files this actor uploaded to the room', () => {
    const asked = ask(room());
    const own = attach(asked.state, member.accountId!);
    const answered = send(own.state, member, {
      type: 'qa.answer',
      questionId: asked.id,
      text: '',
      attachmentIds: [own.id],
    });
    expect(errorOf(answered)).toBe(undefined);
    expect(answered.state.attachments?.[own.id]?.published).toBe(true);
    expect(
      answered.state.liveQa?.questions[0]?.answers?.[0]?.attachmentIds
    ).toEqual([own.id]);
    const cases = [
      attach(asked.state, guest.userId),
      attach(asked.state, member.accountId!, { discarded: true }),
      attach(asked.state, member.accountId!, { published: true }),
      { id: crypto.randomUUID(), state: asked.state },
    ];
    for (const file of cases)
      expect(
        errorOf(
          send(file.state, member, {
            type: 'qa.answer',
            questionId: asked.id,
            text: 'See file',
            attachmentIds: [file.id],
          })
        )
      ).toMatchObject({ error: 'attachment_unavailable' });
    expect(
      errorOf(
        send(own.state, member, {
          type: 'qa.answer',
          questionId: asked.id,
          text: 'Twice',
          attachmentIds: [own.id, own.id],
        })
      )
    ).toMatchObject({ error: 'attachment_unavailable' });
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        type: 'qa.answer',
        questionId: asked.id,
        text: 'Many',
        attachmentIds: Array.from({ length: 5 }, () => crypto.randomUUID()),
      }).success
    ).toBe(false);
    // A guest's files are keyed by the guest's room id.
    const guestFile = attach(asked.state, guest.userId);
    expect(
      errorOf(
        send(guestFile.state, guest, {
          type: 'qa.answer',
          questionId: asked.id,
          text: 'Mine',
          attachmentIds: [guestFile.id],
        })
      )
    ).toBe(undefined);
  });

  it('lets only the author or a host delete an answer, and withdraws its files', () => {
    const asked = ask(room());
    const file = attach(asked.state, member.accountId!);
    const answered = send(file.state, member, {
      type: 'qa.answer',
      questionId: asked.id,
      text: 'With a file',
      attachmentIds: [file.id],
    });
    const answerId = answered.state.liveQa?.questions[0]?.answers?.[0]?.id;
    const remove = { type: 'qa.answer.delete', questionId: asked.id, answerId };
    expect(errorOf(send(answered.state, guest, remove))).toMatchObject({
      error: 'permission_denied',
    });
    const byAuthor = send(answered.state, member, remove);
    expect(byAuthor.state.liveQa?.questions[0]?.answers).toEqual([]);
    expect(byAuthor.state.attachments?.[file.id]?.discarded).toBe(true);
    expect(errorOf(send(answered.state, host, remove))).toBe(undefined);
    expect(errorOf(send(byAuthor.state, member, remove))).toMatchObject({
      error: 'qa_not_found',
    });
  });
});

describe('live Q&A hosting', () => {
  it('refuses host commands from everyone else', () => {
    const { state, id } = ask(room());
    for (const input of [
      { type: 'qa.pin', questionId: id, pinned: true },
      { type: 'qa.moderate', questionId: id, field: 'hidden', value: true },
      { type: 'qa.moderate', questionId: id, field: 'answered', value: true },
      { type: 'qa.settings', anonymous: true },
      { type: 'qa.clear' },
    ])
      for (const token of [member, guest])
        expect(errorOf(send(state, token, input))).toMatchObject({
          error: 'permission_denied',
        });
  });

  it('pins one question at a time and unpins a hidden one', () => {
    const first = ask(room());
    const second = ask(first.state, guest);
    const pinFirst = send(second.state, host, {
      type: 'qa.pin',
      questionId: first.id,
      pinned: true,
    });
    const pinSecond = send(pinFirst.state, host, {
      type: 'qa.pin',
      questionId: second.id,
      pinned: true,
    });
    expect(pinSecond.state.liveQa?.questions.map((q) => q.pinned)).toEqual([
      false,
      true,
    ]);
    const hidden = send(pinSecond.state, host, {
      type: 'qa.moderate',
      questionId: second.id,
      field: 'hidden',
      value: true,
    });
    expect(hidden.state.liveQa?.questions[1]).toMatchObject({
      hidden: true,
      pinned: false,
    });
    expect(
      errorOf(
        send(hidden.state, host, {
          type: 'qa.pin',
          questionId: second.id,
          pinned: true,
        })
      )
    ).toMatchObject({ error: 'qa_not_found' });
    const cleared = send(hidden.state, host, { type: 'qa.clear' });
    expect(cleared.state.liveQa?.questions[1]).toMatchObject({
      hidden: false,
      answered: false,
      pinned: false,
    });
  });

  it('keeps hidden questions and anonymous authors out of the shared view', () => {
    const settings = send(room(), host, {
      type: 'qa.settings',
      anonymous: true,
    });
    const asked = ask(settings.state, member, { anonymous: true });
    const shared = asked.result.broadcast[0];
    expect(shared).toMatchObject({
      snapshot: { questions: [{ participantId: '', anonymous: true }] },
    });
    expect(JSON.stringify(shared)).not.toContain(member.userId);
    expect(JSON.stringify(shared)).not.toContain('Minh Member');
    // Every other admitted host gets the full view, naming the author.
    expect(asked.result.direct).toEqual([
      {
        userId: host.userId,
        message: {
          type: 'qa.host',
          snapshot: expect.objectContaining({
            questions: [
              expect.objectContaining({
                participantId: member.userId,
                authorName: 'Minh Member',
              }),
            ],
          }),
        },
      },
    ]);
    const hidden = send(asked.state, host, {
      type: 'qa.moderate',
      questionId: asked.id,
      field: 'hidden',
      value: true,
    });
    expect(hidden.broadcast[0]).toMatchObject({ snapshot: { questions: [] } });
    expect(hidden.reply).toMatchObject([
      { type: 'qa.snapshot', snapshot: { questions: [] } },
      { type: 'qa.host', snapshot: { questions: [{ hidden: true }] } },
    ]);
    const read = send(hidden.state, member, { type: 'qa.read' });
    expect(read.reply).toHaveLength(1);
    expect(read.reply[0]).toMatchObject({ snapshot: { questions: [] } });
  });

  it('refuses anonymous questions unless the host allows them', () => {
    expect(
      errorOf(
        send(room(), member, { type: 'qa.ask', text: 'Shh', anonymous: true })
      )
    ).toMatchObject({ error: 'qa_anonymous_disabled' });
  });

  it('delivers the full view only to admitted hosts', () => {
    const state = room();
    const frame = { type: 'qa.host' };
    expect(receivesMeetToolFrame(state, host, frame)).toBe(true);
    expect(receivesMeetToolFrame(state, member, frame)).toBe(false);
    expect(receivesMeetToolFrame({ ...state, ended: true }, host, frame)).toBe(
      false
    );
  });
});

describe('live Q&A stored before answers', () => {
  it('reads, answers and votes on questions without the newer fields', () => {
    const legacyId = crypto.randomUUID();
    const state: MeetRoomSnapshot = {
      ...room(),
      liveQa: {
        questions: [
          {
            id: legacyId,
            participantId: member.userId,
            text: 'Old',
            upvotes: [member.accountId!],
            answered: false,
            hidden: false,
          },
        ],
      },
    };
    const read = send(state, guest, { type: 'qa.read' });
    expect(read.reply[0]).toMatchObject({
      snapshot: {
        revision: 0,
        questions: [{ id: legacyId, text: 'Old', answers: [] }],
      },
    });
    const answered = send(state, guest, {
      type: 'qa.answer',
      questionId: legacyId,
      text: 'New',
    });
    expect(answered.state.liveQa?.revision).toBe(1);
    expect(answered.state.liveQa?.questions[0]?.answers).toHaveLength(1);
    // A vote stored before these fields can still be withdrawn.
    const unvoted = send(state, member, {
      type: 'qa.upvote',
      questionId: legacyId,
      upvoted: false,
    });
    expect(unvoted.state.liveQa?.questions[0]?.upvotes).toEqual([]);
  });
});
