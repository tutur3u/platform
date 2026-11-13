'use client';
import { lazy, Suspense, useEffect, useState } from 'react';
const Toaster = lazy(() =>
  import('@tuturuuu/ui/sonner').then((module) => ({ default: module.Toaster }))
);

export function LandingEnhancements({ landing }: { landing: boolean }) {
  const [ready, setReady] = useState(!landing);
  useEffect(() => {
    if (!landing) return;
    const links = document.querySelectorAll<HTMLLinkElement>(
      'link[data-landing-complete]'
    );
    const reveal = (event: Event) => {
      (event.currentTarget as HTMLLinkElement).media = 'all';
    };
    const loadStyles = () =>
      links.forEach((link) => {
        if (link.dataset.href) link.href = link.dataset.href;
        if (link.sheet) link.media = 'all';
        else link.addEventListener('load', reveal);
      });
    if (document.readyState === 'complete') loadStyles();
    else window.addEventListener('load', loadStyles, { once: true });
    const timer = window.setTimeout(() => setReady(true), 1500);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('load', loadStyles);
      links.forEach((link) => link.removeEventListener('load', reveal));
    };
  }, [landing]);
  return ready || !landing ? (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  ) : null;
}
