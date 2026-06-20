import { ChevronRight } from '@tuturuuu/icons/lucide';
import { AnimateInView } from './animate-in-view';
import { LegalMarkdown } from './legal-markdown';
import type { LegalSection } from './legal-types';

const sectionColorClassNames = {
  amber: {
    card: 'border-l-dynamic-amber/30 hover:border-l-dynamic-amber',
    icon: 'bg-dynamic-amber/10 text-dynamic-amber',
  },
  blue: {
    card: 'border-l-dynamic-blue/30 hover:border-l-dynamic-blue',
    icon: 'bg-dynamic-blue/10 text-dynamic-blue',
  },
  cyan: {
    card: 'border-l-dynamic-cyan/30 hover:border-l-dynamic-cyan',
    icon: 'bg-dynamic-cyan/10 text-dynamic-cyan',
  },
  emerald: {
    card: 'border-l-dynamic-emerald/30 hover:border-l-dynamic-emerald',
    icon: 'bg-dynamic-emerald/10 text-dynamic-emerald',
  },
  green: {
    card: 'border-l-dynamic-green/30 hover:border-l-dynamic-green',
    icon: 'bg-dynamic-green/10 text-dynamic-green',
  },
  indigo: {
    card: 'border-l-dynamic-indigo/30 hover:border-l-dynamic-indigo',
    icon: 'bg-dynamic-indigo/10 text-dynamic-indigo',
  },
  orange: {
    card: 'border-l-dynamic-orange/30 hover:border-l-dynamic-orange',
    icon: 'bg-dynamic-orange/10 text-dynamic-orange',
  },
  pink: {
    card: 'border-l-dynamic-pink/30 hover:border-l-dynamic-pink',
    icon: 'bg-dynamic-pink/10 text-dynamic-pink',
  },
  purple: {
    card: 'border-l-dynamic-purple/30 hover:border-l-dynamic-purple',
    icon: 'bg-dynamic-purple/10 text-dynamic-purple',
  },
  red: {
    card: 'border-l-dynamic-red/30 hover:border-l-dynamic-red',
    icon: 'bg-dynamic-red/10 text-dynamic-red',
  },
  rose: {
    card: 'border-l-dynamic-rose/30 hover:border-l-dynamic-rose',
    icon: 'bg-dynamic-rose/10 text-dynamic-rose',
  },
  slate: {
    card: 'border-l-dynamic-slate/30 hover:border-l-dynamic-slate',
    icon: 'bg-dynamic-slate/10 text-dynamic-slate',
  },
  teal: {
    card: 'border-l-dynamic-teal/30 hover:border-l-dynamic-teal',
    icon: 'bg-dynamic-teal/10 text-dynamic-teal',
  },
  violet: {
    card: 'border-l-dynamic-violet/30 hover:border-l-dynamic-violet',
    icon: 'bg-dynamic-violet/10 text-dynamic-violet',
  },
} satisfies Record<LegalSection['color'], { card: string; icon: string }>;

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

export function LegalSectionCard({
  section,
  index,
  totalSections,
  nextSectionId,
  nextSectionTitle,
}: LegalSectionCardProps) {
  const Icon = section.icon;
  const colorClassNames = sectionColorClassNames[section.color];

  return (
    <AnimateInView id={getSectionId(section.title)} className="scroll-mt-32">
      <div
        className={`group overflow-hidden rounded-xl border border-l-4 bg-card text-card-foreground shadow-sm transition-all duration-200 ${colorClassNames.card}`}
      >
        <div className="bg-card p-8">
          <div className="mb-5 flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${colorClassNames.icon}`}
            >
              <Icon className="h-6 w-6" />
            </div>
            <h2 className="font-semibold text-2xl">{section.title}</h2>
          </div>
          <div className="prose prose-gray dark:prose-invert max-w-none text-card-foreground">
            {typeof section.content === 'string' ? (
              <LegalMarkdown>{section.content}</LegalMarkdown>
            ) : (
              section.content
            )}
          </div>
        </div>
        <div className="bg-muted/50 px-8 py-3 text-muted-foreground text-xs">
          <div className="flex justify-between">
            <span>
              Section {index + 1} of {totalSections}
            </span>
            {nextSectionId && nextSectionTitle && (
              <a
                href={`#${nextSectionId}`}
                className="flex items-center hover:text-primary"
              >
                Next: {nextSectionTitle}
                <ChevronRight className="ml-1 h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </AnimateInView>
  );
}
