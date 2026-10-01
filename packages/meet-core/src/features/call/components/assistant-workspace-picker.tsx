'use client';

import { Building2 } from '@tuturuuu/icons';
import { useVisibleWorkspaces } from '@tuturuuu/ui/hooks/use-visible-workspaces';
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
export function AssistantWorkspacePicker({
  value,
  onChange,
  selfUserId,
}: {
  value: string;
  onChange: (value: string) => void;
  selfUserId: string | null;
}) {
  const t = useTranslations('meet.call');
  const { workspaces, allowed } = useAssistantWorkspaceSelection(
    value,
    selfUserId
  );
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <Building2 className="size-4 shrink-0 text-muted-foreground" />
      <Select value={allowed ? value : ''} onValueChange={onChange}>
        <SelectTrigger
          className="h-8 min-w-0 text-xs"
          aria-label={t('assistant_workspace')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {workspaces.data?.some((workspace) => workspace.personal) && (
            <SelectItem value="personal">
              {t('assistant_personal_workspace')}
            </SelectItem>
          )}
          {workspaces.data
            ?.filter(
              (workspace) =>
                !workspace.personal && workspace.access_type === 'member'
            )
            .map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name ?? workspace.id}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function useAssistantWorkspaceSelection(
  value: string,
  selfUserId: string | null,
  enabled = true
) {
  const actor = useWorkspaceActor();
  const workspaces = useVisibleWorkspaces(
    enabled && Boolean(selfUserId) && actor?.actorId === selfUserId
  );
  const allowed =
    enabled &&
    actor?.actorId === selfUserId &&
    !workspaces.isError &&
    Boolean(
      workspaces.data?.some((workspace) =>
        value === 'personal'
          ? workspace.personal
          : workspace.id === value &&
            !workspace.personal &&
            workspace.access_type === 'member'
      )
    );
  return { workspaces, allowed, value, actor };
}

export function isCurrentAssistantWorkspace(
  current: {
    allowed: boolean;
    value: string;
    actor: { assertActive: () => void } | null;
  },
  requested: { value: string; actor: { assertActive: () => void } | null }
) {
  if (
    !current.allowed ||
    !current.actor ||
    current.value !== requested.value ||
    current.actor !== requested.actor
  )
    return false;
  try {
    current.actor.assertActive();
    return true;
  } catch {
    return false;
  }
}
