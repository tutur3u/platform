'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';
import {
  TeachFeatureGrid,
  TeachFooter,
  TeachHero,
  TeachNav,
  TeachWorkLoop,
} from './teach-home-sections';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function TeachHome() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      gsap.from('[data-teach-nav], [data-teach-word], [data-teach-panel]', {
        autoAlpha: 0,
        duration: 0.75,
        ease: 'power3.out',
        stagger: 0.05,
        y: 28,
      });
      gsap.from('[data-teach-card]', {
        autoAlpha: 0,
        duration: 0.65,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: {
          end: 'bottom 30%',
          scrub: 0.6,
          start: 'top 82%',
          trigger: '[data-teach-bento]',
        },
        y: 38,
      });
      ScrollTrigger.create({
        end: 'bottom 70%',
        pin: '[data-teach-pin]',
        pinSpacing: false,
        start: 'top 18%',
        trigger: '[data-teach-loop]',
      });
    },
    { scope: rootRef }
  );

  return (
    <main
      ref={rootRef}
      className="min-h-screen w-full max-w-full overflow-x-hidden bg-root-background text-foreground"
    >
      <TeachNav />
      <TeachHero />
      <TeachFeatureGrid />
      <TeachWorkLoop />
      <TeachFooter />
    </main>
  );
}
