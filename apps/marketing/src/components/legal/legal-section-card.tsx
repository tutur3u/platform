import { ChevronRight } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { AnimateInView } from './animate-in-view';
import { getLegalAccent } from './legal-accents';
import { LegalMarkdown } from './legal-markdown';
import type { LegalSection } from './legal-types';

interface LegalSectionCardProps {
  section: LegalSection;
  index: number;
  totalSections: number;
  nextSectionId?: string;
  nextSectionTitle?: string;
}

function getSectionId(title: string) {
  return title.toLowerCase().replace(/\s+/g, '-');
}

/**
 * One clause of a legal document.
 *
 * Accents come from a static map now; the previous version built them by
 * interpolation, so every card on every legal page rendered without one.
 */
export function LegalSectionCard({
  section,
  index,
  totalSections,
  nextSectionId,
  nextSectionTitle,
}: LegalSectionCardProps) {
  const Icon = section.icon;
  const accent = getLegalAccent(section.color);

  return (
    <AnimateInView className="scroll-mt-28" id={getSectionId(section.title)}>
      <article className="group relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] transition-all duration-500 hover:border-foreground/15">
        {/* Left spine — the section's colour, carried down the full card */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-0.5 transition-opacity duration-500 group-hover:opacity-100',
            accent.spine,
            'opacity-60'
          )}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-40 transition-opacity duration-500 group-hover:opacity-100',
            accent.rule
          )}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -top-20 -right-12 h-48 w-48 rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-100',
            accent.bloom
          )}
        />

        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-transform duration-500 group-hover:scale-105',
                accent.plate,
                accent.text
              )}
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0">
              <span className="block font-mono-ui text-[0.58rem] text-foreground/30 tabular-nums tracking-[0.2em]">
                {String(index + 1).padStart(2, '0')} / {totalSections}
              </span>
              <h2 className="mt-0.5 text-balance font-display font-semibold text-xl tracking-[-0.02em] sm:text-2xl">
                {section.title}
              </h2>
            </div>
          </div>

          <div className="prose prose-gray dark:prose-invert mt-6 max-w-none prose-headings:font-display prose-a:text-dynamic-blue prose-strong:text-foreground text-foreground/70 prose-headings:tracking-[-0.01em]">
            {typeof section.content === 'string' ? (
              <LegalMarkdown>{section.content}</LegalMarkdown>
            ) : (
              section.content
            )}
          </div>
        </div>

        {nextSectionId && nextSectionTitle ? (
          <footer className="relative border-foreground/[0.07] border-t px-6 py-3 sm:px-8">
            <a
              className="group/next flex items-center justify-end gap-1.5 font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.14em] transition-colors hover:text-foreground/70"
              href={`#${nextSectionId}`}
            >
              Next: {nextSectionTitle}
              <ChevronRight className="h-3 w-3 transition-transform duration-300 group-hover/next:translate-x-0.5" />
            </a>
          </footer>
        ) : null}
      </article>
    </AnimateInView>
  );
}
