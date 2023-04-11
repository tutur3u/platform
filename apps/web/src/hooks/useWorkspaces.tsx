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
import { Team } from '../types/primitives/Team';
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

  teams: undefined as Team[] | undefined,
  teamsLoading: true,

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

  createTeam: async (
    team: Partial<Team>,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('createTeam', team, options);
  },

  updateTeam: async (
    team: Partial<Team>,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('updateTeam', team, options);
  },

  deleteTeam: async (
    id: string,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    console.log('deleteTeam', id, options);
  },
});

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const user = useUser();

  const { data: workspaces, error: workspacesError } = useSWR<Workspace[]>(
    user ? '/api/workspaces/current' : null
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
      const res = await fetch('/api/workspaces/current');
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

  const { data: teams, error: teamsError } = useSWR<Team[]>(
    ws?.id ? `/api/workspaces/${ws.id}/teams` : null
  );

  const teamsLoading = !teams && !teamsError;

  const createWorkspace = async (
    ws: Workspace,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch('/api/workspaces/current', {
        method: 'POST',
        body: JSON.stringify({
          name: ws?.name || '',
        }),
      });

      if (!res.ok) throw new Error('Failed to create workspace');
      if (options?.onSuccess) options.onSuccess();
      mutate('/api/workspaces/current');
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
      mutate('/api/workspaces/current');
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
      mutate('/api/workspaces/current');
    } catch (e) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to delete workspace',
        message: 'Make sure there are no teams in this workspace',
        color: 'red',
      });
    } finally {
      if (options?.onCompleted) options.onCompleted();
    }
  };

  const createTeam = async (
    team: Partial<Team>,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(team),
      });

      if (!res.ok) throw new Error('Failed to create team');
      if (options?.onSuccess) options.onSuccess();
      mutate(`/api/workspaces/${wsId}/teams`);

      const data = await res.json();
      router.push(`/${wsId}/teams/${data.id}`);
    } catch (e) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to create team',
        message: 'Make sure you have permission to create new teams',
        color: 'red',
      });
    } finally {
      if (options?.onCompleted) options.onCompleted();
    }
  };

  const updateTeam = async (
    team: Partial<Team>,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}/teams/${team.id}`, {
        method: 'PUT',
        body: JSON.stringify(team),
      });

      if (!res.ok) throw new Error('Failed to update team');
      if (options?.onSuccess) options.onSuccess();
      mutate(`/api/workspaces/${wsId}/teams`);
    } catch (e) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to update team',
        message: 'Make sure you have permission to update this team',
        color: 'red',
      });
    } finally {
      if (options?.onCompleted) options.onCompleted();
    }
  };

  const deleteTeam = async (
    teamId: string,
    options?: {
      onSuccess?: () => void;
      onError?: () => void;
      onCompleted?: () => void;
    }
  ) => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}/teams/${teamId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete team');
      if (options?.onSuccess) options.onSuccess();
      mutate(`/api/workspaces/${wsId}/teams`);
    } catch (e) {
      if (options?.onError) options.onError();
      showNotification({
        title: 'Failed to delete team',
        message: 'Make sure there are no teams in this team',
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

    teams,
    teamsLoading,

    createWorkspace,
    updateWorkspace,
    deleteWorkspace,

    createTeam,
    updateTeam,
    deleteTeam,
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
