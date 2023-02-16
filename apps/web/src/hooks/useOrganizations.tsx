import useSWR, { mutate } from 'swr';

import { createContext, useContext, ReactNode } from 'react';
import { Organization } from '../types/primitives/Organization';
import { useUser } from '@supabase/auth-helpers-react';
import { showNotification } from '@mantine/notifications';

const WorkspaceContext = createContext({
  orgs: {} as {
    current: Organization[];
    invited: Organization[];
  },
  isLoading: true,
  isError: false,

  createOrg: async (
    org: Organization,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('createOrg', org, options);
  },
  updateOrg: async (
    org: Organization,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('updateOrg', org, options);
  },
  deleteOrg: async (
    id: string,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('deleteOrg', id, options);
  },
});

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const user = useUser();
  const { data, error } = useSWR(user ? '/api/orgs' : null);

  const createOrg = async (
    org: Organization,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch('/api/orgs', {
        method: 'POST',
        body: JSON.stringify({
          name: org?.name || '',
        }),
      });

      if (!res.ok) throw new Error('Failed to create workspace');
      if (options?.onSuccess) options.onSuccess();
      mutate('/api/orgs');
    } catch (e: any) {
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

  const updateOrg = async (
    org: Organization,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch(`/api/orgs/${org.id}`, {
        method: 'PUT',
        body: JSON.stringify(org),
      });

      if (!res.ok) throw new Error('Failed to update workspace');
      if (options?.onSuccess) options.onSuccess();
      mutate('/api/orgs');
    } catch (e: any) {
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

  const deleteOrg = async (
    orgId: string,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch(`/api/orgs/${orgId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete workspace');
      if (options?.onSuccess) options.onSuccess();
      mutate('/api/orgs');
    } catch (e: any) {
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
    orgs: data || [],
    isLoading: !error && !data,
    isError: error,

    createOrg,
    updateOrg,
    deleteOrg,
  };

  return (
    <WorkspaceContext.Provider value={values}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useOrgs = () => {
  const context = useContext(WorkspaceContext);

  if (context === undefined)
    throw new Error(`useOrgs() must be used within a WorkspaceProvider.`);

  return context;
};
