'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from '@tuturuuu/icons';
import {
  type RateLimitSubjectSearchKind,
  type RateLimitSubjectSearchResult,
  searchRateLimitSubjects,
} from '@tuturuuu/internal-api';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

export type GuidedSubjectKind =
  | 'advanced'
  | 'cidr'
  | 'ip'
  | 'session'
  | RateLimitSubjectSearchKind;

export function RateLimitSubjectPicker({
  advancedSubjectKey,
  kind,
  onAdvancedSubjectKeyChange,
  onKindChange,
  onQueryChange,
  onSelect,
  query,
  selected,
}: {
  advancedSubjectKey: string;
  kind: GuidedSubjectKind;
  onAdvancedSubjectKeyChange: (value: string) => void;
  onKindChange: (value: GuidedSubjectKind) => void;
  onQueryChange: (value: string) => void;
  onSelect: (value: RateLimitSubjectSearchResult | null) => void;
  query: string;
  selected: RateLimitSubjectSearchResult | null;
}) {
  const t = useTranslations('rate-limits');
  const canSearch = kind === 'workspace' || kind === 'user' || kind === 'ip';
  const subjectQuery = useQuery({
    enabled: canSearch && query.trim().length > 0,
    queryFn: () =>
      searchRateLimitSubjects({
        kind: kind as RateLimitSubjectSearchKind,
        limit: 8,
        q: query.trim(),
      }),
    queryKey: ['infrastructure', 'rate-limit-subjects', kind, query.trim()],
    staleTime: 30000,
  });

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>{t('guided.who')}</Label>
        <Select
          onValueChange={(value) => {
            onKindChange(value as GuidedSubjectKind);
            onSelect(null);
            onQueryChange('');
            onAdvancedSubjectKeyChange('');
          }}
          value={kind}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(
              [
                'workspace',
                'user',
                'ip',
                'cidr',
                'session',
                'advanced',
              ] as const
            ).map((value) => (
              <SelectItem key={value} value={value}>
                {t(`guided.subject_kinds.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canSearch ? (
        <div className="space-y-2">
          <Label htmlFor="rate-limit-subject-search">
            {t('guided.search_subject')}
          </Label>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              id="rate-limit-subject-search"
              onChange={(event) => {
                onQueryChange(event.target.value);
                onSelect(null);
              }}
              placeholder={t(`guided.search_placeholders.${kind}`)}
              value={query}
            />
          </div>

          {subjectQuery.isFetching ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('guided.searching')}
            </div>
          ) : null}

          {subjectQuery.data?.results.length ? (
            <div className="space-y-2 rounded-md border border-border p-2">
              {subjectQuery.data.results.map((result) => (
                <button
                  className={`w-full rounded-md border p-2 text-left transition hover:bg-muted/60 ${
                    selected?.subjectKey === result.subjectKey
                      ? 'border-primary bg-muted'
                      : 'border-transparent'
                  }`}
                  key={result.subjectKey}
                  onClick={() => onSelect(result)}
                  type="button"
                >
                  <span className="block font-medium text-sm">
                    {result.label}
                  </span>
                  {result.detail ? (
                    <span className="block truncate text-muted-foreground text-xs">
                      {result.detail}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="rate-limit-advanced-subject">
            {t(
              kind === 'advanced'
                ? 'fields.subject_key'
                : `guided.subject_inputs.${kind}`
            )}
          </Label>
          <Input
            id="rate-limit-advanced-subject"
            onChange={(event) => onAdvancedSubjectKeyChange(event.target.value)}
            placeholder={t(`guided.subject_placeholders.${kind}`)}
            value={advancedSubjectKey}
          />
        </div>
      )}
    </div>
  );
}
