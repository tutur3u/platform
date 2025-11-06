'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Crown, Loader2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
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

interface Workspace {
  id: string;
  name: string;
  personal?: boolean;
}

interface DefaultWorkspaceSettingProps {
  defaultWorkspaceId?: string | null;
}

export default function DefaultWorkspaceSetting({
  defaultWorkspaceId,
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
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select(
          'id, name, personal, creator_id, workspace_members!inner(user_id)'
        )
        .eq('workspace_members.user_id', user.id);

      if (error) throw error;

      // Resolve display label for personal workspace similar to workspace-select
      const [publicProfileRes, privateDetailsRes] = await Promise.all([
        supabase
          .from('users')
          .select('display_name, handle')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('user_private_details')
          .select('email')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      const displayLabel =
        (
          publicProfileRes?.data as
            | { display_name: string | null; handle: string | null }
            | null
            | undefined
        )?.display_name ||
        (
          publicProfileRes?.data as
            | { display_name: string | null; handle: string | null }
            | null
            | undefined
        )?.handle ||
        (privateDetailsRes?.data as { email: string | null } | null | undefined)
          ?.email ||
        undefined;

      return workspaces.map((ws) => ({
        id: ws.id,
        name:
          ws.personal === true
            ? displayLabel || ws.name || 'Personal'
            : ws.name || 'Untitled Workspace',
        personal: ws.personal === true,
      })) as Workspace[];
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
    try {
      const response = await fetch('/api/v1/users/me/default-workspace', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: selectedWorkspace === 'none' ? null : selectedWorkspace,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to update default workspace');
      }

      toast({
        title: 'Success!',
        description: 'Your default workspace has been updated.',
      });

      // Invalidate queries to refresh user data
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['user-workspaces'] });

      // Refresh the router to update server-side state
      router.refresh();
    } catch (error) {
      console.error('Error updating default workspace:', error);
      toast({
        title: 'Error',
        description: 'Failed to update default workspace. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
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
