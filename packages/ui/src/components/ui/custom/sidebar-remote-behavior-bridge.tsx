'use client';

import {
  useUpdateUserConfig,
  useUserConfig,
} from '@tuturuuu/ui/hooks/use-user-config';
import { useEffect, useRef } from 'react';
import type { SidebarBehavior } from './sidebar-context';

const SIDEBAR_BEHAVIOR_CONFIG_KEY = 'SIDEBAR_BEHAVIOR';
const RECENT_LOCAL_BEHAVIOR_GRACE_MS = 5 * 60 * 1000;

const isValidBehavior = (value: string | undefined): value is SidebarBehavior =>
  value === 'expanded' ||
  value === 'collapsed' ||
  value === 'hover' ||
  value === 'hidden';

interface SidebarRemoteBehaviorBridgeProps {
  behavior: SidebarBehavior;
  behaviorUpdatedAt: number | null;
  localOverride: boolean;
  localOverrideVersion: number;
  onApplyRemoteBehavior: (newBehavior: SidebarBehavior) => void;
  onRemoteBehaviorAvailable: (remoteBehavior: SidebarBehavior) => void;
  userChangeVersion: number;
}

export function SidebarRemoteBehaviorBridge({
  behavior,
  behaviorUpdatedAt,
  localOverride,
  localOverrideVersion,
  onApplyRemoteBehavior,
  onRemoteBehaviorAvailable,
  userChangeVersion,
}: SidebarRemoteBehaviorBridgeProps) {
  const { data: remoteBehavior, isSuccess: remoteLoaded } = useUserConfig(
    SIDEBAR_BEHAVIOR_CONFIG_KEY,
    'expanded'
  );
  const updateConfig = useUpdateUserConfig();
  const hasAppliedRemote = useRef(false);
  const persistedUserChangeVersion = useRef(0);
  const handledLocalOverrideVersion = useRef(0);

  const hasRecentLocalBehavior =
    typeof behaviorUpdatedAt === 'number' &&
    Number.isFinite(behaviorUpdatedAt) &&
    Date.now() - behaviorUpdatedAt >= 0 &&
    Date.now() - behaviorUpdatedAt <= RECENT_LOCAL_BEHAVIOR_GRACE_MS;

  useEffect(() => {
    if (!remoteLoaded || !isValidBehavior(remoteBehavior)) return;

    onRemoteBehaviorAvailable(remoteBehavior);
  }, [onRemoteBehaviorAvailable, remoteBehavior, remoteLoaded]);

  useEffect(() => {
    if (
      !remoteLoaded ||
      localOverride ||
      hasAppliedRemote.current ||
      userChangeVersion > 0 ||
      !isValidBehavior(remoteBehavior)
    ) {
      return;
    }

    hasAppliedRemote.current = true;

    if (remoteBehavior === behavior) return;

    if (hasRecentLocalBehavior) {
      updateConfig.mutate({
        configId: SIDEBAR_BEHAVIOR_CONFIG_KEY,
        value: behavior,
      });
      return;
    }

    onApplyRemoteBehavior(remoteBehavior);
  }, [
    behavior,
    hasRecentLocalBehavior,
    localOverride,
    onApplyRemoteBehavior,
    remoteBehavior,
    remoteLoaded,
    updateConfig,
    userChangeVersion,
  ]);

  useEffect(() => {
    if (
      !remoteLoaded ||
      localOverride ||
      userChangeVersion === 0 ||
      persistedUserChangeVersion.current === userChangeVersion
    ) {
      return;
    }

    persistedUserChangeVersion.current = userChangeVersion;
    updateConfig.mutate({
      configId: SIDEBAR_BEHAVIOR_CONFIG_KEY,
      value: behavior,
    });
  }, [behavior, localOverride, remoteLoaded, updateConfig, userChangeVersion]);

  useEffect(() => {
    if (
      !remoteLoaded ||
      localOverrideVersion === 0 ||
      handledLocalOverrideVersion.current === localOverrideVersion
    ) {
      return;
    }

    handledLocalOverrideVersion.current = localOverrideVersion;

    if (localOverride) {
      updateConfig.mutate({
        configId: SIDEBAR_BEHAVIOR_CONFIG_KEY,
        value: behavior,
      });
      return;
    }

    if (isValidBehavior(remoteBehavior)) {
      onApplyRemoteBehavior(remoteBehavior);
    }
  }, [
    behavior,
    localOverride,
    localOverrideVersion,
    onApplyRemoteBehavior,
    remoteBehavior,
    remoteLoaded,
    updateConfig,
  ]);

  return null;
}
