'use client';

import type { WorkspaceProductTier } from '@tuturuuu/types';
import {
  type UseWorkspacePresenceResult,
  useWorkspacePresence,
} from '@tuturuuu/ui/hooks/use-workspace-presence';
import { createContext, type ReactNode, useContext } from 'react';

const REALTIME_LIMITS: Record<
  WorkspaceProductTier,
  { maxPresencePerBoard: number }
> = {
  FREE: { maxPresencePerBoard: 10 },
  PLUS: { maxPresencePerBoard: 50 },
  PRO: { maxPresencePerBoard: 50 },
  ENTERPRISE: { maxPresencePerBoard: 50 },
};

interface WorkspacePresenceContextValue extends UseWorkspacePresenceResult {
  tier: WorkspaceProductTier;
  cursorsEnabled: boolean;
}

const WorkspacePresenceContext =
  createContext<WorkspacePresenceContextValue | null>(null);

interface WorkspacePresenceProviderProps {
  wsId: string;
  tier: WorkspaceProductTier | null;
  enabled?: boolean;
  children: ReactNode;
}

export function WorkspacePresenceProvider({
  wsId,
  tier: tierProp,
  enabled = true,
  children,
}: WorkspacePresenceProviderProps) {
  const tier = tierProp || 'FREE';
  const maxPresencePerBoard = REALTIME_LIMITS[tier]?.maxPresencePerBoard ?? 10;
  const cursorsEnabled = tier !== 'FREE';

  const presenceResult = useWorkspacePresence({
    wsId,
    enabled,
    maxPresencePerBoard,
  });

  const value: WorkspacePresenceContextValue = {
    ...presenceResult,
    tier,
    cursorsEnabled,
  };

  return (
    <WorkspacePresenceContext.Provider value={value}>
      {children}
    </WorkspacePresenceContext.Provider>
  );
}

export function useWorkspacePresenceContext(): WorkspacePresenceContextValue {
  const context = useContext(WorkspacePresenceContext);
  if (!context) {
    throw new Error(
      'useWorkspacePresenceContext must be used within a WorkspacePresenceProvider'
    );
  }
  return context;
}

/**
 * Safe version that returns null outside provider (for optional usage).
 */
export function useOptionalWorkspacePresenceContext(): WorkspacePresenceContextValue | null {
  return useContext(WorkspacePresenceContext);
}
