'use client';

import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';

type RecentSidebarItemsComponent = ComponentType<{
  enabled?: boolean;
  isCollapsed: boolean;
  links: (NavLink | null)[];
  onNavigate: () => void;
  wsId: string;
}>;

type SidebarActiveTimerComponent = ComponentType<{
  isCollapsed: boolean;
  wsId: string;
}>;

export function useSidebarActiveTimerComponent() {
  const [SidebarActiveTimer, setSidebarActiveTimer] =
    useState<SidebarActiveTimerComponent | null>(null);

  useEffect(() => {
    let active = true;

    void import('./sidebar-active-timer').then((module) => {
      if (active) {
        setSidebarActiveTimer(() => module.SidebarActiveTimer);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return SidebarActiveTimer;
}

export function useRecentSidebarItemsComponent(enabled: boolean) {
  const [RecentSidebarItems, setRecentSidebarItems] =
    useState<RecentSidebarItemsComponent | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRecentSidebarItems(null);
      return;
    }

    let active = true;

    void import('./recent-sidebar-items').then((module) => {
      if (active) {
        setRecentSidebarItems(() => module.RecentSidebarItems);
      }
    });

    return () => {
      active = false;
    };
  }, [enabled]);

  return RecentSidebarItems;
}
