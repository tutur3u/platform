'use client';

import dynamic from 'next/dynamic';

// Dynamic imports for better performance
const HeroSection = dynamic(() => import('./components/HeroSection'), {
  ssr: true,
});
const ProblemSection = dynamic(() => import('./components/ProblemSection'), {
  ssr: true,
});
const FeaturesSection = dynamic(() => import('./components/FeaturesSection'), {
  ssr: true,
});
const TechnologySection = dynamic(
  () => import('./components/TechnologySection'),
  {
    ssr: true,
  }
);
const RoadmapSection = dynamic(() => import('./components/RoadmapSection'), {
  ssr: true,
});
const TeamSection = dynamic(() => import('./components/TeamSection'), {
  ssr: true,
});
const CTASection = dynamic(() => import('./components/CTASection'), {
  ssr: true,
});

// Dynamically import HeroAnimation with no SSR to prevent hydration issues
const HeroAnimation = dynamic(() => import('./hero-animation'), {
  ssr: false,
});

export default function MarketingPage() {
  return (
    <>
      <HeroAnimation />
      <div className="relative flex h-full w-full flex-col items-center will-change-transform">
        <HeroSection />
        <ProblemSection />
        <FeaturesSection />
        <TechnologySection />
        <RoadmapSection />
        <TeamSection />
        <CTASection />
      </div>
    </>
  );
}
