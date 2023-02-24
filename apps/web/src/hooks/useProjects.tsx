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
import { useWorkspaces } from './useWorkspaces';
import { useRouter } from 'next/router';
import { Workspace } from '../types/primitives/Workspace';
import { User } from '../types/primitives/User';

const ProjectContext = createContext({
  wsId: '',
  ws: {} as Workspace,
  isWsLoading: true,

  members: [] as User[],
  isMembersLoading: true,

  projects: undefined as Project[] | undefined,
  isProjectsLoading: true,

  setWsId: (wsId: string) => {
    console.log('setWsId', wsId);
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

  const { workspaces } = useWorkspaces();
  const [wsId, setWsId] = useState<string>('');

  useEffect(() => {
    if (!workspaces?.current || workspaces.current.length === 0) {
      setWsId('');
      return;
    }

    const wsId = workspaces.current[0].id;
    setWsId((prevId) => (prevId === wsId ? prevId : wsId));
  }, [workspaces]);

  const { data: ws, error: wsError } = useSWR(
    wsId ? `/api/workspaces/${wsId}` : null
  );

  const isWsLoading = !ws && !wsError;

  const { data: projects, error: projectsError } = useSWR<Project[]>(
    wsId ? `/api/workspaces/${wsId}/projects` : null
  );

  const isProjectsLoading = !projects && !projectsError;

  const { data: membersData, error: membersError } = useSWR(
    wsId ? `/api/workspaces/${wsId}/members` : null
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
      const res = await fetch(`/api/workspaces/${wsId}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(project),
      });

      if (!res.ok) throw new Error('Failed to create project');
      if (options?.onSuccess) options.onSuccess();
      mutate(`/api/workspaces/${wsId}/projects`);

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
      mutate(`/api/workspaces/${wsId}/projects`);
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
      mutate(`/api/workspaces/${wsId}/projects`);
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
    wsId,
    ws: ws || {},
    isWsLoading,

    members: membersData?.members || [],
    isMembersLoading,

    projects: projects || [],
    isProjectsLoading,

    setWsId,
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
