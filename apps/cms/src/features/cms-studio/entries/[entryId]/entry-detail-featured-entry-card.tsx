'use client';

import { Check, ChevronDown, ChevronUp, Plus, Sparkles } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import type { CmsStrings } from '../../cms-strings';
import type { FeaturedEntryEditorConfig } from './entry-detail-shared';

type EntryDetailFeaturedEntryCardProps = {
  config: FeaturedEntryEditorConfig;
  featuredEntrySlugs: string[];
  onMove: (slug: string, direction: -1 | 1) => void;
  onToggle: (slug: string) => void;
  strings: CmsStrings;
};

export function EntryDetailFeaturedEntryCard({
  config,
  featuredEntrySlugs,
  onMove,
  onToggle,
  strings,
}: EntryDetailFeaturedEntryCardProps) {
  return (
    <div className="space-y-3 rounded-[1.1rem] border border-border/70 bg-background/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label className="flex items-center gap-2">
            <Badge variant="outline" className="size-6 rounded-md p-0">
              <Sparkles className="m-auto h-3.5 w-3.5" />
            </Badge>
            {config.title}
          </Label>
          <p className="text-muted-foreground text-sm">{config.description}</p>
        </div>
        <Badge variant="secondary">{featuredEntrySlugs.length}</Badge>
      </div>
      {config.options.length === 0 ? (
        <div className="rounded-xl border border-border/70 border-dashed bg-card/50 px-3 py-3 text-muted-foreground text-sm">
          {strings.featuredEntriesEmpty}
        </div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {config.options.map((option) => {
            const selectedIndex = featuredEntrySlugs.indexOf(option.slug);
            const isSelected = selectedIndex >= 0;

            return (
              <div
                key={option.id}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors',
                  isSelected
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/70 bg-card/60'
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => onToggle(option.slug)}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-semibold text-xs',
                      isSelected
                        ? 'border-primary/40 bg-primary text-primary-foreground'
                        : 'border-border/70 bg-background/70 text-muted-foreground'
                    )}
                  >
                    {isSelected ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-sm">
                        {option.title}
                      </span>
                      {isSelected ? (
                        <Badge variant="outline">{selectedIndex + 1}</Badge>
                      ) : null}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      {option.subtitle?.trim() || option.slug}
                    </div>
                  </div>
                </button>
                {isSelected ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      disabled={selectedIndex === 0}
                      onClick={() => onMove(option.slug, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                      <span className="sr-only">{strings.previousAction}</span>
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      disabled={selectedIndex === featuredEntrySlugs.length - 1}
                      onClick={() => onMove(option.slug, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                      <span className="sr-only">{strings.nextAction}</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {config.options.length > 0 && featuredEntrySlugs.length === 0 ? (
        <div className="rounded-xl border border-border/70 border-dashed bg-card/50 px-3 py-3 text-muted-foreground text-sm">
          {strings.featuredEntriesEmpty}
        </div>
      ) : null}
    </div>
  );
}
