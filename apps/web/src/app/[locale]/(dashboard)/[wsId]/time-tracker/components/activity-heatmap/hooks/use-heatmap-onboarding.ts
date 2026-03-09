'use client';

import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const VIEW_CHANGE_TIP_TIMEOUT_MS = 12_000;
  const currentViewMode = settings.viewMode ?? ('original' as HeatmapViewMode);

  const [onboardingState, setOnboardingState, isOnboardingStateInitialized] =
    useLocalStorage<OnboardingState>('time-tracker-onboarding', {
      showTips: true,
      dismissedAt: null,
      viewCount: 0,
      lastViewMode: currentViewMode,
    });

  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevViewModeRef = useRef(currentViewMode);
  const [justChangedView, setJustChangedView] = useState(false);

  const shouldShowOnboardingTips = useMemo<boolean>(() => {
    if (!isOnboardingStateInitialized) return false;
    if (!settings.showOnboardingTips) return false;

    const isNewUser = onboardingState.viewCount < 3;

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

    return Boolean(isNewUser || justChangedView);
  }, [
    isOnboardingStateInitialized,
    settings.showOnboardingTips,
    justChangedView,
    onboardingState.showTips,
    onboardingState.viewCount,
    onboardingState.dismissedAt,
  ]);

  useEffect(() => {
    if (!isOnboardingStateInitialized) return;

    if (settings.viewMode !== prevViewModeRef.current) {
      prevViewModeRef.current = settings.viewMode;
      setJustChangedView(true);

      if (viewChangeTimerRef.current) {
        clearTimeout(viewChangeTimerRef.current);
      }

      viewChangeTimerRef.current = setTimeout(() => {
        setJustChangedView(false);
        viewChangeTimerRef.current = null;
      }, VIEW_CHANGE_TIP_TIMEOUT_MS);

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
    setJustChangedView(false);
    setOnboardingState((prev) => ({
      ...prev,
      showTips: false,
      dismissedAt: new Date().toISOString(),
    }));

    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }

    if (viewChangeTimerRef.current) {
      clearTimeout(viewChangeTimerRef.current);
      viewChangeTimerRef.current = null;
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

      if (viewChangeTimerRef.current) {
        clearTimeout(viewChangeTimerRef.current);
      }
    },
    []
  );

  return { shouldShowOnboardingTips, onboardingState, handleDismissTips };
}
