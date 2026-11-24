'use client';
import { useEffect } from 'react';
import {
  describeClick,
  type EndedTrigger,
  redactRoute,
} from '../lib/ended-navigation-breadcrumb';

type NavigateEvent = Event & {
  destination?: { url?: string };
  navigationType?: string;
  userInitiated?: boolean;
  downloadRequest?: string | null;
};

/**
 * Logs what is about to leave the ended screen: the last click target, the
 * Navigation API's destination when the browser has it, and pagehide /
 * beforeunload with the route. Console only, no identifiers, so an E2E run
 * that captures the console can attribute an unexpected navigation.
 */
export function useEndedNavigationBreadcrumb(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const origin = window.location.origin;
    const startedAt = Date.now();
    let lastClick: EndedTrigger | null = null;
    const log = (event: string, detail: Record<string, unknown>) => {
      try {
        console.warn('Meet ended screen navigation', {
          event,
          route: redactRoute(window.location.href, origin),
          visibility: document.visibilityState,
          msSinceEnded: Date.now() - startedAt,
          lastClick,
          ...detail,
        });
      } catch {
        /* Diagnostics never affect the page. */
      }
    };
    const onClick = (event: MouseEvent) => {
      lastClick = describeClick(event.target, origin);
    };
    const onNavigate = (event: Event) => {
      const navigate = event as NavigateEvent;
      log('navigate', {
        type: navigate.navigationType,
        destination: navigate.destination?.url
          ? redactRoute(navigate.destination.url, origin)
          : undefined,
        userInitiated: navigate.userInitiated,
        download: !!navigate.downloadRequest,
      });
    };
    const onPageHide = (event: PageTransitionEvent) =>
      log('pagehide', { persisted: event.persisted });
    const onBeforeUnload = () => log('beforeunload', {});
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    document.addEventListener('click', onClick, true);
    navigation?.addEventListener('navigate', onNavigate);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      navigation?.removeEventListener('navigate', onNavigate);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [active]);
}
