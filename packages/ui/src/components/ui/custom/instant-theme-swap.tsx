'use client';

import { useEffect } from 'react';

const THEME_CLASSES = ['light', 'dark'] as const;
const NO_TRANSITIONS_CSS =
  '*,*::before,*::after{-webkit-transition:none!important;transition:none!important}';
const COLOR_PROPERTY = /(^|-)color$|^(fill|stroke|box-shadow|background)$/;

type ThemeClass = (typeof THEME_CLASSES)[number];

function themeClassOf(root: Element): ThemeClass | null {
  for (const name of THEME_CLASSES) {
    if (root.classList.contains(name)) return name;
  }
  return null;
}

/**
 * Applies a pending theme class change in a single frame.
 *
 * Styles are flushed while every transition is disabled, so the new theme
 * colors become the starting values instead of transition targets. Removing
 * the rule afterwards changes no animatable value, so nothing starts.
 *
 * Side effect: per the CSS Transitions spec, flushing with `transition:none`
 * also cancels any transition already in flight (a sidebar collapse, a hover
 * fade), which jumps to its end state at the moment of the theme switch.
 *
 * next-themes' `disableTransitionOnChange` cannot be relied on: it calls
 * `getComputedStyle(document.body)` without reading a property, which does
 * not flush styles in Chromium, and the swap still animates hundreds of
 * elements for 300-500ms.
 *
 * Pass the request CSP nonce so the rule still applies if `style-src` is
 * ever enforced without `'unsafe-inline'`.
 */
export function suppressThemeTransitions(doc: Document, nonce?: string): void {
  const style = doc.createElement('style');
  style.setAttribute('data-instant-theme-swap', '');
  if (nonce) style.nonce = nonce;
  style.appendChild(doc.createTextNode(NO_TRANSITIONS_CSS));
  doc.head.appendChild(style);
  // Reading a computed value forces a document-wide style flush.
  void doc.defaultView?.getComputedStyle(doc.documentElement).color;
  style.remove();

  // Safety net for transitions the flush could not cancel (e.g. ones set by
  // `!important` inline styles): jump color transitions to their end.
  const animations =
    typeof doc.getAnimations === 'function' ? doc.getAnimations() : [];
  for (const animation of animations) {
    const property = (animation as Animation & { transitionProperty?: string })
      .transitionProperty;
    if (property && COLOR_PROPERTY.test(property)) animation.finish();
  }
}

/**
 * Watches `<html>` for light/dark class changes (from the menu, another tab
 * through the `storage` event, or the OS preference) and makes each one an
 * instant swap. Returns a disposer.
 */
export function installInstantThemeSwap(
  root: HTMLElement = document.documentElement,
  { nonce }: { nonce?: string } = {}
): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  let current = themeClassOf(root);
  const observer = new MutationObserver(() => {
    const next = themeClassOf(root);
    if (next === current) return;
    current = next;
    suppressThemeTransitions(root.ownerDocument, nonce);
  });
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

/** Render once inside each app's theme provider. */
export function InstantThemeSwap({ nonce }: { nonce?: string } = {}) {
  useEffect(
    () => installInstantThemeSwap(document.documentElement, { nonce }),
    [nonce]
  );
  return null;
}
