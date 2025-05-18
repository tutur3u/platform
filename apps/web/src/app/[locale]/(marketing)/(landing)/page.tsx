'use client';

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
import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import { useEffect } from 'react';

export default function MarketingPage() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <div
      className="relative -mt-[53px] flex w-full flex-col items-center"
      suppressHydrationWarning
    >
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
      {/* <TestimonialsSection /> */}
      <PricingSection />
      <CtaSection />
      <ScrollToTop />
    </div>
  );
}
