'use client';

import { setCookie } from 'cookies-next';
import { useCallback, useEffect, useState } from 'react';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import { SIDEBAR_COOKIE_OPTIONS, useSidebar } from '@/context/sidebar-context';

export function useStructureShellState(defaultCollapsed: boolean) {
  const { behavior, handleBehaviorChange } = useSidebar();
  const [initialized, setInitialized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    setInitialized(true);
  }, []);

  useEffect(() => {
    setIsCollapsed(behavior === 'collapsed' || behavior === 'hover');
  }, [behavior]);

  const handleToggle = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    setCookie(
      SIDEBAR_COLLAPSED_COOKIE_NAME,
      newCollapsed,
      SIDEBAR_COOKIE_OPTIONS
    );

    if (behavior === 'expanded' && newCollapsed) {
      handleBehaviorChange('collapsed');
    } else if (behavior === 'collapsed' && !newCollapsed) {
      handleBehaviorChange('expanded');
    }
  };

  const hasOpenDialogs = useCallback(() => {
    const hasDialogs =
      document.querySelector('[data-state="open"][role="dialog"]') !== null;
    const hasAlertDialogs =
      document.querySelector('[data-state="open"][role="alertdialog"]') !==
      null;
    return hasDialogs || hasAlertDialogs;
  }, []);

  const isHoverMode = behavior === 'hover';
  const onMouseEnter = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) {
          setIsCollapsed(false);
        }
      }
    : undefined;
  const onMouseLeave = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) {
          setIsCollapsed(true);
        }
      }
    : undefined;

  return {
    behavior,
    handleToggle,
    initialized,
    isCollapsed,
    onMouseEnter,
    onMouseLeave,
    setIsCollapsed,
  };
}
