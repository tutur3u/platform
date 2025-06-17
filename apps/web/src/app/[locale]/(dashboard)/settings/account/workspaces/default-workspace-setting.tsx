'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Check, Loader2 } from '@tuturuuu/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Workspace {
  id: string;
  name: string;
  role: string;
}

interface DefaultWorkspaceSettingProps {
  defaultWorkspaceId?: string | null;
}

export default function DefaultWorkspaceSetting({
  defaultWorkspaceId,
}: DefaultWorkspaceSettingProps) {
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
        .select('id, name, workspace_members!inner(role)')
        .eq('workspace_members.user_id', user.id);

      if (error) throw error;

      return workspaces.map((ws) => ({
        id: ws.id,
        name: ws.name || 'Untitled Workspace',
        role: ws.workspace_members[0]?.role,
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
      <div className="text-sm text-muted-foreground">
        No workspaces available
      </div>
    );
  }

  // Normalize comparison values
  const currentValue = defaultWorkspaceId || 'none';
  const hasChanged = selectedWorkspace !== currentValue;

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
          {workspaces.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>
              <div className="flex items-center">
                <span>{workspace.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  ({workspace.role})
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
