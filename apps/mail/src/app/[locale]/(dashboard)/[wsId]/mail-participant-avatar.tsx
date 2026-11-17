'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { useTranslations } from 'next-intl';
import { useMailPerson } from './mail-people-resolver';
import {
  mailPersonDisplayName,
  mailPersonEmailVisible,
} from './mail-person-display';

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
  // the workspace's member visibility settings. Initials follow the visible
  // name and never fall back to an address the workspace hides.
  // It reads the resolver and display rules directly rather than the profile
  // hook, which renders this avatar's card and would import it back.
  const t = useTranslations('mail.profile');
  const { data: person } = useMailPerson(workspaceId, address);
  const label = mailPersonDisplayName(person, name, address, t('member'));
  const initialsSource = mailPersonEmailVisible(person) ? address : label;
  const initialsName =
    label.trim().toLowerCase() === address.trim().toLowerCase() ? null : label;
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
        {mailParticipantInitials(initialsName, initialsSource)}
      </AvatarFallback>
    </Avatar>
  );
}
