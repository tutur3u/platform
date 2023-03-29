import useSWR, { mutate } from 'swr';

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from 'react';
import { Workspace } from '../types/primitives/Workspace';
import { useUser } from '@supabase/auth-helpers-react';
import { showNotification } from '@mantine/notifications';
import { useRouter } from 'next/router';
import { Project } from '../types/primitives/Project';
import { User } from '../types/primitives/User';

const WorkspaceContext = createContext({
  workspaces: undefined as Workspace[] | undefined,
  workspacesLoading: true,

  ws: undefined as Workspace | undefined,
  wsLoading: true,

  workspaceInvites: undefined as Workspace[] | undefined,
  workspaceInvitesLoading: true,

  members: undefined as User[] | undefined,
  membersLoading: true,

  memberInvites: undefined as User[] | undefined,
  memberInvitesLoading: true,

  projects: undefined as Project[] | undefined,
  projectsLoading: true,

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

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const user = useUser();

  const { data: workspaces, error: workspacesError } = useSWR<Workspace[]>(
    user ? '/api/workspaces' : null
  );

  const workspacesLoading = !workspaces && !workspacesError;

  const [cachedWsId, setCachedWsId] = useState<string | null>(null);
  const { wsId: freshWsId } = router.query;

  const wsId = freshWsId ?? cachedWsId;

  const validWsId = typeof wsId === 'string' && wsId.length > 0;

  const { data: ws, error: wsError } = useSWR<Workspace>(
    validWsId ? `/api/workspaces/${wsId}` : null
  );

  const wsLoading = !ws && !wsError;

  useEffect(() => {
    if (typeof freshWsId === 'string') setCachedWsId(freshWsId);
  }, [freshWsId]);

  useEffect(() => {
    const updateWsId = async () => {
      const res = await fetch('/api/workspaces');
      const data = await res.json();

      setCachedWsId(data?.current?.[0]?.id);
    };

    if (!freshWsId && !cachedWsId) updateWsId();
  }, [freshWsId, cachedWsId]);

  const { data: workspaceInvites, error: workspaceInvitesError } = useSWR<
    Workspace[]
  >(user ? '/api/workspaces/invites' : null);

  const workspaceInvitesLoading = !workspaceInvites && !workspaceInvitesError;

  const { data: members, error: membersError } = useSWR<User[]>(
    ws?.id ? `/api/workspaces/${ws.id}/members` : null
  );

  const { data: memberInvites, error: memberInvitesError } = useSWR<User[]>(
    ws?.id ? `/api/workspaces/${ws.id}/members/invites` : null
  );

  const memberInvitesLoading = !memberInvites && !memberInvitesError;

  const membersLoading = !members && !membersError;

  const { data: projects, error: projectsError } = useSWR<Project[]>(
    ws?.id ? `/api/workspaces/${ws.id}/projects` : null
  );

  const projectsLoading = !projects && !projectsError;

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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
    workspaces,
    workspacesLoading,

    ws,
    wsLoading,

    workspaceInvites,
    workspaceInvitesLoading,

    members,
    membersLoading,

    memberInvites,
    memberInvitesLoading,

    projects,
    projectsLoading,

    createWorkspace,
    updateWorkspace,
    deleteWorkspace,

    createProject,
    updateProject,
    deleteProject,
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
