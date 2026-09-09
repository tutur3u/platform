'use client';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from '@tuturuuu/icons';
import { listWorkspaces } from '@tuturuuu/internal-api';
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
  const workspaces = useQuery({
    queryKey: ['meet-assistant-workspaces', selfUserId],
    queryFn: () => listWorkspaces(),
    enabled: !!selfUserId,
    staleTime: 60000,
    retry: false,
  });
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <Building2 className="size-4 shrink-0 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className="h-8 min-w-0 text-xs"
          aria-label={t('assistant_workspace')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="personal">
            {t('assistant_personal_workspace')}
          </SelectItem>
          {workspaces.data
            ?.filter((workspace) => !workspace.personal)
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
