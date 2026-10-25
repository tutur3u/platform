'use client';
import { useQuery } from '@tanstack/react-query';
import { listWorkspaceMembers } from '@tuturuuu/internal-api';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';

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
  const query = useQuery({
    queryKey: ['mail', workspaceId, 'participant-profiles'],
    queryFn: () => listWorkspaceMembers(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profile = query.data?.find(
    (member) =>
      member.email?.trim().toLowerCase() === address.trim().toLowerCase()
  );
  return (
    <Avatar className="size-6 shrink-0" aria-hidden="true">
      {profile?.avatar_url ? (
        <AvatarImage
          src={profile.avatar_url}
          alt=""
          referrerPolicy="no-referrer"
        />
      ) : null}
      <AvatarFallback className="bg-muted font-medium text-[10px]">
        {mailParticipantInitials(name || profile?.display_name, address)}
      </AvatarFallback>
    </Avatar>
  );
}
