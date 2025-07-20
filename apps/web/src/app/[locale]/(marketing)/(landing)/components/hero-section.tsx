'use client';

import { MainDemo } from './main-demo';
import { MainTitle } from './main-title';
import { gsap } from '@tuturuuu/ui/gsap';
import { useEffect, useRef } from 'react';

export function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
      gsap.from('.hero-title-word', {
        y: 80,
        opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: 'back.out(1.4)',
      });

      gsap.from('.hero-subtitle', {
        y: 40,
        opacity: 0,
        duration: 0.8,
        delay: 0.5,
        ease: 'power2.out',
      });

      gsap.from('.hero-cta-button', {
        scale: 0.8,
        opacity: 0,
        duration: 0.6,
        delay: 0.8,
        ease: 'back.out(1.5)',
      });

      gsap.from('.hero-secondary-button', {
        scale: 0.8,
        opacity: 0,
        duration: 0.6,
        delay: 1.0,
        ease: 'back.out(1.5)',
      });

      gsap.from('.hero-features li', {
        x: -20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        delay: 1.2,
        ease: 'power2.out',
      });

      gsap.from('.hero-image-wrapper', {
        y: 50,
        opacity: 0,
        duration: 1,
        delay: 0.3,
        ease: 'power3.out',
      });

      // Floating icons animation
      gsap.to('.floating-icon', {
        y: (i) => (i % 2 === 0 ? -15 : 15),
        x: (i) => (i % 3 === 0 ? 10 : -10),
        duration: 3,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        stagger: 0.3,
      });
    }, sectionRef); // Scope GSAP context to the sectionRef

    return () => {
      ctx.revert(); // Cleanup GSAP animations and ScrollTriggers
    };
  }, []); // Empty dependency array to run once on mount

  return (
    <section
      ref={sectionRef} // Add ref here
      className="relative container min-h-[calc(100vh-3.5rem+53px)] w-full px-0 pt-32 pb-20 md:pt-16 md:pb-32"
    >
      <div className="flex flex-col items-center justify-center gap-12 md:items-start lg:flex-row">
        <MainTitle />
        <MainDemo calendarRef={calendarRef} />
      </div>
    </section>
  );
}
