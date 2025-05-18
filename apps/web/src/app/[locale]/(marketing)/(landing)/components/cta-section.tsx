'use client';

import { Button } from '@tuturuuu/ui/button';
import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import { ArrowRight, Calendar, Clock, Sparkles } from '@tuturuuu/ui/icons';
import { useEffect, useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

export function CtaSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    // Animation for the main content
    gsap.from('.cta-content', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '.cta-content',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    // Animation for the buttons with stagger
    gsap.from('.cta-button', {
      y: 20,
      opacity: 0,
      duration: 0.6,
      stagger: 0.2,
      ease: 'back.out(1.5)',
      delay: 0.3,
      scrollTrigger: {
        trigger: '.cta-content',
        start: 'top bottom-=100',
      },
    });

    // Animation for the floating elements
    gsap.to('.floating-element', {
      y: -15,
      duration: 2,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="container relative my-40 w-full overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 via-purple-500 to-blue-500 p-0 md:p-0"
    >
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden opacity-20">
        <div className="absolute left-10 top-10 h-40 w-40 rounded-full bg-white blur-3xl"></div>
        <div className="absolute bottom-20 right-20 h-40 w-40 rounded-full bg-white blur-3xl"></div>
        <div className="absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 transform rounded-full bg-white blur-3xl"></div>
      </div>

      {/* Floating icons */}
      <div className="floating-element absolute left-[10%] top-[20%] flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
        <Calendar className="h-8 w-8 text-white" />
      </div>
      <div
        className="floating-element absolute bottom-[15%] right-[15%] flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm"
        style={{ animationDelay: '0.5s' }}
      >
        <Clock className="h-6 w-6 text-white" />
      </div>
      <div
        className="floating-element absolute right-[25%] top-[25%] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm"
        style={{ animationDelay: '1s' }}
      >
        <Sparkles className="h-5 w-5 text-white" />
      </div>

      <div className="relative z-10 px-6 py-20 md:px-20 md:py-24">
        <div className="cta-content mx-auto max-w-4xl text-center">
          <h2 className="mb-6 text-4xl font-bold text-white md:text-5xl lg:text-6xl">
            Ready to Transform Your Calendar Experience?
          </h2>
          <p className="mb-10 text-xl leading-relaxed text-white/90 md:text-2xl">
            Join thousands of professionals who have reclaimed their time and
            reduced scheduling stress with TuPlan.
          </p>
          <div className="flex flex-col justify-center gap-5 sm:flex-row">
            <Button
              size="lg"
              className="cta-button relative overflow-hidden bg-white px-8 text-lg font-medium text-purple-600 transition-all duration-300 hover:bg-gray-100 hover:shadow-lg hover:shadow-purple-700/20"
            >
              <span className="relative z-10">Get Early Access</span>
              <span className="hover:animate-shimmer absolute inset-0 -z-0 bg-gradient-to-r from-white via-purple-100 to-white bg-[length:200%_100%] opacity-0 transition-opacity duration-300 hover:opacity-100"></span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="cta-button group flex items-center gap-2 border-2 border-white/80 px-8 text-lg font-medium text-white transition-all duration-300 hover:bg-white/10 hover:shadow-lg hover:shadow-purple-700/20"
            >
              Schedule a Demo{' '}
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
          </div>
          <div className="mt-8 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
            <p className="text-lg font-medium text-white">
              Limited spots available for our Q3 2025 early access program.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
