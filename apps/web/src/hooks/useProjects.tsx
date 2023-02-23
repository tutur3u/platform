import useSWR, { mutate } from 'swr';

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from 'react';
import { Project } from '../types/primitives/Project';
import { showNotification } from '@mantine/notifications';
import { useOrgs } from './useOrganizations';
import { useRouter } from 'next/router';
import { Organization } from '../types/primitives/Organization';
import { User } from '../types/primitives/User';

const ProjectContext = createContext({
  orgId: '',
  org: {} as Organization,
  isOrgLoading: true,

  members: [] as User[],
  isMembersLoading: true,

  projects: undefined as Project[] | undefined,
  isProjectsLoading: true,

  setOrgId: (orgId: string) => {
    console.log('setOrgId', orgId);
  },

  createProject: async (
    project: Partial<Project>,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('createProject', project, options);
  },
  updateProject: async (
    project: Partial<Project>,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('updateProject', project, options);
  },
  deleteProject: async (
    id: string,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('deleteProject', id, options);
  },
});

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();

  const { orgs } = useOrgs();
  const [orgId, setOrgId] = useState<string>('');

  useEffect(() => {
    if (!orgs?.current || orgs.current.length === 0) {
      setOrgId('');
      return;
    }

    const orgId = orgs.current[0].id;
    setOrgId((prevId) => (prevId === orgId ? prevId : orgId));
  }, [orgs]);

  const { data: org, error: orgError } = useSWR(
    orgId ? `/api/orgs/${orgId}` : null
  );

  const isOrgLoading = !org && !orgError;

  const { data: projects, error: projectsError } = useSWR<Project[]>(
    orgId ? `/api/orgs/${orgId}/projects` : null
  );

  const isProjectsLoading = !projects && !projectsError;

  const { data: membersData, error: membersError } = useSWR(
    orgId ? `/api/orgs/${orgId}/members` : null
  );

  const isMembersLoading = !membersData && !membersError;

  const createProject = async (
    project: Partial<Project>,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(project),
      });

      if (!res.ok) throw new Error('Failed to create project');
      if (options?.onSuccess) options.onSuccess();
      mutate(`/api/orgs/${orgId}/projects`);

      const data = await res.json();
      router.push(`/projects/${data.id}`);
    } catch (e: any) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to create project',
        message: 'Make sure you have permission to create new projects',
        color: 'red',
      });
    } finally {
      if (options?.onCompleted) options.onCompleted();
    }
  };

  const updateProject = async (
    project: Partial<Project>,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        body: JSON.stringify(project),
      });

      if (!res.ok) throw new Error('Failed to update project');
      if (options?.onSuccess) options.onSuccess();
      mutate(`/api/orgs/${orgId}/projects`);
    } catch (e: any) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to update project',
        message: 'Make sure you have permission to update this project',
        color: 'red',
      });
    } finally {
      if (options?.onCompleted) options.onCompleted();
    }
  };

  const deleteProject = async (
    projectId: string,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete project');
      if (options?.onSuccess) options.onSuccess();
      mutate(`/api/orgs/${orgId}/projects`);
    } catch (e: any) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to delete project',
        message: 'Make sure there are no projects in this project',
        color: 'red',
      });
    } finally {
      if (options?.onCompleted) options.onCompleted();
    }
  };

  const values = {
    orgId,
    org: org || {},
    isOrgLoading,

    members: membersData?.members || [],
    isMembersLoading,

    projects: projects || [],
    isProjectsLoading,

    setOrgId,
    createProject,
    updateProject,
    deleteProject,
  };

  return (
    <ProjectContext.Provider value={values}>{children}</ProjectContext.Provider>
  );
};

export const useProjects = () => {
  const context = useContext(ProjectContext);

  if (context === undefined)
    throw new Error(`useProjects() must be used within a ProjectProvider.`);

  return context;
};
