import type { LaunchableApp } from '@tuturuuu/utils/launchable-apps';
import { type KeyboardEvent, type RefObject, useEffect, useState } from 'react';

type GridNavigationKey =
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'End'
  | 'Home';

function getGridRows(apps: readonly LaunchableApp[], columnCount: number) {
  const rows: LaunchableApp[][] = [];
  let categoryApps: LaunchableApp[] = [];

  for (const app of apps) {
    if (categoryApps.length > 0 && categoryApps[0]?.category !== app.category) {
      for (let index = 0; index < categoryApps.length; index += columnCount) {
        rows.push(categoryApps.slice(index, index + columnCount));
      }
      categoryApps = [];
    }
    categoryApps.push(app);
  }

  for (let index = 0; index < categoryApps.length; index += columnCount) {
    rows.push(categoryApps.slice(index, index + columnCount));
  }

  return rows;
}

export function getAppsLauncherGridTarget({
  apps,
  columnCount,
  currentApp,
  key,
}: {
  apps: readonly LaunchableApp[];
  columnCount: number;
  currentApp: LaunchableApp | undefined;
  key: GridNavigationKey;
}) {
  if (apps.length === 0) return undefined;
  if (key === 'Home') return apps[0];
  if (key === 'End') return apps.at(-1);

  const currentIndex = currentApp
    ? apps.findIndex((app) => app.slug === currentApp.slug)
    : 0;

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const offset = key === 'ArrowLeft' ? -1 : 1;
    return apps[(currentIndex + offset + apps.length) % apps.length];
  }

  const rows = getGridRows(apps, columnCount);
  const rowIndex = rows.findIndex((row) =>
    row.some((app) => app.slug === currentApp?.slug)
  );
  const safeRowIndex = rowIndex === -1 ? 0 : rowIndex;
  const columnIndex = Math.max(
    0,
    rows[safeRowIndex]?.findIndex((app) => app.slug === currentApp?.slug) ?? 0
  );
  const rowOffset = key === 'ArrowUp' ? -1 : 1;
  const targetRow =
    rows[(safeRowIndex + rowOffset + rows.length) % rows.length];

  return targetRow?.[Math.min(columnIndex, targetRow.length - 1)];
}

export function useAppsLauncherShortcut(onOpen: () => void) {
  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.key.toLocaleLowerCase() === 'k' &&
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }
    };

    document.addEventListener('keydown', handleShortcut, { capture: true });
    return () =>
      document.removeEventListener('keydown', handleShortcut, {
        capture: true,
      });
  }, [onOpen]);
}

export function useAppsLauncherKeyboard({
  contentRef,
  navigationApps,
  rankedApps,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
  navigationApps: readonly LaunchableApp[];
  rankedApps: readonly LaunchableApp[];
}) {
  const [activeAppSlug, setActiveAppSlug] = useState<string | null>(null);
  const activeApp =
    rankedApps.find((app) => app.slug === activeAppSlug) ?? rankedApps[0];

  function setActiveApp(app: LaunchableApp, focus = false) {
    setActiveAppSlug(app.slug);
    const element = contentRef.current?.querySelector<HTMLElement>(
      `#apps-launcher-app-${app.slug}`
    );
    element?.scrollIntoView?.({ block: 'nearest' });
    if (focus) element?.focus();
  }

  function getColumnCount() {
    return window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1;
  }

  function navigate(key: GridNavigationKey, focus: boolean, app = activeApp) {
    const target = getAppsLauncherGridTarget({
      apps: navigationApps,
      columnCount: getColumnCount(),
      currentApp: app,
      key,
    });
    if (target) setActiveApp(target, focus);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      navigate(event.key, false);
    } else if (event.key === 'Enter' && activeApp) {
      event.preventDefault();
      contentRef.current
        ?.querySelector<HTMLElement>(`#apps-launcher-app-${activeApp.slug}`)
        ?.click();
    }
  }

  function handleAppKeyDown(
    event: KeyboardEvent<HTMLAnchorElement>,
    app: LaunchableApp
  ) {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'Home' ||
      event.key === 'End'
    ) {
      event.preventDefault();
      navigate(event.key, true, app);
    }
  }

  return {
    activeApp,
    handleAppKeyDown,
    handleSearchKeyDown,
    resetActiveApp: () => setActiveAppSlug(null),
    setActiveApp,
  };
}
