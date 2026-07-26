'use client';

import type { WorkspaceProductTier } from '@tuturuuu/types';
import {
  type UseWorkspacePresenceResult,
  useWorkspacePresence,
} from '@tuturuuu/ui/hooks/use-workspace-presence';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

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
  /** Whether realtime features (Yjs sync, presence avatars) are enabled - true for all tiers */
  realtimeEnabled: boolean;
}

const WorkspacePresenceContext =
  createContext<WorkspacePresenceContextValue | null>(null);

interface WorkspacePresenceProviderProps {
  wsId: string;
  tier: WorkspaceProductTier | null;
  enabled?: boolean;
  /**
   * Re-provide the surrounding presence context instead of opening a channel of
   * this provider's own.
   *
   * Lets a caller keep this provider mounted at a fixed spot in the tree while it
   * decides whether the subtree needs its own workspace channel. Mounting or
   * unmounting a provider around live UI remounts that UI — the task dialog used
   * to tear itself down and rebuild for exactly this reason — so the provider
   * stays put and changes mode instead.
   *
   * Falls back to owning a channel when there is no surrounding context to
   * inherit.
   */
  inherit?: boolean;
  children: ReactNode;
}

export function WorkspacePresenceProvider({
  wsId,
  tier: tierProp,
  enabled = true,
  inherit = false,
  children,
}: WorkspacePresenceProviderProps) {
  const parentContext = useOptionalWorkspacePresenceContext();
  const shouldInherit = inherit && parentContext !== null;
  const tier = tierProp || 'FREE';
  const maxPresencePerBoard = REALTIME_LIMITS[tier]?.maxPresencePerBoard ?? 10;
  const cursorsEnabled = DEV_MODE || tier !== 'FREE';
  // Only one channel at a time: while inheriting, this provider stays idle and
  // the surrounding one keeps serving the subtree.
  const ownChannelEnabled = enabled && !shouldInherit;
  // realtimeEnabled: Yjs sync and presence avatars available for ALL tiers (when provider is enabled)
  const realtimeEnabled = ownChannelEnabled;

  const presenceResult = useWorkspacePresence({
    wsId,
    enabled: ownChannelEnabled,
    maxPresencePerBoard,
  });

  const ownValue = useMemo<WorkspacePresenceContextValue>(
    () => ({
      ...presenceResult,
      tier,
      cursorsEnabled,
      realtimeEnabled,
    }),
    [presenceResult, tier, cursorsEnabled, realtimeEnabled]
  );

  const value = shouldInherit ? parentContext : ownValue;

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
