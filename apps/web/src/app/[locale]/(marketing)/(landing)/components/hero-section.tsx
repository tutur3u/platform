'use client';

import { MainDemo } from './main-demo';
import { MainTitle } from './main-title';
import { gsap } from '@tuturuuu/ui/gsap';
import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

export function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    const tl = gsap.timeline();

    tl.from('.hero-text', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
      ease: 'power3.out',
    })
      .from(
        '.hero-button',
        {
          y: 20,
          opacity: 0,
          duration: 0.5,
          stagger: 0.1,
          ease: 'power3.out',
        },
        '-=0.4'
      )
      .from(
        '.hero-badge',
        {
          scale: 0.8,
          opacity: 0,
          duration: 0.5,
          stagger: 0.1,
          ease: 'back.out(1.7)',
        },
        '-=0.4'
      );
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative min-h-[calc(100vh-3.5rem+53px)] w-full"
    >
      <section ref={sectionRef} className="pb-20 pt-32 md:pb-32 md:pt-40">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-start gap-12 lg:flex-row">
            <MainTitle />
            <MainDemo calendarRef={calendarRef} />
          </div>
        </div>
      </section>
    </motion.div>
  );
}
