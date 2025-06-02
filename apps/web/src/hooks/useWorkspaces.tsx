'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Workspace } from '@tuturuuu/types/db';
import { Team } from '@tuturuuu/types/primitives/Team';
import { useRouter } from 'next/router';
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import useSWR, { mutate } from 'swr';

const WorkspaceContext = createContext({
  workspaces: undefined as Workspace[] | undefined,
  workspacesLoading: true,

  ws: undefined as Workspace | undefined,
  wsId: null as string | null,
  wsLoading: true,

  workspaceInvites: undefined as Workspace[] | undefined,
  workspaceInvitesLoading: true,

  teams: undefined as Team[] | undefined,
  teamsLoading: true,
});

export const WorkspaceProvider = async ({
  children,
}: {
  children: ReactNode;
}) => {
  const router = useRouter();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: workspaces, error: workspacesError } = useSWR<Workspace[]>(
    user ? '/api/workspaces/current' : null
  );

  const workspacesLoading = !workspaces && !workspacesError;

  const [wsId, setWsId] = useState<string | null>(null);

  const { wsId: freshWsId } = router.query;

  useEffect(() => {
    if (wsId) return;

    if (!workspaces || workspacesError || workspaces.length === 0) {
      setWsId(null);
      return;
    }

    setWsId(freshWsId?.toString() ?? workspaces?.[0]?.id ?? null);
  }, [freshWsId, workspaces, workspacesError, wsId]);

  useEffect(() => {
    if (user && !wsId) mutate('/api/workspaces/current');
  }, [user, wsId]);

  const ws = workspaces?.find((ws) => ws.id === wsId);

  const { data: workspaceInvites, error: workspaceInvitesError } = useSWR<
    Workspace[]
  >(user ? '/api/workspaces/invites' : null);

  const workspaceInvitesLoading = !workspaceInvites && !workspaceInvitesError;

  const { data: teams, error: teamsError } = useSWR<Team[]>(
    ws?.id ? `/api/workspaces/${ws.id}/teams` : null
  );

  const teamsLoading = !teams && !teamsError;

  const values = {
    workspaces,
    workspacesLoading,

    ws,
    wsId,
    wsLoading: workspacesLoading,

    workspaceInvites,
    workspaceInvitesLoading,

    teams,
    teamsLoading,
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
