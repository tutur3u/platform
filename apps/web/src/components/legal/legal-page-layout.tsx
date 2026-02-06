import { Code2, ExternalLink, Mail } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { AnimateInView } from './animate-in-view';
import { LegalSectionCard } from './legal-section-card';
import { LegalSummaryCard } from './legal-summary-card';
import type { LegalPageConfig } from './legal-types';
import { TableOfContents } from './table-of-contents';

function getSectionId(title: string) {
  return title.toLowerCase().replace(/\s+/g, '-');
}

export function LegalPageLayout({ config }: { config: LegalPageConfig }) {
  const BadgeIcon = config.badgeIcon;
  const tableOfContents = config.sections.map((s, i) => ({
    id: getSectionId(s.title),
    title: s.title,
    number: i + 1,
  }));

  return (
    <main className="relative mx-auto w-full text-balance">
      {/* CSS keyframes for mount & background animations */}
      <style>{`
        @keyframes legal-fade-in-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes legal-fade-in-scale {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes legal-slide-in-left {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes legal-orb-1 {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.2); opacity: 0.25; }
        }
        @keyframes legal-orb-2 {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(1.15); opacity: 0.3; }
        }
        @keyframes legal-orb-3 {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.3); opacity: 0.25; }
        }
      `}</style>

      {/* Floating Background Orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/30 via-dynamic-pink/20 to-transparent blur-3xl sm:-left-64 sm:h-160 sm:w-160"
          style={{ animation: 'legal-orb-1 8s ease-in-out infinite' }}
        />
        <div
          className="absolute top-[30%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/30 via-dynamic-cyan/20 to-transparent blur-3xl sm:-right-64 sm:h-140 sm:w-140"
          style={{ animation: 'legal-orb-2 10s ease-in-out infinite' }}
        />
        <div
          className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-green/20 via-dynamic-emerald/15 to-transparent blur-3xl sm:-bottom-64 sm:h-180 sm:w-180"
          style={{ animation: 'legal-orb-3 12s ease-in-out infinite' }}
        />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-size-[24px_24px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.03)_1px,transparent_1px)] bg-size-[120px] opacity-50" />
      </div>

      {/* Hero Section */}
      <section className="container relative space-y-6 pt-24 pb-8 text-center">
        <div
          className="flex flex-col items-center gap-6"
          style={{
            animation:
              'legal-fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <div
            style={{
              animation: 'legal-fade-in-scale 0.5s ease-out 0.1s both',
            }}
          >
            <Badge className="border-dynamic-purple/30 bg-dynamic-purple/10 px-4 py-1.5 text-dynamic-purple transition-transform hover:scale-105">
              <BadgeIcon className="mr-1.5 h-3.5 w-3.5" />
              {config.badgeText}
            </Badge>
          </div>

          <h1 className="font-bold text-4xl text-foreground sm:text-5xl lg:text-6xl">
            {config.title}{' '}
            <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
              {config.highlightedWord}
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
            Effective Date:{' '}
            {new Date(config.effectiveDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>

          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href="https://github.com/tutur3u/platform" target="_blank">
                <Code2 className="mr-2 h-4 w-4" />
                View on GitHub
                <ExternalLink className="ml-2 h-3 w-3" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="mailto:legal@tuturuuu.com">
                <Mail className="mr-2 h-4 w-4" />
                Contact Legal
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Content */}
      <div className="container mx-auto grid max-w-7xl gap-8 py-8 lg:grid-cols-[280px_1fr]">
        {/* Sidebar TOC */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <TableOfContents
              items={tableOfContents}
              effectiveDate={config.effectiveDate}
            />
          </div>
        </aside>

        {/* Main Content */}
        <div className="space-y-8">
          <LegalSummaryCard
            title={config.summaryTitle}
            description={config.summaryDescription}
            rows={config.summaryRows}
          />

          {config.sections.map((section, index) => {
            const nextSection = config.sections[index + 1];
            return (
              <LegalSectionCard
                key={section.title}
                section={section}
                index={index}
                totalSections={config.sections.length}
                nextSectionId={
                  nextSection ? getSectionId(nextSection.title) : undefined
                }
                nextSectionTitle={nextSection?.title}
              />
            );
          })}

          {config.extraContent}
        </div>
      </div>

      {/* Footer */}
      <AnimateInView className="container pt-8 pb-24 text-center">
        <p className="mx-auto max-w-2xl text-muted-foreground text-sm">
          {config.footerText}
        </p>
      </AnimateInView>
    </main>
  );
}
