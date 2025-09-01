'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@tuturuuu/utils/format';
import { useParams } from 'next/navigation';

interface Workspace {
  id: string;
  name: string;
  personal?: boolean;
}

async function fetchWorkspaces(): Promise<Workspace[]> {
  try {
    const response = await fetch('/api/v1/workspaces');
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
  const params = useParams();
  const wsId = params.wsId as string | undefined;

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
    enabled: !!wsId,
  });

  // Find the current workspace
  const currentWorkspace = workspaces?.find((ws) => ws.id === wsId);

  // If not in a workspace context or no workspace data, return empty
  if (!wsId || !currentWorkspace) {
    return null;
  }

  return (
    <div className={cn('font-bold text-2xl uppercase', className)}>
      {currentWorkspace.name}
    </div>
  );
}
