import useSWR, { mutate } from 'swr';

import { createContext, useContext, ReactNode } from 'react';
import { Workspace } from '../types/primitives/Workspace';
import { useUser } from '@supabase/auth-helpers-react';
import { showNotification } from '@mantine/notifications';

const WorkspaceContext = createContext({
  workspaces: {} as {
    current: Workspace[];
    invited: Workspace[];
  },
  isLoading: true,
  isError: false,

  createWorkspace: async (
    ws: Workspace,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('createWorkspace', ws, options);
  },
  updateWorkspace: async (
    ws: Workspace,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('updateWorkspace', ws, options);
  },
  deleteWorkspace: async (
    id: string,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('deleteWorkspace', id, options);
  },
});

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const user = useUser();
  const { data, error } = useSWR(user ? '/api/workspaces' : null);

  const createWorkspace = async (
    ws: Workspace,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          name: ws?.name || '',
        }),
      });

      if (!res.ok) throw new Error('Failed to create workspace');
      if (options?.onSuccess) options.onSuccess();
      mutate('/api/workspaces');
    } catch (e) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to create workspace',
        message: 'Make sure you have permission to create new workspaces',
        color: 'red',
      });
    } finally {
      if (options?.onCompleted) options.onCompleted();
    }
  };

  const updateWorkspace = async (
    ws: Workspace,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch(`/api/workspaces/${ws.id}`, {
        method: 'PUT',
        body: JSON.stringify(ws),
      });

      if (!res.ok) throw new Error('Failed to update workspace');
      if (options?.onSuccess) options.onSuccess();
      mutate('/api/workspaces');
    } catch (e) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to update workspace',
        message: 'Make sure you have permission to update this workspace',
        color: 'red',
      });
    } finally {
      if (options?.onCompleted) options.onCompleted();
    }
  };

  const deleteWorkspace = async (
    wsId: string,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete workspace');
      if (options?.onSuccess) options.onSuccess();
      mutate('/api/workspaces');
    } catch (e) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to delete workspace',
        message: 'Make sure there are no projects in this workspace',
        color: 'red',
      });
    } finally {
      if (options?.onCompleted) options.onCompleted();
    }
  };

  const values = {
    workspaces: data || [],
    isLoading: !error && !data,
    isError: error,

    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
  };

  return (
    <WorkspaceContext.Provider value={values}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspaces = () => {
  const context = useContext(WorkspaceContext);

  if (context === undefined)
    throw new Error(`useWorkspaces() must be used within a WorkspaceProvider.`);

  return context;
};
