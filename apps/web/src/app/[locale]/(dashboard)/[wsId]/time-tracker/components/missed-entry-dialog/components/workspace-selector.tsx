import { CircleUserRound, Users } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

interface WorkspaceSelectorProps {
  selectedWorkspaceId: string;
  currentWorkspaceId: string;
  userWorkspaces: Workspace[] | undefined;
  isLoadingWorkspaces: boolean;
  isLoading: boolean;
  onWorkspaceChange: (workspaceId: string) => void;
}

export function WorkspaceSelector({
  selectedWorkspaceId,
  currentWorkspaceId,
  userWorkspaces,
  isLoadingWorkspaces,
  isLoading,
  onWorkspaceChange,
}: WorkspaceSelectorProps) {
  const t = useTranslations('time-tracker.missed_entry_dialog');

  return (
    <div>
      <Label htmlFor="missed-entry-workspace">{t('form.workspace')}</Label>
      <Select
        value={selectedWorkspaceId}
        onValueChange={onWorkspaceChange}
        disabled={isLoading || isLoadingWorkspaces}
      >
        <SelectTrigger id="missed-entry-workspace">
          <SelectValue placeholder={t('form.selectWorkspace')} />
        </SelectTrigger>
        <SelectContent>
          {isLoadingWorkspaces ? (
            <SelectItem value="loading" disabled>
              {t('form.loadingWorkspaces')}
            </SelectItem>
          ) : (
            userWorkspaces?.map((ws) => (
              <SelectItem key={ws.id} value={ws.id}>
                <div className="flex items-center gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarImage
                      src={ws.avatar_url || undefined}
                      alt={ws.name || ''}
                    />
                    <AvatarFallback className="text-[10px]">
                      {ws.personal ? (
                        <CircleUserRound className="h-3 w-3" />
                      ) : (
                        ws.name?.charAt(0).toUpperCase() || <Users className="h-3 w-3" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{ws.name}</span>
                  {ws.personal && (
                    <span className="text-muted-foreground text-xs">
                      ({t('form.personal')})
                    </span>
                  )}
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {selectedWorkspaceId !== currentWorkspaceId && (
        <p className="mt-1 text-muted-foreground text-xs">
          {t('form.differentWorkspaceHint')}
        </p>
      )}
    </div>
  );
}
