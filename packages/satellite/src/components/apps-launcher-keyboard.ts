import type { LaunchableApp } from '@tuturuuu/utils/launchable-apps';
import { type KeyboardEvent, type RefObject, useState } from 'react';

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

  function moveActiveApp(
    offset: number,
    focus = false,
    fromApp: LaunchableApp | undefined = activeApp
  ) {
    if (navigationApps.length === 0) return;
    const currentIndex = fromApp
      ? navigationApps.findIndex((app) => app.slug === fromApp.slug)
      : 0;
    const nextIndex =
      (currentIndex + offset + navigationApps.length) % navigationApps.length;
    const nextApp = navigationApps[nextIndex];
    if (nextApp) setActiveApp(nextApp, focus);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveActiveApp(1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveActiveApp(-1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const target =
        event.key === 'Home' ? navigationApps[0] : navigationApps.at(-1);
      if (target) setActiveApp(target);
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
    const columnCount =
      window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1;
    const offsets: Partial<Record<string, number>> = {
      ArrowDown: columnCount,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columnCount,
    };
    const offset = offsets[event.key];

    if (offset !== undefined) {
      event.preventDefault();
      moveActiveApp(offset, true, app);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const target =
        event.key === 'Home' ? navigationApps[0] : navigationApps.at(-1);
      if (target) setActiveApp(target, true);
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
