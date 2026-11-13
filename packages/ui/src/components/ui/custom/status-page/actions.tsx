'use client';

import type { MouseEvent, ReactNode } from 'react';

/**
 * Back link: a real `href`, so it works before hydration, without JS and when
 * the page was opened directly. Once hydrated, a click with history to return
 * to uses `history.back()` instead.
 */
export function StatusBackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (window.history.length <= 1) return;
    event.preventDefault();
    window.history.back();
  };

  return (
    <a className="ttr-sp__btn" data-action="back" href={href} onClick={onClick}>
      {children}
    </a>
  );
}

/** Calls the framework's reset/retry for the failed segment. */
export function StatusRetryButton({
  onRetry,
  children,
}: {
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="ttr-sp__btn"
      data-action="retry"
      data-primary=""
      onClick={() => onRetry()}
      type="button"
    >
      {children}
    </button>
  );
}
