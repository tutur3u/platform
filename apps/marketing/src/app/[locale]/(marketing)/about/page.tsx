import { BeliefsSection } from './components/beliefs-section';
import { CapabilitiesSection } from './components/capabilities-section';
import { ClosingSection } from './components/closing-section';
import { CommunitySection } from './components/community-section';
import { CompanySection } from './components/company-section';
import { CostsSection } from './components/costs-section';
import { EcosystemSection } from './components/ecosystem-section';
import { AboutHero } from './components/hero-section';
import { JourneySection } from './components/journey-section';
import { PurposeSection } from './components/purpose-section';
import { StackSection } from './components/stack-section';

/**
 * About — the story behind the platform, told in the landing page's system.
 *
 * Every section is a small server component built on the shared marketing kit
 * (`SectionShell`, `SurfaceCard`, `Reveal`), so the page stays a composition
 * rather than a thousand lines of one-off markup.
 */
export default function AboutPage() {
  return (
    <main className="relative w-full overflow-x-hidden">
      <AboutHero />
      <PurposeSection />
      <BeliefsSection />
      <CostsSection />
      <EcosystemSection />
      <CapabilitiesSection />
      <StackSection />
      <JourneySection />
      <CommunitySection />
      <CompanySection />
      <ClosingSection />
    </main>
  );
}
