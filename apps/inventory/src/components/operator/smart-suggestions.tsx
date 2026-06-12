'use client';

import { Lightbulb, WandSparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

export type SmartSuggestion = {
  actionLabel?: string;
  description: string;
  key: string;
  onApply?: () => void;
  title: string;
};

export function SmartSuggestions({
  emptyLabel,
  suggestions,
  title,
}: {
  emptyLabel: string;
  suggestions: SmartSuggestion[];
  title: string;
}) {
  return (
    <aside className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
          <WandSparkles className="h-4 w-4" />
        </span>
        <p className="font-medium text-sm">{title}</p>
      </div>
      <div className="mt-3 grid gap-2">
        {suggestions.length ? (
          suggestions.map((suggestion) => (
            <div
              className="rounded-md border border-border bg-background p-3"
              key={suggestion.key}
            >
              <div className="flex items-start gap-2">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{suggestion.title}</p>
                  <p className="mt-1 text-muted-foreground text-xs leading-5">
                    {suggestion.description}
                  </p>
                </div>
              </div>
              {suggestion.onApply && suggestion.actionLabel ? (
                <Button
                  className="mt-3 h-8"
                  onClick={suggestion.onApply}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {suggestion.actionLabel}
                </Button>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-md border border-border border-dashed p-3 text-muted-foreground text-sm">
            {emptyLabel}
          </p>
        )}
      </div>
    </aside>
  );
}

export function createSlugSuggestion(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}
