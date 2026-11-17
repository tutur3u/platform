'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { listWorkspaces } from '@tuturuuu/internal-api';
import { getContactCreateCapability } from '@tuturuuu/internal-api/people';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useHoldMailProfile } from './mail-profile-context';

export function contactCapabilityQueryKey(
  actorId: string | null,
  workspaceId: string
) {
  return ['mail', 'contact-create-capability', actorId, workspaceId] as const;
}

export function contactCapabilityQuery(
  actorId: string | null,
  workspaceId: string,
  enabled: boolean
) {
  return {
    queryKey: contactCapabilityQueryKey(actorId, workspaceId),
    queryFn: () => getContactCreateCapability(workspaceId),
    enabled: Boolean(actorId && workspaceId) && enabled,
    retry: false,
    staleTime: 60_000,
  };
}

/** The viewer's workspaces, the candidates for a new contact. */
export function useContactWorkspaces(actorId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['mail', 'contact-workspaces', actorId],
    queryFn: () => listWorkspaces(),
    enabled: Boolean(actorId) && enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * Workspace select for a new contact. Each workspace's create permission is
 * checked only once the list opens; workspaces without it stay visible but
 * disabled as read only.
 */
export function MailContactWorkspacePicker({
  id,
  actorId,
  workspaces,
  value,
  mailboxWorkspaceId,
  open,
  disabled,
  onOpenChange,
  onValueChange,
}: {
  id: string;
  actorId: string | null;
  workspaces: readonly {
    id: string;
    name: string | null;
    personal?: boolean | null;
  }[];
  value: string;
  mailboxWorkspaceId?: string | null;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (workspaceId: string) => void;
}) {
  const t = useTranslations('mail.profile_actions');
  useHoldMailProfile(open);
  const capabilities = useQueries({
    queries: workspaces.map((workspace) =>
      contactCapabilityQuery(actorId, workspace.id, open)
    ),
  });

  return (
    <Select
      value={value}
      open={open}
      disabled={disabled}
      onOpenChange={onOpenChange}
      onValueChange={onValueChange}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={t('workspace_placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((workspace, index) => {
          const capability = capabilities[index];
          const writable = Boolean(capability?.data?.canCreate);
          const note = capability?.isError
            ? t('read_only')
            : !writable && workspace.id !== value
              ? t('checking')
              : workspace.id === mailboxWorkspaceId
                ? t('owns_mailbox')
                : workspace.personal
                  ? t('personal')
                  : null;
          return (
            <SelectItem
              key={workspace.id}
              value={workspace.id}
              disabled={!writable && workspace.id !== value}
            >
              <span className="truncate">
                {workspace.name || t('untitled_workspace')}
              </span>
              {note ? (
                <span className="shrink-0 text-muted-foreground text-xs">
                  {note}
                </span>
              ) : null}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
