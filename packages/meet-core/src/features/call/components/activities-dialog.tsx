'use client';

import { LayoutGrid } from '@tuturuuu/icons';
import {
  SatelliteSettingsDialogShell,
  type SettingsDialogShellProps,
  type SettingsNavGroup,
} from '@tuturuuu/ui/custom/satellite-settings-dialog-shell';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useState } from 'react';
import { ALL_ACTIVITIES_TAB, groupActivities } from './activities-catalog';
import {
  ActivityDetailPage,
  AllActivitiesPage,
  type ActivityTile,
} from './activities-pages';

type ShellT = SettingsDialogShellProps['t'];

/**
 * The Activities picker, laid out like Settings: Overview first, then the
 * activities grouped by purpose. Its tab persists in `activitiesTab`, apart
 * from the `settingsTab` that Settings uses. Starting an activity closes the
 * dialog and opens it as its tile always has; pages such as Timer and Room
 * activities render inside the dialog instead.
 */
export function ActivitiesDialog({
  tiles,
  onClose,
  onFeedback,
}: {
  tiles: readonly ActivityTile[];
  onClose: () => void;
  onFeedback?: () => void;
}) {
  const t = useTranslations('meet.call.activities');
  const root = useTranslations();
  const [persistedTab, setPersistedTab] = useQueryState(
    'activitiesTab',
    parseAsString.withOptions({
      history: 'replace',
      shallow: true,
      scroll: false,
    })
  );
  const [tab, setTab] = useState(() => persistedTab ?? ALL_ACTIVITIES_TAB);
  const select = useCallback(
    (next: string) => {
      setTab(next);
      void setPersistedTab(next);
    },
    [setPersistedTab]
  );
  const shellT = useCallback<ShellT>(
    (key, values) => {
      if (key === 'common.settings') return t('title');
      if (key === 'settings.back_to_app') return t('back');
      if (key === 'settings.search_settings_placeholder') return t('search');
      return root(key, values);
    },
    [root, t]
  );
  const navItems: SettingsNavGroup[] = [
    {
      label: t('groups.overview'),
      items: [
        {
          name: ALL_ACTIVITIES_TAB,
          label: t('all'),
          description: t('all_description'),
          icon: LayoutGrid,
        },
      ],
    },
    ...groupActivities(tiles).map(({ group, items }) => ({
      label: t(`groups.${group}`),
      items: items.map((tile) => ({
        name: tile.id,
        label: tile.label,
        description: tile.description,
        icon: tile.icon,
        keywords: tile.description ? [tile.description] : undefined,
      })),
    })),
  ];
  const launch = (tile: ActivityTile) => {
    if (tile.page) {
      select(tile.id);
      return;
    }
    // An activity already open for this person stays open.
    if (!tile.active) tile.open?.();
    onClose();
  };
  const current = tiles.find((tile) => tile.id === tab);
  return (
    <SatelliteSettingsDialogShell
      t={shellT}
      persistedTab={persistedTab}
      setPersistedTab={setPersistedTab}
      onboardingPanel={null}
      showOnboardingGuide={false}
      navItems={navItems}
      activeTab={tab}
      onActiveTabChange={setTab}
      keyboardNavigation
    >
      {!current ? (
        <AllActivitiesPage
          tiles={tiles}
          onLaunch={launch}
          onFeedback={onFeedback}
        />
      ) : current.page ? (
        current.page(onClose)
      ) : (
        <ActivityDetailPage tile={current} onLaunch={launch} />
      )}
    </SatelliteSettingsDialogShell>
  );
}
