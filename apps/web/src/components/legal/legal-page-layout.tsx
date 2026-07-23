import { Code2, Mail } from '@tuturuuu/icons/lucide';
import { ActionLink } from '@/components/marketing/action-link';
import { PageHero } from '@/components/marketing/page-hero';
import { AnimateInView } from './animate-in-view';
import { LegalSectionCard } from './legal-section-card';
import { LegalSummaryCard } from './legal-summary-card';
import type { LegalPageConfig } from './legal-types';
import { TableOfContents } from './table-of-contents';

function getSectionId(title: string) {
  return title.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Shared shell for terms, privacy, community guidelines and acceptable use.
 *
 * Rebuilt onto the marketing kit so the legal pages read as part of the same
 * site: one `PageHero`, one atmosphere, one set of link buttons. The three
 * fixed background orbs and the block of hand-written `@keyframes` that used
 * to ship with every legal page are gone — `HeroAtmosphere` already provides
 * the light, and it honours reduced motion, which the orbs never did.
 */
export function LegalPageLayout({ config }: { config: LegalPageConfig }) {
  const tableOfContents = config.sections.map((section, index) => ({
    id: getSectionId(section.title),
    title: section.title,
    number: index + 1,
  }));

  const effectiveDate = new Date(config.effectiveDate).toLocaleDateString(
    'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  return (
    <main className="relative w-full overflow-x-hidden">
      <PageHero
        accent="purple"
        actions={
          <>
            <ActionLink
              external
              href="https://github.com/tutur3u/platform"
              variant="ghost"
            >
              <Code2 className="h-4 w-4" />
              View on GitHub
            </ActionLink>
            <ActionLink href="mailto:legal@tuturuuu.com" variant="ghost">
              <Mail className="h-4 w-4" />
              Contact legal
            </ActionLink>
          </>
        }
        description={`Effective ${effectiveDate}`}
        eyebrow={config.badgeText}
        eyebrowIcon={config.badgeIcon}
        highlight={config.highlightedWord}
        title={config.title}
      />

      <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <TableOfContents
                effectiveDate={config.effectiveDate}
                items={tableOfContents}
              />
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <LegalSummaryCard
              description={config.summaryDescription}
              rows={config.summaryRows}
              title={config.summaryTitle}
            />

            {config.sections.map((section, index) => {
              const nextSection = config.sections[index + 1];

              return (
                <LegalSectionCard
                  index={index}
                  key={section.title}
                  nextSectionId={
                    nextSection ? getSectionId(nextSection.title) : undefined
                  }
                  nextSectionTitle={nextSection?.title}
                  section={section}
                  totalSections={config.sections.length}
                />
              );
            })}

            {config.extraContent}

            <AnimateInView>
              <p className="text-balance border-foreground/[0.07] border-t px-1 pt-8 text-foreground/40 text-sm leading-relaxed">
                {config.footerText}
              </p>
            </AnimateInView>
          </div>
        </div>
      </section>
    </main>
  );
}
