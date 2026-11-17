'use client';

import { X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { MailParticipantAvatar } from './mail-participant-avatar';
import { useMailPerson } from './mail-people-resolver';

/** A recipient chip: avatar and name, with the address in a tooltip. */
export function RecipientChip({
  address,
  displayName,
  removeLabel,
  workspaceId,
  onRemove,
}: {
  address: string;
  displayName?: string;
  removeLabel: string;
  workspaceId?: string;
  onRemove: () => void;
}) {
  const { data: person } = useMailPerson(workspaceId, address);
  const name = displayName || person?.displayName || address;

  return (
    <Badge
      className="max-w-64 gap-1.5 rounded-full py-0.5 ps-0.5 pe-1.5 font-normal"
      variant="secondary"
    >
      <MailParticipantAvatar
        address={address}
        name={displayName || person?.displayName}
        workspaceId={workspaceId}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="truncate">{name}</span>
        </TooltipTrigger>
        <TooltipContent>{address}</TooltipContent>
      </Tooltip>
      <button
        aria-label={removeLabel}
        className="rounded-sm opacity-60 hover:opacity-100"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3" />
      </button>
    </Badge>
  );
}
