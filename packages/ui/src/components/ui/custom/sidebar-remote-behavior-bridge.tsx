'use client';

import {
  useUpdateUserConfig,
  useUserConfig,
} from '@tuturuuu/ui/hooks/use-user-config';
import { useEffect, useRef } from 'react';

type SidebarBehavior = 'expanded' | 'collapsed' | 'hover';

const SIDEBAR_BEHAVIOR_CONFIG_KEY = 'SIDEBAR_BEHAVIOR';

const isValidBehavior = (value: string | undefined): value is SidebarBehavior =>
  value === 'expanded' || value === 'collapsed' || value === 'hover';

interface SidebarRemoteBehaviorBridgeProps {
  behavior: SidebarBehavior;
  localOverride: boolean;
  localOverrideVersion: number;
  onApplyRemoteBehavior: (newBehavior: SidebarBehavior) => void;
  onRemoteBehaviorAvailable: (remoteBehavior: SidebarBehavior) => void;
  userChangeVersion: number;
}

export function SidebarRemoteBehaviorBridge({
  behavior,
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

    if (remoteBehavior !== behavior) {
      onApplyRemoteBehavior(remoteBehavior);
    }
  }, [
    behavior,
    localOverride,
    onApplyRemoteBehavior,
    remoteBehavior,
    remoteLoaded,
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
