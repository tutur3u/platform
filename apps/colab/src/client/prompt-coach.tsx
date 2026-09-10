import { Sparkles } from '@tuturuuu/icons';
import type { Team } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import { useContext, useState } from 'react';
import { LocaleContext, useCopy } from './i18n';
import { SelectField } from './select-field';

export function PromptCoach({
  team,
  disabled,
  writable,
  changed,
  action,
  onAdd,
}: {
  team: Team;
  disabled: boolean;
  writable: boolean;
  changed: boolean;
  action: (body: Record<string, unknown>, route?: string) => Promise<void>;
  onAdd: (text: string) => void;
}) {
  const c = useCopy();
  const locale = useContext(LocaleContext);
  const [framework, setFramework] = useState<'rise' | 'craft'>('rise');
  const review = team.promptReview;
  const stale = review && (review.revision !== team.revision || changed);
  return (
    <section className="prompt-analysis" aria-label={c.coaching.reviewSummary}>
      <header className="analysis-heading">
        <div>
          <h3>
            <Sparkles className="size-5" aria-hidden="true" />
            {c.coaching.reviewSummary}
          </h3>
          <p>{c.coaching.aiReviewHelp}</p>
        </div>
        {writable && (
          <div className="flex flex-wrap gap-3">
            <SelectField
              label={c.learning.frameworkLabel}
              value={framework}
              onValueChange={(value) =>
                setFramework(value === 'craft' ? 'craft' : 'rise')
              }
            >
              <option value="rise">{c.learning.frameworks.rise.name}</option>
              <option value="craft">{c.learning.frameworks.craft.name}</option>
            </SelectField>
            <Button
              disabled={disabled || changed || team.prompt.length < 10}
              onClick={() =>
                void action(
                  { action: 'analyze', framework, locale },
                  'ai'
                ).catch(() => {})
              }
            >
              {c.coaching.aiReview}
            </Button>
          </div>
        )}
      </header>
      {stale && <p className="notice">{c.coaching.reviewStale}</p>}
      {review && (
        <>
          <p>{review.summary}</p>
          <div className="framework-map">
            {review.sections.map((section) => (
              <article key={section.id}>
                <h4>
                  {c.learning.frameworks[review.framework].sections.find(
                    (item) => item.id === section.id
                  )?.title ?? section.id}
                </h4>
                {section.quote && <blockquote>{section.quote}</blockquote>}
                <p>{section.explanation}</p>
                <p>
                  <strong>{c.learning.suggestion}:</strong>{' '}
                  {section.improvement}
                </p>
                {writable && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      disabled ||
                      Boolean(stale) ||
                      team.prompt.length + section.improvement.length + 2 >
                        12000
                    }
                    onClick={() => onAdd(section.improvement)}
                  >
                    {c.coaching.reviewAdd}
                  </Button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
