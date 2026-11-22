'use client';

import { useEffect, useLayoutEffect } from 'react';
import {
  readStoredSorbetUi,
  SORBET_UI_ATTRIBUTE,
  SORBET_UI_VALUE,
} from './sorbet-ui';

/**
 * Renders the routes below it (such as the sign-in pages) in Sorbet for every
 * visitor, including a device that opted out. It only sets the attribute on
 * `<html>` while mounted and never writes the stored or account preference;
 * on unmount the device's own choice applies again. The pre-paint script
 * already applies Sorbet unless this device opted out, so only that case
 * switches after hydration.
 */
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function SorbetRouteScope() {
  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute(SORBET_UI_ATTRIBUTE);
    const ensure = () => {
      if (root.getAttribute(SORBET_UI_ATTRIBUTE) !== SORBET_UI_VALUE) {
        root.setAttribute(SORBET_UI_ATTRIBUTE, SORBET_UI_VALUE);
      }
    };
    ensure();
    // An account sync that applies an opt-out keeps its stored value but
    // does not repaint these routes.
    const observer = new MutationObserver(ensure);
    observer.observe(root, {
      attributeFilter: [SORBET_UI_ATTRIBUTE],
      attributes: true,
    });
    return () => {
      observer.disconnect();
      const stored = readStoredSorbetUi();
      // Without a stored choice (for example blocked storage), restore what
      // the page had before these routes mounted.
      const restore =
        stored === false ? null : stored === null ? previous : SORBET_UI_VALUE;
      if (restore === null) {
        root.removeAttribute(SORBET_UI_ATTRIBUTE);
      } else {
        root.setAttribute(SORBET_UI_ATTRIBUTE, restore);
      }
    };
  }, []);

  return null;
}
