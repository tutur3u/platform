'use client';

import { Save, Undo2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useUserBooleanConfig } from '@/hooks/use-user-config';
import { SIDEBAR_RECENT_NAVIGATION_ENABLED_CONFIG_ID } from '../../app/[locale]/(dashboard)/[wsId]/sidebar-navigation-preferences';
import type { LayoutScope } from './sidebar-navigation-layout-settings.types';
import { createSidebarNavigationItemDefinitions } from './sidebar-navigation-layout-settings-items';
import { SidebarNavigationLayoutSection } from './sidebar-navigation-layout-settings-section';
import { useSidebarNavigationLayoutSettings } from './use-sidebar-navigation-layout-settings';

export function SidebarNavigationLayoutSettings({ wsId }: { wsId?: string }) {
  const t = useTranslations('settings.preferences.sidebar_layout');
  const tCommon = useTranslations('common');
  const tSections = useTranslations('sidebar_sections');
  const [scope, setScope] = useState<LayoutScope>(
    wsId ? 'workspace' : 'account'
  );
  const items = useMemo(
    () => createSidebarNavigationItemDefinitions(t, tSections),
    [t, tSections]
  );
  const {
    value: recentNavigationEnabled,
    setValue: setRecentNavigationEnabled,
    isLoading: isRecentNavigationLoading,
  } = useUserBooleanConfig(SIDEBAR_RECENT_NAVIGATION_ENABLED_CONFIG_ID, false);
  const {
    handleDragEnd,
    hiddenItems,
    isDirty,
    isLoading,
    moreItems,
    moveWithin,
    resetMutation,
    rootItems,
    saveMutation,
    setPlacement,
    sourceValue,
    toggleHidden,
  } = useSidebarNavigationLayoutSettings({
    items,
    messages: {
      resetError: t('reset_error'),
      resetSuccess: t('reset_success'),
      saveError: t('save_error'),
      saveSuccess: t('save_success'),
    },
    scope,
    wsId,
  });
  const labels = {
    drag: (item: string) => t('drag_item', { item }),
    hide: (item: string) => t('hide_item', { item }),
    locked: t('locked'),
    moveDown: (item: string) => t('move_down', { item }),
    moveToMore: t('move_to_more'),
    moveToRoot: t('move_to_root'),
    moveUp: (item: string) => t('move_up', { item }),
    show: (item: string) => t('show_item', { item }),
  };

  return (
    <div className="space-y-8">
      <SettingItemTab
        title={t('recent_title')}
        description={t('recent_description')}
      >
        <Switch
          checked={recentNavigationEnabled}
          onCheckedChange={setRecentNavigationEnabled}
          disabled={isRecentNavigationLoading}
        />
      </SettingItemTab>

      <Separator />

      <SettingItemTab title={t('title')} description={t('description')}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={scope === 'account' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setScope('account')}
            >
              {t('account_scope')}
            </Button>
            {wsId && (
              <Button
                type="button"
                variant={scope === 'workspace' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setScope('workspace')}
              >
                {t('workspace_scope')}
              </Button>
            )}
            <span className="text-muted-foreground text-xs">
              {scope === 'workspace' && !sourceValue
                ? t('using_account_default')
                : t('editing_scope')}
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SidebarNavigationLayoutSection
              emptyLabel={t('empty_section')}
              itemCountLabel={t('item_count', { count: rootItems.length })}
              items={rootItems}
              labels={labels}
              onDragEnd={handleDragEnd('root')}
              onHideToggle={toggleHidden}
              onMoveDown={(id) => moveWithin('root', id, 1)}
              onMoveToOtherSection={(id) => setPlacement(id, 'more')}
              onMoveUp={(id) => moveWithin('root', id, -1)}
              placement="root"
              title={t('root_title')}
            />
            <SidebarNavigationLayoutSection
              emptyLabel={t('empty_section')}
              itemCountLabel={t('item_count', { count: moreItems.length })}
              items={moreItems}
              labels={labels}
              onDragEnd={handleDragEnd('more')}
              onHideToggle={toggleHidden}
              onMoveDown={(id) => moveWithin('more', id, 1)}
              onMoveToOtherSection={(id) => setPlacement(id, 'root')}
              onMoveUp={(id) => moveWithin('more', id, -1)}
              placement="more"
              showSectionLabels
              title={t('more_title')}
            />
          </div>

          {hiddenItems.length > 0 && (
            <SidebarNavigationLayoutSection
              emptyLabel={t('empty_section')}
              hidden
              items={hiddenItems}
              labels={labels}
              onHideToggle={toggleHidden}
              onMoveDown={() => undefined}
              onMoveToOtherSection={() => undefined}
              onMoveUp={() => undefined}
              placement="more"
              showSectionLabels
              title={t('hidden_title')}
            />
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={isLoading || !isDirty || saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending
                ? tCommon('saving')
                : tCommon('save_changes')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => resetMutation.mutate()}
              disabled={isLoading || resetMutation.isPending}
            >
              <Undo2 className="h-4 w-4" />
              {scope === 'workspace'
                ? t('reset_workspace')
                : t('reset_account')}
            </Button>
          </div>
        </div>
      </SettingItemTab>
    </div>
  );
}
