import { LandingShell } from './landing-shell';
import { BlocksSection } from './sections/blocks-section';
import { ClosingSection } from './sections/closing-section';
import { CollaborationSection } from './sections/collaboration-section';
import { DesignSection } from './sections/design-section';
import { EmbedSection } from './sections/embed-section';
import { FaqSection } from './sections/faq-section';
import { HeroSection } from './sections/hero-section';
import { InsightsSection } from './sections/insights-section';
import { LogicSection } from './sections/logic-section';
import { SecuritySection } from './sections/security-section';
import { WorkflowSection } from './sections/workflow-section';

/**
 * forms.tuturuuu.com landing page.
 *
 * Composition only — every section owns its own markup and copy so this file
 * stays a readable table of contents for the page.
 */
export function FormsLandingPage() {
  return (
    <LandingShell>
      <HeroSection secondaryHref="#workflow" />
      <WorkflowSection />
      <BlocksSection />
      <LogicSection />
      <DesignSection />
      <EmbedSection />
      <CollaborationSection />
      <InsightsSection />
      <SecuritySection />
      <FaqSection />
      <ClosingSection secondaryHref="#faq" />
    </LandingShell>
  );
}
