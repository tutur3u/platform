import useSWR from 'swr';

import { createContext, useContext, ReactNode } from 'react';
import { Organization } from '../types/primitives/Organization';

const OrganizationContext = createContext({
  orgs: {} as {
    current: Organization[];
    invited: Organization[];
  },
  isLoading: true,
  isError: false,

  createOrg: async (org: Organization) => {
    console.log('createOrg', org);
  },
  updateOrg: async (org: Organization) => {
    console.log('updateOrg', org);
  },
  deleteOrg: async (id: string) => {
    console.log('deleteOrg', id);
  },
});

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const { data, error, mutate } = useSWR('/api/orgs');

  const createOrg = async (org: Organization) => {
    const res = await fetch('/api/orgs', {
      method: 'POST',
      body: JSON.stringify({
        name: org.name,
      }),
    });

    if (!res.ok) throw new Error('Failed to create org');
    mutate((orgs: Organization[]) => [...orgs, org]);
  };

  const updateOrg = async (org: Organization) => {
    const res = await fetch(`/api/orgs/${org.id}`, {
      method: 'PUT',
      body: JSON.stringify(org),
    });

    if (!res.ok) throw new Error('Failed to update org');
    mutate((orgs: Organization[]) => {
      const index = orgs.findIndex((o) => o.id === org.id);
      orgs[index] = org;
      return orgs;
    });
  };

  const deleteOrg = async (orgId: string) => {
    const res = await fetch(`/api/orgs/${orgId}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error('Failed to delete org');
    mutate((orgs: Organization[]) => orgs.filter((org) => org.id !== orgId));
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
