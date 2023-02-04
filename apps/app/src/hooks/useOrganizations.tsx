import useSWR, { mutate } from 'swr';

import { createContext, useContext, ReactNode } from 'react';
import { Organization } from '../types/primitives/Organization';
import { useUser } from '@supabase/auth-helpers-react';
import { showNotification } from '@mantine/notifications';

const OrganizationContext = createContext({
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

      if (!res.ok) throw new Error('Failed to create organization');
      if (options?.onSuccess) options.onSuccess();
      mutate('/api/orgs');
    } catch (e: any) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to create organization',
        message: 'Make sure you have permission to create new organizations',
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

      if (!res.ok) throw new Error('Failed to update organization');
      if (options?.onSuccess) options.onSuccess();
      mutate('/api/orgs');
    } catch (e: any) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to update organization',
        message: 'Make sure you have permission to update this organization',
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

      if (!res.ok) throw new Error('Failed to delete organization');
      if (options?.onSuccess) options.onSuccess();
      mutate('/api/orgs');
    } catch (e: any) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to delete organization',
        message: 'Make sure there are no projects in this organization',
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
    <OrganizationContext.Provider value={values}>
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrgs = () => {
  const context = useContext(OrganizationContext);

  if (context === undefined)
    throw new Error(`useOrgs() must be used within a OrganizationProvider.`);

  return context;
};
