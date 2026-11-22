import { describe, expect, it } from 'vitest';
import { liveActivityCommandSchema } from './live-activities';
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
import type { MeetRoomSnapshot } from './room';

describe('icebreaker', () => {
  it('gives a prompt stored without an id its own on the first read and keeps it', () => {
    const asked = action(room(), host, {
      kind: 'icebreaker.prompt',
      text: 'Hi?',
    }).state;
    const answered = action(asked, guest, {
      kind: 'icebreaker.respond',
      promptId: asked.liveActivities?.icebreaker.promptId,
      text: 'Kept reply',
    }).state;
    const activities = answered.liveActivities;
    if (!activities) throw new Error('Missing activities');
    // As the room stored a prompt before prompts had ids.
    const legacy: MeetRoomSnapshot = {
      ...answered,
      liveActivities: {
        ...activities,
        icebreaker: {
          prompt: 'Hi?',
          responses: activities.icebreaker.responses,
        },
      },
    };

    // The first read writes the id back with its reply, and keeps the replies.
    const first = read(legacy, guest);
    const promptId = first.state.liveActivities?.icebreaker.promptId;
    expect(promptId).toEqual(expect.any(String));
    expect(first.state).not.toBe(legacy);
    expect(first.reply).toMatchObject([
      {
        snapshot: {
          icebreaker: {
            prompt: 'Hi?',
            promptId,
            responses: [{ text: 'Kept reply' }],
          },
        },
      },
      { mine: { icebreaker: { promptId, text: 'Kept reply' } } },
    ]);
    // Every later read of what was stored agrees, and writes nothing.
    const again = read(first.state, other);
    expect(again.state).toBe(first.state);
    expect(again.reply).toMatchObject([
      { snapshot: { icebreaker: { promptId } } },
      {},
    ]);
    // Another id-less prompt never shares that id.
    expect(
      read(legacy, guest).state.liveActivities?.icebreaker.promptId
    ).not.toBe(promptId);
    // People can reply under the id, next to the replies that were there.
    expect(
      action(first.state, other, {
        kind: 'icebreaker.respond',
        promptId,
        text: 'Still here',
      }).broadcast
    ).toMatchObject([
      {
        snapshot: {
          icebreaker: {
            responses: [{ text: 'Kept reply' }, { text: 'Still here' }],
          },
        },
      },
    ]);
    // A refused command that meets the id-less prompt stores the id as well.
    const refused = action(legacy, other, {
      kind: 'icebreaker.respond',
      promptId: crypto.randomUUID(),
      text: 'Guessing',
    });
    expect(refused.reply).toMatchObject(
      error('activity_icebreaker_prompt_changed')
    );
    expect(refused.state.liveActivities?.icebreaker.promptId).toEqual(
      expect.any(String)
    );
    expect(refused.state.liveActivities?.icebreaker.responses).toHaveLength(1);
  });

  it('hides a response from public views and preserves moderation across edits', () => {
    expect(
      action(room(), guest, { kind: 'icebreaker.prompt', text: 'Hi?' }).reply
    ).toMatchObject(error('permission_denied'));
    const prompted = action(room(), host, {
      kind: 'icebreaker.prompt',
      text: 'Hi?',
    }).state;
    const promptId = prompted.liveActivities?.icebreaker.promptId;
    expect(read(prompted, guest).reply).toMatchObject([
      { snapshot: { icebreaker: { prompt: 'Hi?', promptId } } },
      {},
    ]);
    const response = action(prompted, guest, {
      kind: 'icebreaker.respond',
      promptId,
      text: ' first ',
    });
    const responseId =
      response.state.liveActivities?.icebreaker.responses[0]?.id;
    expect(response.broadcast).toMatchObject([
      { snapshot: { icebreaker: { responses: [{ text: 'first' }] } } },
    ]);
    expect(
      action(response.state, other, {
        kind: 'icebreaker.hide',
        responseId,
        hidden: true,
      }).reply
    ).toMatchObject(error('permission_denied'));
    const hidden = action(response.state, cohost, {
      kind: 'icebreaker.hide',
      responseId,
      hidden: true,
    });
    const edited = action(hidden.state, guest, {
      kind: 'icebreaker.respond',
      promptId,
      text: 'private edit',
    });
    expect(edited.broadcast).toMatchObject([
      { snapshot: { icebreaker: { responses: [] } } },
    ]);
    expect(edited.toManagers).toMatchObject([
      {
        host: {
          icebreaker: { hidden: [{ id: responseId, text: 'private edit' }] },
        },
      },
    ]);
    expect(JSON.stringify(read(edited.state, other).reply)).not.toContain(
      'private edit'
    );
    expect(
      action(edited.state, host, { kind: 'icebreaker.prompt', text: null })
        .direct
    ).toMatchObject([
      { userId: guest.userId, message: { mine: { icebreaker: {} } } },
    ]);
  });

  it('refuses a reply written for a prompt that is no longer the current one', () => {
    const ask = (state: MeetRoomSnapshot, text: string | null) =>
      action(state, host, { kind: 'icebreaker.prompt', text }).state;
    const reply = (state: MeetRoomSnapshot, promptId: unknown) =>
      action(state, guest, {
        kind: 'icebreaker.respond',
        promptId,
        text: 'Late reply',
      });
    const first = ask(room(), 'Hi?');
    const firstId = first.liveActivities?.icebreaker.promptId;
    expect(firstId).toEqual(expect.any(String));
    // The same words asked again are a new prompt with a new id.
    const second = ask(first, 'Hi?');
    const secondId = second.liveActivities?.icebreaker.promptId;
    expect(secondId).not.toBe(firstId);

    const late = reply(second, firstId);
    expect(late.reply).toMatchObject(
      error('activity_icebreaker_prompt_changed')
    );
    expect(late.state).toBe(second);
    expect(late.broadcast).toEqual([]);
    expect(reply(second, secondId).broadcast).toMatchObject([
      { snapshot: { icebreaker: { responses: [{ text: 'Late reply' }] } } },
    ]);

    // A cleared prompt has no id, and takes no reply.
    const cleared = ask(second, null);
    expect(cleared.liveActivities?.icebreaker.promptId).toBeNull();
    expect(read(cleared, guest).reply).toMatchObject([
      { snapshot: { icebreaker: { prompt: null, promptId: null } } },
      {},
    ]);
    expect(reply(cleared, secondId).reply).toMatchObject(
      error('activity_icebreaker_unavailable')
    );
    // Their own reply names its prompt, and is gone once the prompt changes.
    const replied = reply(second, secondId).state;
    expect(read(replied, guest).reply).toMatchObject([
      {},
      { mine: { icebreaker: { promptId: secondId, text: 'Late reply' } } },
    ]);
    const [, afterNext] = read(ask(replied, 'Next?'), guest).reply;
    expect(afterNext).toMatchObject({ mine: { icebreaker: {} } });
    expect(JSON.stringify(afterNext)).not.toMatch(/Late reply|promptId/);
    // The wire refuses a reply that names no prompt.
    expect(
      liveActivityCommandSchema.safeParse({
        kind: 'icebreaker.respond',
        text: 'No prompt',
      }).success
    ).toBe(false);
  });
});
