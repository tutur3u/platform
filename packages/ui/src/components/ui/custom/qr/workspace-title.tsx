'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@tuturuuu/utils/format';
import { useParams } from 'next/navigation';

interface Workspace {
  id: string;
  name: string;
  personal?: boolean;
}

async function fetchWorkspaces(signal?: AbortSignal): Promise<Workspace[]> {
  try {
    const response = await fetch('/api/v1/workspaces', { signal });
    if (!response.ok) {
      throw new Error('Failed to fetch workspaces');
    }
    return response.json();
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    return [];
  }
}

export function QRWorkspaceTitle({ className }: { className?: string }) {
  const { wsId } = useParams<{ wsId?: string | string[] }>();
  const wsIdString = Array.isArray(wsId) ? wsId[0] : wsId;

  const { data: currentWorkspace } = useQuery({
    queryKey: ['workspaces'],
    queryFn: ({ signal }) => fetchWorkspaces(signal),
    enabled: !!wsIdString,
    select: (data) => data.find((ws) => ws.id === wsIdString),
  });

  // If not in a workspace context or no workspace data, return empty
  if (!wsIdString || !currentWorkspace) {
    return null;
  }

  return (
    <div className={cn('text-center font-bold text-2xl uppercase', className)}>
      {currentWorkspace?.name}
    </div>
  );
}
