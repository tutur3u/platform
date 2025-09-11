'use client';

import { useEffect } from 'react';
import FloatingElements from '../floating-elements';
import { BeforeAfterSection } from './components/before-after-section';
import { BenefitsSection } from './components/benefits-section';
import { ComparisonSection } from './components/comparison-section';
import { CtaSection } from './components/cta-section';
import { FeaturesSection } from './components/features-section';
import { HeroSection } from './components/hero-section';
import { IntegrationSection } from './components/integration-section';
import { PricingSection } from './components/pricing-section';
import { ScrollToTop } from './components/scroll-to-top';
import { StatsSection } from './components/stats-section';
import { StrategicSection } from './components/strategic-section';
import { UseCasesSection } from './components/use-cases-section';
import { WorkflowSection } from './components/workflow-section';

export default function MarketingPage() {
  useEffect(() => {
    const loadGsap = async () => {
      try {
        const gsapModule = await import('@tuturuuu/ui/gsap');
        const { gsap, ScrollTrigger } = gsapModule;
        gsap.registerPlugin(ScrollTrigger);
      } catch (error) {
        console.error('Failed to load GSAP:', error);
      }
    };

    loadGsap();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Handle hash navigation after page loads
  useEffect(() => {
    const handleHashNavigation = () => {
      const hash = window.location.hash;
      if (hash) {
        setTimeout(() => {
          const element = document.querySelector(hash);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100); // Small delay to ensure page is rendered
      }
    };

    // Handle initial hash on load
    handleHashNavigation();

    // Handle hash changes (e.g., when clicking links)
    window.addEventListener('hashchange', handleHashNavigation);

    return () => {
      window.removeEventListener('hashchange', handleHashNavigation);
    };
  }, []);

  return (
    <div className="-mt-[53px] relative flex w-screen flex-col items-center overflow-x-hidden p-4 md:p-8 lg:p-16">
      <FloatingElements />
      <HeroSection />
      <StatsSection />
      <FeaturesSection />
      <WorkflowSection />
      <IntegrationSection />
      <StrategicSection />
      <ComparisonSection />
      <BeforeAfterSection />
      <UseCasesSection />
      <BenefitsSection />
      <PricingSection />
      <CtaSection />
      <ScrollToTop />
    </div>
  );
}
