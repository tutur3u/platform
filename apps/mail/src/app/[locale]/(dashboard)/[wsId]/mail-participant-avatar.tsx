'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { useMailPerson } from './mail-people-resolver';

export function mailParticipantInitials(
  name: string | null | undefined,
  address: string
) {
  const parts = (name?.trim() || address.split('@')[0] || '?')
    .split(/[\s._-]+/u)
    .filter(Boolean);
  return [parts[0]?.[0], parts.length > 1 ? parts.at(-1)?.[0] : '']
    .join('')
    .toLocaleUpperCase();
}

export function MailParticipantAvatar({
  workspaceId,
  address,
  name,
}: {
  workspaceId?: string;
  address: string;
  name?: string | null;
}) {
  // Resolved through the permission-checked people lookup, which honours
  // the workspace's member visibility settings.
  const { data: person } = useMailPerson(workspaceId, address);
  return (
    <Avatar className="size-6 shrink-0" aria-hidden="true">
      {person?.avatarUrl ? (
        <AvatarImage
          src={person.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
        />
      ) : null}
      <AvatarFallback className="bg-muted font-medium text-[10px]">
        {mailParticipantInitials(name || person?.displayName, address)}
      </AvatarFallback>
    </Avatar>
  );
}
