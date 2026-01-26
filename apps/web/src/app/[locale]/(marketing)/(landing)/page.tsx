'use client';

import { AISection } from '@/components/landing/ai/ai-section';
import { CTASection } from '@/components/landing/cta/cta-section';
import { DemoSection } from '@/components/landing/demo/demo-section';
import { FeaturesBento } from '@/components/landing/features/features-bento';
import { HeroSection } from '@/components/landing/hero/hero-section';
import { PricingSection } from '@/components/landing/pricing/pricing-section';
import { GithubStats } from '@/components/landing/social-proof/github-stats';

export default function MarketingPage() {
  return (
    <main className="relative mx-auto w-full -translate-y-14 overflow-x-hidden">
      {/* Subtle Background Pattern */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--foreground)/0.015)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground)/0.015)_1px,transparent_1px)] bg-[size:6rem_6rem]" />
      </div>

      {/* Hero */}
      <HeroSection />

      {/* Features Bento Grid */}
      <FeaturesBento />

      {/* Interactive Demo */}
      <DemoSection />

      {/* Pricing */}
      <PricingSection />

      {/* AI Section */}
      <AISection />

      {/* Social Proof */}
      <GithubStats />

      {/* CTA */}
      <CTASection />
    </main>
  );
}
