'use client';

import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type {
  HeatmapSettings,
  HeatmapViewMode,
} from '@/components/settings/time-tracker/heatmap-display-settings';
import type { OnboardingState } from '../types';

interface UseHeatmapOnboardingResult {
  shouldShowOnboardingTips: boolean;
  onboardingState: OnboardingState;
  handleDismissTips: () => void;
}

export function useHeatmapOnboarding(
  settings: HeatmapSettings
): UseHeatmapOnboardingResult {
  const currentViewMode = settings.viewMode ?? ('original' as HeatmapViewMode);

  const [onboardingState, setOnboardingState, isOnboardingStateInitialized] =
    useLocalStorage<OnboardingState>('time-tracker-onboarding', {
      showTips: true,
      dismissedAt: null,
      viewCount: 0,
      lastViewMode: currentViewMode,
    });

  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevViewModeRef = useRef(onboardingState.lastViewMode);

  const shouldShowOnboardingTips = useMemo<boolean>(() => {
    if (!isOnboardingStateInitialized) return false;
    if (!settings.showOnboardingTips) return false;

    const isNewUser = onboardingState.viewCount < 3;
    const changedViewMode = onboardingState.lastViewMode !== settings.viewMode;

    let isPeriodicReminder = false;
    if (onboardingState.viewCount >= 10 && onboardingState.dismissedAt) {
      isPeriodicReminder =
        Math.floor(
          (Date.now() - new Date(onboardingState.dismissedAt).getTime()) /
            (1000 * 60 * 60 * 24)
        ) >= 14;
    }

    if (isPeriodicReminder) {
      return true;
    }

    if (!onboardingState.showTips) {
      return false;
    }

    return Boolean(isNewUser || changedViewMode);
  }, [
    isOnboardingStateInitialized,
    settings.showOnboardingTips,
    settings.viewMode,
    onboardingState.showTips,
    onboardingState.viewCount,
    onboardingState.lastViewMode,
    onboardingState.dismissedAt,
  ]);

  useEffect(() => {
    if (isOnboardingStateInitialized) {
      prevViewModeRef.current = onboardingState.lastViewMode;
    }
  }, [isOnboardingStateInitialized, onboardingState.lastViewMode]);

  useEffect(() => {
    if (!isOnboardingStateInitialized) return;

    if (settings.viewMode !== prevViewModeRef.current) {
      prevViewModeRef.current = settings.viewMode;
      setOnboardingState((prev) => ({
        ...prev,
        viewCount: prev.viewCount + 1,
        lastViewMode: settings.viewMode,
        showTips: true,
        dismissedAt: null,
      }));
    }
  }, [isOnboardingStateInitialized, settings.viewMode, setOnboardingState]);

  const handleDismissTips = useCallback(() => {
    setOnboardingState((prev) => ({
      ...prev,
      showTips: false,
      dismissedAt: new Date().toISOString(),
    }));

    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, [setOnboardingState]);

  useEffect(() => {
    if (
      isOnboardingStateInitialized &&
      shouldShowOnboardingTips &&
      onboardingState.viewCount >= 5
    ) {
      autoHideTimerRef.current = setTimeout(() => {
        handleDismissTips();
      }, 45000);

      return () => {
        if (autoHideTimerRef.current) {
          clearTimeout(autoHideTimerRef.current);
          autoHideTimerRef.current = null;
        }
      };
    }

    return;
  }, [
    isOnboardingStateInitialized,
    shouldShowOnboardingTips,
    onboardingState.viewCount,
    handleDismissTips,
  ]);

  useEffect(
    () => () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    },
    []
  );

  return { shouldShowOnboardingTips, onboardingState, handleDismissTips };
}
