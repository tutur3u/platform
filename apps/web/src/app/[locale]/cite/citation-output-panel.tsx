'use client';

import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useTranslations } from 'next-intl';
import type { CitationStyle } from '@/lib/cite/types';
import type { CitationOutput } from './citation-output';
import { CitationResultBlock } from './citation-result-block';

const STYLES: readonly CitationStyle[] = ['apa', 'harvard'];

export function CitationOutputPanel({
  output,
  style,
  onStyleChange,
  needsReview,
}: {
  output: CitationOutput;
  style: CitationStyle;
  onStyleChange: (style: CitationStyle) => void;
  needsReview: boolean;
}) {
  const t = useTranslations('cite.output');

  return (
    <section
      aria-labelledby="cite-output-heading"
      className="space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground md:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="font-semibold text-base tracking-tight"
          id="cite-output-heading"
        >
          {t('heading')}
        </h2>
        <ToggleGroup
          aria-label={t('style_label')}
          onValueChange={(value) => {
            if (value === 'apa' || value === 'harvard') onStyleChange(value);
          }}
          type="single"
          value={style}
          variant="outline"
        >
          {STYLES.map((option) => (
            <ToggleGroupItem className="px-3" key={option} value={option}>
              {t(`styles.${option}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <OutputBody needsReview={needsReview} output={output} />
    </section>
  );
}

function OutputBody({
  output,
  needsReview,
}: {
  output: CitationOutput;
  needsReview: boolean;
}) {
  const t = useTranslations('cite.output');

  switch (output.kind) {
    case 'incomplete':
    case 'invalid':
    case 'failed':
      return (
        <p
          className="rounded-md border border-border border-dashed px-3 py-6 text-center text-muted-foreground text-sm"
          role={output.kind === 'incomplete' ? undefined : 'status'}
        >
          {t(output.kind)}
        </p>
      );
    case 'ready':
      return (
        <div className="space-y-4">
          {needsReview ? (
            <p className="text-muted-foreground text-sm">{t('review')}</p>
          ) : null}
          <CitationResultBlock
            copyLabel={t('copy_reference')}
            label={t('reference')}
            value={output.reference}
          />
          <CitationResultBlock
            copyLabel={t('copy_in_text')}
            label={t('in_text')}
            value={output.inText}
          />
        </div>
      );
    default: {
      const unreachable: never = output;
      return unreachable;
    }
  }
}
