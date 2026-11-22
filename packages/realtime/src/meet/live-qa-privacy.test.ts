import { describe, expect, it } from 'vitest';
import {
  ask,
  attach,
  errorOf,
  guest,
  host,
  member,
  room,
  send,
} from './live-qa.fixtures';

describe('live Q&A votes in the shared view', () => {
  it('sends a count to the room, the voters to hosts and each person their own votes', () => {
    const { state, id } = ask(room());
    const byGuest = send(state, guest, {
      type: 'qa.upvote',
      questionId: id,
      upvoted: true,
    });
    const byMember = send(byGuest.state, member, {
      type: 'qa.upvote',
      questionId: id,
      upvoted: true,
    });
    expect(byMember.broadcast[0]).toMatchObject({
      snapshot: { questions: [{ upvotes: [], upvoteCount: 2 }] },
    });
    const shared = JSON.stringify(byMember.broadcast);
    expect(shared).not.toContain(guest.userId);
    expect(shared).not.toContain(member.accountId);
    expect(byMember.direct).toMatchObject([
      {
        userId: host.userId,
        message: {
          type: 'qa.host',
          snapshot: {
            questions: [
              { upvotes: [guest.userId, member.accountId], upvoteCount: 2 },
            ],
          },
        },
      },
    ]);
    expect(byMember.reply[0]).toMatchObject({
      self: { actor: member.accountId, votedIds: [id] },
    });
    const hostRead = send(byMember.state, host, { type: 'qa.read' });
    expect(hostRead.reply[0]).toMatchObject({ self: { votedIds: [] } });
  });

  it('marks an anonymous guest so the panel can leave out room files', () => {
    const read = send(room(), guest, { type: 'qa.read' });
    expect(read.reply[0]).toMatchObject({ self: { guest: true } });
    const memberRead = send(room(), member, { type: 'qa.read' });
    expect(memberRead.reply[0]).not.toMatchObject({ self: { guest: true } });
  });
});

describe('live Q&A files on hidden questions and deleted answers', () => {
  it('withholds a hidden question’s files and its answers’ files until it is shown again', () => {
    const questionFile = attach(room(), member.accountId!);
    const asked = send(questionFile.state, member, {
      type: 'qa.ask',
      text: 'With a file',
      attachmentIds: [questionFile.id],
    });
    const questionId = asked.state.liveQa!.questions[0]!.id;
    const answerFile = attach(asked.state, host.accountId!);
    const answered = send(answerFile.state, host, {
      type: 'qa.answer',
      questionId,
      text: 'Also a file',
      attachmentIds: [answerFile.id],
    });
    const hidden = send(answered.state, host, {
      type: 'qa.moderate',
      questionId,
      field: 'hidden',
      value: true,
    });
    for (const id of [questionFile.id, answerFile.id])
      expect(hidden.state.attachments?.[id]?.withheld).toBe(true);
    const shown = send(hidden.state, host, {
      type: 'qa.moderate',
      questionId,
      field: 'hidden',
      value: false,
    });
    for (const id of [questionFile.id, answerFile.id])
      expect(shown.state.attachments?.[id]?.withheld).toBeUndefined();
    const cleared = send(hidden.state, host, { type: 'qa.clear' });
    expect(cleared.state.attachments?.[questionFile.id]?.withheld).toBe(
      undefined
    );
    // Marking answered leaves files alone.
    const marked = send(answered.state, host, {
      type: 'qa.moderate',
      questionId,
      field: 'answered',
      value: true,
    });
    expect(marked.state.attachments?.[questionFile.id]?.withheld).toBe(
      undefined
    );
  });

  it('releases a deleted answer’s files for removal from storage', () => {
    const asked = ask(room());
    const file = attach(asked.state, member.accountId!);
    const answered = send(file.state, member, {
      type: 'qa.answer',
      questionId: asked.id,
      text: 'With a file',
      attachmentIds: [file.id],
    });
    const answerId = answered.state.liveQa?.questions[0]?.answers?.[0]?.id;
    const deleted = send(answered.state, host, {
      type: 'qa.answer.delete',
      questionId: asked.id,
      answerId,
    });
    expect(errorOf(deleted)).toBe(undefined);
    expect(deleted.state.attachments?.[file.id]).toMatchObject({
      discarded: true,
      published: false,
      released: true,
    });
  });
});
