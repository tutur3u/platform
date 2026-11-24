import { afterEach, describe, expect, it, vi } from 'vitest';
import { admitOrHold, createMeetRoomSnapshot } from './index';
import { applyMiraRoomConsent } from './room-mira-consent';
import { acceptMira, miraChoice, miraToken } from './room-mira.fixtures';
import type { RoomServiceState } from './room-service';

const host = '00000000-0000-4000-8000-0000000000a1';
const guest = '00000000-0000-4000-8000-0000000000b2';

function staged() {
  let state: RoomServiceState = createMeetRoomSnapshot();
  for (const id of [host, guest])
    state = admitOrHold(state, miraToken(id), '2026-11-24T00:00:00Z').state;
  state = acceptMira(state, host);
  const result = applyMiraRoomConsent(
    state,
    miraToken(guest),
    miraChoice(state, 'on')
  )!;
  const pendingId = (result.body as { pendingId?: unknown }).pendingId;
  expect(typeof pendingId).toBe('string');
  return { state: result.state, pendingId: pendingId as string };
}

const confirm = (
  state: RoomServiceState,
  token: ReturnType<typeof miraToken>,
  pendingId: string
) =>
  applyMiraRoomConsent(state, token, {
    action: 'mira.room.confirm',
    pendingId,
  })!;

afterEach(() => vi.restoreAllMocks());

describe('confirming a staged Mira on', () => {
  it('refuses a token without the server scope and changes nothing', () => {
    const { state, pendingId } = staged();
    const client = miraToken(guest, 'speaker', { scopes: [] });
    const result = confirm(state, client, pendingId);
    expect(result.status).toBe(403);
    expect(result.state).toBe(state);
    // The id stays usable by the server afterwards.
    expect(confirm(state, miraToken(guest), pendingId).status ?? 200).toBe(200);
  });

  it('refuses another account the pending id of someone else and changes nothing', () => {
    const { state, pendingId } = staged();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = confirm(state, miraToken(host), pendingId);
    expect(result.status).toBe(409);
    expect(result.state).toBe(state);
  });

  it('warns about a stale confirm with the pending id only', () => {
    const { state } = staged();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stale = '0b1e0d1c-2f3a-4b5c-8d6e-7f8091a2b3c4';
    const result = confirm(state, miraToken(guest), stale);
    expect(result.status).toBe(409);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[meet-mira] stale pending confirm', {
      pendingId: stale,
    });
  });
});
