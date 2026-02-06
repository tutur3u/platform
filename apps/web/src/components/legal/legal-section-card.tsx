import { ChevronRight } from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import { AnimateInView } from './animate-in-view';
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

export function LegalSectionCard({
  section,
  index,
  totalSections,
  nextSectionId,
  nextSectionTitle,
}: LegalSectionCardProps) {
  const Icon = section.icon;
  const color = section.color;

  return (
    <AnimateInView id={getSectionId(section.title)} className="scroll-mt-32">
      <Card
        className={`group overflow-hidden border-l-4 border-l-dynamic-${color}/30 transition-all duration-200 hover:border-l-dynamic-${color}`}
      >
        <div className="bg-card p-8">
          <div className="mb-5 flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-${color}/10 text-dynamic-${color} transition-transform duration-300 group-hover:scale-110`}
            >
              <Icon className="h-6 w-6" />
            </div>
            <h2 className="font-semibold text-2xl">{section.title}</h2>
          </div>
          <div className="prose prose-gray dark:prose-invert max-w-none text-card-foreground">
            {typeof section.content === 'string' ? (
              <MemoizedReactMarkdown>{section.content}</MemoizedReactMarkdown>
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
      </Card>
    </AnimateInView>
  );
}
