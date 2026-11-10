'use client';

import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getUserConfig,
  getUserWorkspaceConfig,
  updateUserConfig,
  updateUserWorkspaceConfig,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useEffect, useMemo, useState } from 'react';
import {
  SETTINGS_NAVIGATION_ID,
  SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID,
  type SidebarNavigationPlacement,
  serializeSidebarNavigationLayoutConfig,
} from '../../app/[locale]/(dashboard)/[wsId]/sidebar-navigation-preferences';
import type {
  LayoutScope,
  NavigationItemDefinition,
} from './sidebar-navigation-layout-settings.types';
import {
  getConfigItems,
  getHiddenItems,
  hydrateConfig,
  keepLockedItemsFirst,
  moveId,
} from './sidebar-navigation-layout-settings-utils';

function insertRootNavigationId(rootIds: string[], id: string) {
  const withoutId = rootIds.filter((rootId) => rootId !== id);

  if (id === SETTINGS_NAVIGATION_ID) {
    return [...withoutId, id];
  }

  const settingsIndex = withoutId.indexOf(SETTINGS_NAVIGATION_ID);
  if (settingsIndex < 0) {
    return [...withoutId, id];
  }

  return [
    ...withoutId.slice(0, settingsIndex),
    id,
    ...withoutId.slice(settingsIndex),
  ];
}

export function useSidebarNavigationLayoutSettings({
  items,
  messages,
  scope,
  wsId,
}: {
  items: NavigationItemDefinition[];
  messages: {
    resetError: string;
    resetSuccess: string;
    saveError: string;
    saveSuccess: string;
  };
  scope: LayoutScope;
  wsId?: string;
}) {
  const queryClient = useQueryClient();
  const definitionById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const { data: accountValue, isLoading: isAccountLoading } = useQuery({
    queryKey: ['user-config', SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID],
    queryFn: async () => {
      const response = await getUserConfig(SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID);
      return response.value;
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: workspaceValue, isLoading: isWorkspaceLoading } = useQuery({
    queryKey: [
      'user-workspace-config',
      wsId,
      SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID,
    ],
    queryFn: async () => {
      if (!wsId) return null;
      const response = await getUserWorkspaceConfig(
        wsId,
        SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID
      );
      return response.value;
    },
    enabled: Boolean(wsId),
    staleTime: 5 * 60 * 1000,
  });

  const sourceValue = scope === 'workspace' ? workspaceValue : accountValue;
  const fallbackValue =
    scope === 'workspace' ? (workspaceValue ?? accountValue) : accountValue;
  const [draftConfig, setDraftConfig] = useState(() =>
    hydrateConfig(items, fallbackValue)
  );

  useEffect(() => {
    setDraftConfig(hydrateConfig(items, fallbackValue));
  }, [fallbackValue, items]);

  const invalidateNavigationQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ['user-config', SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID],
    });
    if (wsId) {
      void queryClient.invalidateQueries({
        queryKey: [
          'user-workspace-config',
          wsId,
          SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID,
        ],
      });
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const value = serializeSidebarNavigationLayoutConfig(draftConfig);
      if (scope === 'workspace') {
        if (!wsId) throw new Error('Workspace ID is required');
        return updateUserWorkspaceConfig(
          wsId,
          SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID,
          value
        );
      }

      return updateUserConfig(SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID, value);
    },
    onSuccess: () => {
      invalidateNavigationQueries();
      toast.success(messages.saveSuccess);
    },
    onError: () => toast.error(messages.saveError),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (scope === 'workspace') {
        if (!wsId) throw new Error('Workspace ID is required');
        return updateUserWorkspaceConfig(
          wsId,
          SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID,
          null
        );
      }

      return updateUserConfig(SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID, null);
    },
    onSuccess: () => {
      invalidateNavigationQueries();
      toast.success(messages.resetSuccess);
    },
    onError: () => toast.error(messages.resetError),
  });

  const savedConfig = hydrateConfig(items, fallbackValue);
  const isDirty =
    serializeSidebarNavigationLayoutConfig(draftConfig) !==
    serializeSidebarNavigationLayoutConfig(savedConfig);

  const setPlacement = (id: string, placement: SidebarNavigationPlacement) => {
    if (definitionById.get(id)?.locked) return;

    setDraftConfig((current) => ({
      hidden: current.hidden.filter((hiddenId) => hiddenId !== id),
      more:
        placement === 'more'
          ? [...current.more.filter((itemId) => itemId !== id), id]
          : current.more.filter((itemId) => itemId !== id),
      root:
        placement === 'root'
          ? keepLockedItemsFirst(
              insertRootNavigationId(current.root, id),
              definitionById
            )
          : current.root.filter((itemId) => itemId !== id),
    }));
  };

  const toggleHidden = (id: string) => {
    if (definitionById.get(id)?.locked) return;

    setDraftConfig((current) => ({
      ...current,
      hidden: current.hidden.includes(id)
        ? current.hidden.filter((hiddenId) => hiddenId !== id)
        : [...current.hidden, id],
    }));
  };

  const moveWithin = (
    placement: SidebarNavigationPlacement,
    id: string,
    direction: -1 | 1
  ) => {
    if (definitionById.get(id)?.locked) return;

    setDraftConfig((current) => ({
      ...current,
      [placement]: keepLockedItemsFirst(
        moveId(current[placement], id, direction),
        definitionById
      ),
    }));
  };

  const handleDragEnd =
    (placement: SidebarNavigationPlacement) => (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over?.id ? String(event.over.id) : null;
      if (!overId || activeId === overId) return;

      setDraftConfig((current) => {
        const ids = current[placement];
        const oldIndex = ids.indexOf(activeId);
        const newIndex = ids.indexOf(overId);

        if (
          oldIndex < 0 ||
          newIndex < 0 ||
          definitionById.get(activeId)?.locked ||
          definitionById.get(overId)?.locked
        ) {
          return current;
        }

        return {
          ...current,
          [placement]: keepLockedItemsFirst(
            arrayMove(ids, oldIndex, newIndex),
            definitionById
          ),
        };
      });
    };

  return {
    handleDragEnd,
    hiddenItems: getHiddenItems(draftConfig, items),
    isDirty,
    isLoading:
      isAccountLoading || (scope === 'workspace' && isWorkspaceLoading),
    moreItems: getConfigItems(draftConfig, items, 'more'),
    moveWithin,
    resetMutation,
    rootItems: getConfigItems(draftConfig, items, 'root'),
    saveMutation,
    setPlacement,
    sourceValue,
    toggleHidden,
  };
}
