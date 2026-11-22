'use client';

import { useLayoutEffect } from 'react';
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
export function SorbetRouteScope() {
  useLayoutEffect(() => {
    const root = document.documentElement;
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
      if (readStoredSorbetUi() === false) {
        root.removeAttribute(SORBET_UI_ATTRIBUTE);
      }
    };
  }, []);

  return null;
}
