'use client';

import {
  DISPLAY_NAME_LOCKED,
  RENAME_RATE_LIMITED,
} from '@tuturuuu/realtime/meet';
import { useEffect, useRef, useState } from 'react';
import { prepareParticipantName } from '../lib/participant-name';
import type { MeetRoomController } from '../lib/room-controller';
import { useProfileNameSave } from './use-profile-name-save';

/** What the room did with a name the profile accepted. */
export type LiveRenameState =
  | { kind: 'idle' }
  | { kind: 'renaming' }
  | { kind: 'renamed' }
  /** Saved to the profile; the host-approved name stays for this call. */
  | { kind: 'locked' }
  /** Saved to the profile; too many recent renames, so the room kept the old name. */
  | { kind: 'rate_limited' }
  /** Saved to the profile; the room did not confirm it and a reconnect replays it. */
  | { kind: 'unconfirmed' };

type LiveRenameRoom = Pick<
  MeetRoomController,
  'previewDisplayName' | 'renameSelf' | 'state'
>;

/**
 * Saves the profile name, then renames this participant for everyone in the
 * room. Only this device shows the name before the profile save succeeds,
 * and that preview rolls back when the save or the room refuses it.
 */
export function useLiveDisplayName({
  room,
  siteKey,
  onProfileSaved,
}: {
  room: LiveRenameRoom;
  siteKey?: string;
  onProfileSaved?: (name: string) => void;
}) {
  const [live, setLive] = useState<LiveRenameState>({ kind: 'idle' });
  const selfUserId = room.state.selfUserId;
  const roomName = selfUserId
    ? room.state.participants[selfUserId]?.displayName
    : undefined;
  /** The name to restore while an optimistic preview is showing. */
  const pending = useRef<{ userId: string; previous: string } | null>(null);
  const previewRef = useRef(room.previewDisplayName);
  previewRef.current = room.previewDisplayName;

  const rollback = () => {
    const shown = pending.current;
    pending.current = null;
    if (shown) previewRef.current(shown.userId, shown.previous);
  };

  const nameSave = useProfileNameSave({
    siteKey,
    onFailed: rollback,
    onSaved: async (name) => {
      // From here the room owns the name: only its refusal restores the old one.
      const shown = pending.current;
      pending.current = null;
      onProfileSaved?.(name);
      setLive({ kind: 'renaming' });
      try {
        await room.renameSelf(name);
        setLive({ kind: 'renamed' });
      } catch (error) {
        if (shown) previewRef.current(shown.userId, shown.previous);
        const code = error instanceof Error ? error.message : '';
        setLive({
          kind:
            code === DISPLAY_NAME_LOCKED
              ? 'locked'
              : code === RENAME_RATE_LIMITED
                ? 'rate_limited'
                : 'unconfirmed',
        });
      }
    },
  });

  // Closing settings mid-check abandons the save, so its preview goes too.
  useEffect(
    () => () => {
      const shown = pending.current;
      pending.current = null;
      if (shown) previewRef.current(shown.userId, shown.previous);
    },
    []
  );

  const submit = (value: string) => {
    const name = prepareParticipantName(value);
    if (!name || nameSave.busy || live.kind === 'renaming') return;
    setLive({ kind: 'idle' });
    if (selfUserId && roomName !== undefined && roomName !== name) {
      pending.current ??= { userId: selfUserId, previous: roomName };
      room.previewDisplayName(selfUserId, name);
    }
    void nameSave.save(name);
  };

  return {
    submit,
    save: nameSave,
    live,
    busy: nameSave.busy || live.kind === 'renaming',
    clearStatus: () => {
      nameSave.reset();
      rollback();
      setLive({ kind: 'idle' });
    },
  };
}
