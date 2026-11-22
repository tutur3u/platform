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
    // The wire refuses a reply that names no prompt.
    expect(
      liveActivityCommandSchema.safeParse({
        kind: 'icebreaker.respond',
        text: 'No prompt',
      }).success
    ).toBe(false);
  });
});
