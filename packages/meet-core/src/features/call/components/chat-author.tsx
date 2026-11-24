'use client';
import type { CallChatMessage } from '../lib/call-state';
import {
  type MeetParticipantIdentityFlags,
  meetParticipantName,
} from '../lib/participant-identity';
import { ParticipantIdentityBadge } from './participant-identity-badge';

/**
 * A room chat author's name and identity marker. The message's own flags win,
 * so the marker survives the author leaving; in-call presence covers messages
 * from rooms that predate those flags.
 */
export function ChatAuthor({
  message,
  participants,
  self,
  youLabel,
}: {
  message: CallChatMessage;
  participants?: (MeetParticipantIdentityFlags & { userId: string })[];
  self: boolean;
  youLabel: string;
}) {
  if (self)
    return <span className="truncate font-medium text-xs">{youLabel}</span>;
  const person = participants?.find((entry) => entry.userId === message.userId);
  const identity = {
    guest: message.guest ?? person?.guest,
    external: message.external ?? person?.external,
  };
  return (
    <>
      <span className="truncate font-medium text-xs">
        {meetParticipantName(message.displayName, identity)}
      </span>
      <ParticipantIdentityBadge participant={identity} />
    </>
  );
}
