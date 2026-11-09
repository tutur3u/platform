'use client';

import { useQuery } from '@tanstack/react-query';
import { Save, Undo2 } from '@tuturuuu/icons';
import { getCurrentUserHiveAccess } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionFooter,
} from '@tuturuuu/ui/custom/settings-section';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useUserBooleanConfig } from '@/hooks/use-user-config';
import { SIDEBAR_RECENT_NAVIGATION_ENABLED_CONFIG_ID } from '../../app/[locale]/(dashboard)/[wsId]/sidebar-navigation-preferences';
import type { LayoutScope } from './sidebar-navigation-layout-settings.types';
import { createSidebarNavigationItemDefinitions } from './sidebar-navigation-layout-settings-items';
import { SidebarNavigationLayoutSection } from './sidebar-navigation-layout-settings-section';
import { useSidebarNavigationLayoutSettings } from './use-sidebar-navigation-layout-settings';

export function SidebarRecentNavigationSetting() {
  const t = useTranslations('settings.preferences.sidebar_layout');
  const {
    value: recentNavigationEnabled,
    setValue: setRecentNavigationEnabled,
    isLoading: isRecentNavigationLoading,
  } = useUserBooleanConfig(SIDEBAR_RECENT_NAVIGATION_ENABLED_CONFIG_ID, false);

  return (
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
  );
}

export function SidebarNavigationLayoutSettings({ wsId }: { wsId?: string }) {
  const t = useTranslations('settings.preferences.sidebar_layout');
  const tCommon = useTranslations('common');
  const tSections = useTranslations('sidebar_sections');
  const [scope, setScope] = useState<LayoutScope>(
    wsId ? 'workspace' : 'account'
  );
  const { data: hiveAccess } = useQuery({
    queryKey: ['current-user', 'hive-access'],
    queryFn: () => getCurrentUserHiveAccess(),
  });
  const items = useMemo(
    () =>
      createSidebarNavigationItemDefinitions(t, tSections, {
        includeHive: hiveAccess?.hasAccess === true,
      }),
    [hiveAccess?.hasAccess, t, tSections]
  );
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
    <SettingsSection title={t('title')} description={t('description')}>
      <SettingsSectionBlock className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
        <Tabs
          value={scope}
          onValueChange={(value) => setScope(value as LayoutScope)}
        >
          <TabsList>
            <TabsTrigger value="account">{t('account_scope')}</TabsTrigger>
            {wsId && (
              <TabsTrigger value="workspace">
                {t('workspace_scope')}
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
        <span className="text-muted-foreground text-sm">
          {scope === 'workspace' && !sourceValue
            ? t('using_account_default')
            : t('editing_scope')}
        </span>
      </SettingsSectionBlock>

      <SettingsSectionBlock className="@container">
        <div className="grid @2xl:grid-cols-2 gap-6">
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
      </SettingsSectionBlock>

      {hiddenItems.length > 0 && (
        <SettingsSectionBlock>
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
        </SettingsSectionBlock>
      )}

      <SettingsSectionFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => resetMutation.mutate()}
          disabled={isLoading || resetMutation.isPending}
        >
          <Undo2 className="h-4 w-4" />
          {scope === 'workspace' ? t('reset_workspace') : t('reset_account')}
        </Button>
        <Button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={isLoading || !isDirty || saveMutation.isPending}
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? tCommon('saving') : tCommon('save_changes')}
        </Button>
      </SettingsSectionFooter>
    </SettingsSection>
  );
}
