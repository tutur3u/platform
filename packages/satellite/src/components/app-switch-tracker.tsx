'use client';

import {
  APP_SWITCH_COOKIE,
  type AppSwitchSample,
  clearAppSwitchStart,
  mountedAppForPath,
  parseAppSwitchStart,
  resolveTopology,
  resolveUrlApp,
  serializeAppSwitchStart,
} from '@tuturuuu/utils/app-switch-rum';
import { getLaunchableAppByHostname } from '@tuturuuu/utils/launchable-apps';
import { useEffect } from 'react';

/** Destinations whose Worker accepts beacons at `<mount>/_rum`. */
const BEACON_APPS = new Set(['meet', 'mail']);
const SAMPLE_RATE = 0.1;
const HANDOFF_KEY = 'ttr_switch_handoff';
const AUTH_PATH = /\/(?:verify-token|login)(?:\/|$)/u;

function cookieDomain() {
  const { hostname } = window.location;
  if (hostname === 'tuturuuu.com' || hostname.endsWith('.tuturuuu.com'))
    return '.tuturuuu.com';
  return undefined;
}

function appForHostname(hostname: string) {
  return getLaunchableAppByHostname(hostname)?.slug ?? null;
}

function markSwitchOnLinkClick(currentApp: string, event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return;
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return;
  let destination: URL;
  try {
    destination = new URL(anchor.href, window.location.href);
  } catch {
    return;
  }
  const to = resolveUrlApp(destination, appForHostname);
  if (!to || to === currentApp) return;
  const cookie = serializeAppSwitchStart(currentApp, Date.now(), {
    domain: cookieDomain(),
    secure: window.location.protocol === 'https:',
  });
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is missing in Safari and Firefox, and this short-lived marker must work in every browser.
  if (cookie) document.cookie = cookie;
}

function navigationTiming() {
  // `activationStart` (prerender) is not in every TypeScript DOM lib yet.
  const entry = performance.getEntriesByType('navigation')[0] as
    | (PerformanceNavigationTiming & { activationStart?: number })
    | undefined;
  const connection = (
    navigator as Navigator & { connection?: { effectiveType?: string } }
  ).connection;
  return {
    protocol: entry?.nextHopProtocol ?? '',
    connectMs: entry ? Math.max(0, entry.connectEnd - entry.connectStart) : 0,
    prerendered: (entry?.activationStart ?? 0) > 0,
    effectiveType: connection?.effectiveType ?? '',
  };
}

function reportAppReady(currentApp: string) {
  const { pathname } = window.location;
  if (AUTH_PATH.test(pathname)) {
    // The sign-in handoff is part of this switch; report on the next page.
    sessionStorage.setItem(HANDOFF_KEY, '1');
    return;
  }
  const start = parseAppSwitchStart(document.cookie, Date.now());
  if (!start) return;
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is missing in Safari and Firefox, and this short-lived marker must work in every browser.
  document.cookie = clearAppSwitchStart({ domain: cookieDomain() });
  const handoff = sessionStorage.getItem(HANDOFF_KEY) === '1';
  sessionStorage.removeItem(HANDOFF_KEY);
  if (start.from === currentApp || !BEACON_APPS.has(currentApp)) return;
  performance.mark('ttr:app-ready');
  if (Math.random() >= SAMPLE_RATE) return;
  const sample: AppSwitchSample = {
    from: start.from,
    to: currentApp,
    topology: resolveTopology(new URL(window.location.href)),
    durationMs: Date.now() - start.epochMs,
    handoff,
    ...navigationTiming(),
  };
  const mount =
    mountedAppForPath(pathname) === currentApp ? `/${currentApp}` : '';
  navigator.sendBeacon?.(
    `${mount}/_rum`,
    new Blob([JSON.stringify(sample)], { type: 'application/json' })
  );
}

/**
 * Records app switches for the one-origin rollout metrics. As a source it
 * marks clicks on links to another app; as a Meet or Mail destination it
 * reports the elapsed time once the shell has painted. No identifiers are
 * sent. Renders nothing.
 */
export function AppSwitchTracker({ currentApp }: { currentApp: string }) {
  useEffect(() => {
    const onClick = (event: MouseEvent) =>
      markSwitchOnLinkClick(currentApp, event);
    document.addEventListener('click', onClick, { capture: true });
    let frame = 0;
    const ready = () => {
      // Two frames: after the first post-hydration paint.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => reportAppReady(currentApp));
      });
    };
    const prerendering = (document as Document & { prerendering?: boolean })
      .prerendering;
    if (prerendering)
      document.addEventListener('prerenderingchange', ready, { once: true });
    else if (document.cookie.includes(`${APP_SWITCH_COOKIE}=`)) ready();
    return () => {
      document.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('prerenderingchange', ready);
      cancelAnimationFrame(frame);
    };
  }, [currentApp]);
  return null;
}
