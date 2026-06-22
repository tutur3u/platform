import type { Locale } from '../../lib/platform/locale';
import { getLandingContent } from './landing-content';
import {
  AiSection,
  CtaSection,
  PricingSection,
  SocialProofSection,
} from './landing-conversion-sections';
import { LandingHero } from './landing-hero';
import {
  DemoSection,
  FeaturesSection,
  ProblemSection,
} from './landing-product-sections';

export function LandingPage({ locale }: Readonly<{ locale: Locale }>) {
  const content = getLandingContent(locale);

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--foreground)/0.015)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground)/0.015)_1px,transparent_1px)] bg-[size:6rem_6rem]" />
      </div>

      <LandingHero content={content.hero} />
      <ProblemSection content={content.problem} />
      <FeaturesSection content={content.features} />
      <DemoSection content={content.demo} />
      <AiSection content={content.ai} />
      <PricingSection content={content.pricing} />
      <SocialProofSection content={content.socialProof} />
      <CtaSection content={content.cta} />
    </main>
  );
}
