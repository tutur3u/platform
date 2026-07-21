'use client';

import { ChevronDown, ChevronUp } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { FormResponseRecord } from '../types';

export interface GroupedResponder {
  key: string;
  label: string;
  responses: FormResponseRecord[];
}

export function ResponderGroup({
  group,
  groupIndex,
  answerColumns,
  forceExpanded,
  defaultExpanded,
}: {
  group: GroupedResponder;
  groupIndex: number;
  answerColumns: string[];
  forceExpanded: boolean;
  defaultExpanded: boolean;
}) {
  const t = useTranslations('forms');
  const [open, setOpen] = useState(defaultExpanded);
  const isOpen = forceExpanded || open;

  return (
    <Collapsible open={isOpen} onOpenChange={setOpen}>
      <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-muted/30"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-muted/40 font-semibold text-xs'
                )}
              >
                {groupIndex + 1}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-sm">{group.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('responses.total_submissions', {
                    count: group.responses.length,
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="rounded-full px-2 py-0.5 text-[11px]"
              >
                {group.responses.length}
              </Badge>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-border/60 border-t">
            {group.responses.map((response, responseIndex) => (
              <div
                key={response.id}
                className={cn(
                  'px-5 py-4',
                  responseIndex > 0 && 'border-border/40 border-t'
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-medium text-sm">
                    {t('responses.response_number', {
                      number: responseIndex + 1,
                    })}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {t('responses.submitted_at', {
                      time: new Date(response.submittedAt).toLocaleString(),
                    })}
                  </span>
                </div>
                {answerColumns.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t('responses.no_answers')}
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {answerColumns.map((column) => {
                      const answer = response.answers[column];
                      if (!answer?.value) return null;
                      return (
                        <div
                          key={column}
                          className="flex flex-col gap-1.5 rounded-2xl border border-border/50 bg-background/60 px-4 py-3 sm:flex-row sm:items-start sm:gap-6"
                        >
                          <span className="w-full shrink-0 font-medium text-muted-foreground text-xs uppercase tracking-wide sm:max-w-[200px] lg:max-w-[240px]">
                            {column}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="whitespace-pre-wrap font-medium text-sm">
                              {answer.value}
                            </p>
                            {answer.unresolvedValues.length > 0 ? (
                              <p className="text-dynamic-orange text-xs">
                                {t('responses.unmatched_answer_hint', {
                                  value: answer.unresolvedValues.join(', '),
                                })}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
