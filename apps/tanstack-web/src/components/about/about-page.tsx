import type { Locale } from '../../lib/platform/locale';
import {
  CommunitySection,
  CompanyInfoSection,
  CtaSection,
} from './about-company-sections';
import { getAboutContent } from './about-content';
import {
  CoreBeliefsSection,
  HeroSection,
  ProblemSection,
  VisionSection,
} from './about-intro-sections';
import {
  EcosystemSection,
  FeaturesSection,
  TechStackSection,
  TimelineSection,
} from './about-platform-sections';
import { AboutBackground } from './about-primitives';

export function AboutPage({ locale }: Readonly<{ locale: Locale }>) {
  const content = getAboutContent(locale);

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      <AboutBackground />
      <HeroSection content={content} />
      <VisionSection content={content} />
      <CoreBeliefsSection content={content} />
      <ProblemSection content={content} />
      <EcosystemSection content={content} />
      <TechStackSection content={content} />
      <FeaturesSection content={content} />
      <TimelineSection content={content} />
      <CommunitySection content={content} />
      <CompanyInfoSection content={content} />
      <CtaSection content={content} />
    </main>
  );
}
