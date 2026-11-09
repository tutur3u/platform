'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Forces an instant scroll-to-top on client-side route changes.
 *
 * Needed because the global `scroll-smooth` on `<html>` causes
 * Next.js's built-in scroll restoration to land at an incorrect
 * offset (equal to `padding-top` of the content container) instead
 * of pixel 0. Using `behavior: 'instant'` overrides the CSS
 * `scroll-behavior: smooth` for navigation transitions only.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [pathname]);

  return null;
}
