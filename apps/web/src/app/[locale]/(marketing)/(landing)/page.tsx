import { DeferredLandingSections } from '@/components/landing/deferred-landing-sections';
import { FeaturesBento } from '@/components/landing/features/features-bento';
import { HeroSection } from '@/components/landing/hero/hero-section';

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

      <DeferredLandingSections />
    </main>
  );
}
