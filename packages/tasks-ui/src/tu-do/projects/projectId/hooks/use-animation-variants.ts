'use client';

import { useEffect, useMemo, useState } from 'react';

export function useAnimationVariants() {
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    checkMobile();
    window.addEventListener('resize', checkMobile);

    const handleChange = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      window.removeEventListener('resize', checkMobile);
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const shouldReduceMotion = isMobile || prefersReducedMotion;

  const fadeInUpVariant = useMemo(
    () =>
      (delay = 0) => ({
        initial: {
          opacity: shouldReduceMotion ? 1 : 0,
          y: shouldReduceMotion ? 0 : 20,
        },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: shouldReduceMotion ? 0 : 0.6,
          delay: shouldReduceMotion ? 0 : delay,
        },
      }),
    [shouldReduceMotion]
  );

  const fadeInViewVariant = useMemo(
    () =>
      (delay = 0) => ({
        initial: {
          opacity: shouldReduceMotion ? 1 : 0,
          y: shouldReduceMotion ? 0 : 30,
        },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: shouldReduceMotion ? '0px' : '-50px' },
        transition: {
          duration: shouldReduceMotion ? 0 : 0.6,
          delay: shouldReduceMotion ? 0 : delay,
        },
      }),
    [shouldReduceMotion]
  );

  return {
    isMobile,
    shouldReduceMotion,
    fadeInUpVariant,
    fadeInViewVariant,
  };
}
