'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Crown, Loader2 } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

interface Workspace {
  id: string;
  name: string;
  personal?: boolean;
}

interface DefaultWorkspaceSettingProps {
  defaultWorkspaceId?: string | null;
  user?: WorkspaceUser | null;
}

export default function DefaultWorkspaceSetting({
  defaultWorkspaceId,
  user,
}: DefaultWorkspaceSettingProps) {
  const t = useTranslations('common');
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>(
    defaultWorkspaceId || 'none'
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['user-workspaces'],
    queryFn: async () => {
      const workspaces = await apiFetch<Array<Workspace>>(
        '/api/v1/workspaces',
        {
          cache: 'no-store',
        }
      );

      const personalLabel =
        user?.display_name ||
        user?.handle ||
        user?.email ||
        t('personal_account');

      return workspaces.map((ws) => ({
        id: ws.id,
        name:
          ws.personal === true
            ? personalLabel || ws.name || 'Personal'
            : ws.name || 'Untitled Workspace',
        personal: ws.personal === true,
      })) as Workspace[];
    },
  });

  const updateDefaultWorkspaceMutation = useMutation({
    mutationFn: (workspaceId: string | null) =>
      apiFetch('/api/v1/users/me/default-workspace', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId,
        }),
      }),
    onSuccess: () => {
      toast({
        title: 'Success!',
        description: 'Your default workspace has been updated.',
      });

      void queryClient.invalidateQueries({ queryKey: ['user'] });
      void queryClient.invalidateQueries({ queryKey: ['user-workspaces'] });
      router.refresh();
    },
    onError: (error) => {
      console.error('Error updating default workspace:', error);
      toast({
        title: 'Error',
        description: 'Failed to update default workspace. Please try again.',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (defaultWorkspaceId) {
      setSelectedWorkspace(defaultWorkspaceId);
    } else {
      setSelectedWorkspace('none');
    }
  }, [defaultWorkspaceId]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    await updateDefaultWorkspaceMutation.mutateAsync(
      selectedWorkspace === 'none' ? null : selectedWorkspace
    );
    setIsUpdating(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="h-10 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!workspaces || workspaces.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        No workspaces available
      </div>
    );
  }

  // Normalize comparison values
  const currentValue = defaultWorkspaceId || 'none';
  const hasChanged = selectedWorkspace !== currentValue;
  const selectedWorkspaceObj = workspaces.find(
    (w) => w.id === selectedWorkspace
  );
  const selectedIsPersonal = selectedWorkspaceObj?.personal === true;

  return (
    <div className="space-y-3">
      <Select
        value={selectedWorkspace}
        onValueChange={setSelectedWorkspace}
        disabled={isUpdating}
      >
        <SelectTrigger className={isUpdating ? 'opacity-50' : ''}>
          <SelectValue placeholder="Select a default workspace" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="text-muted-foreground">No default workspace</span>
          </SelectItem>
          {/* Group: Personal */}
          <SelectItem value="__header-personal__" disabled>
            <span className="text-muted-foreground text-xs">
              {t('personal_account')}
            </span>
          </SelectItem>
          {workspaces
            .filter((w) => w.personal)
            .map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                <div className="flex items-center">
                  <Crown className="mr-2 h-3.5 w-3.5 opacity-70" />
                  <span>{workspace.name}</span>
                </div>
              </SelectItem>
            ))}
          {/* Group: Other Workspaces */}
          <SelectItem value="__header-workspaces__" disabled>
            <span className="text-muted-foreground text-xs">
              {t('workspaces')}
            </span>
          </SelectItem>
          {workspaces
            .filter((w) => !w.personal)
            .map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                <span>{workspace.name}</span>
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {selectedIsPersonal && (
        <Alert className="mt-2">
          <Crown className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">{t('personal_account')}</span>
            <span className="ml-2 text-muted-foreground">/personal</span>
          </AlertDescription>
        </Alert>
      )}

      {hasChanged && (
        <Button
          onClick={handleUpdate}
          disabled={isUpdating}
          size="sm"
          className="w-full"
        >
          {isUpdating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      )}
    </div>
  );
}
