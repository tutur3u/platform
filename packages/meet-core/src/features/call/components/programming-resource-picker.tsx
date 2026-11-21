'use client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronDown } from '@tuturuuu/icons';
import { listProgrammingProblems } from '@tuturuuu/internal-api/programming';
import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useLocale, useTranslations } from 'next-intl';
import { readMeetingProjects } from '../lib/programming-catalog';
export function ProgrammingResourcePicker({
  wsId,
  accountId,
  kind,
  id,
  onSelect,
}: {
  wsId: string;
  accountId: string;
  kind: 'problem' | 'playground';
  id: string;
  onSelect: (id: string, language?: PlaygroundLanguage) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('programmingPlayground');
  const problems = useInfiniteQuery({
    queryKey: ['meeting-problem-catalog', accountId, wsId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listProgrammingProblems(wsId, { cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: kind === 'problem',
    retry: false,
  });
  const projects = useQuery({
    queryKey: ['meeting-project-catalog', accountId],
    queryFn: () => readMeetingProjects(accountId),
    enabled: kind === 'playground',
    retry: false,
  });
  const options =
    kind === 'problem'
      ? (problems.data?.pages
          .flatMap((p) => p.problems)
          .map((p) => ({
            id: p.id,
            label: p.title[locale === 'vi' ? 'vi' : 'en'],
            language: undefined,
          })) ?? [])
      : (projects.data?.projects.map((p) => ({
          id: p.id,
          label: p.name,
          language: p.language,
        })) ?? []);
  const loading = kind === 'problem' ? problems.isPending : projects.isPending;
  const error = kind === 'problem' ? problems.isError : projects.isError;
  const selected = options.find((option) => option.id === id);
  return (
    <div className="flex min-w-0 max-w-full flex-[1_1_12rem] flex-col gap-1">
      <Select
        value={selected?.id ?? ''}
        onValueChange={(value) =>
          onSelect(value, options.find((p) => p.id === value)?.language)
        }
        disabled={loading || error}
      >
        <SelectTrigger
          aria-label={t('resource')}
          className="h-8 min-w-0 gap-2 [&_[data-slot=select-value]]:min-w-0"
        >
          <SelectValue
            placeholder={t(loading ? 'connecting' : 'chooseResource')}
          >
            {selected && <span className="truncate">{selected.label}</span>}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-w-(--radix-select-content-available-width)">
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="min-w-0 wrap-anywhere">{p.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {kind === 'problem' && problems.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="h-auto min-h-8 max-w-full self-start whitespace-normal text-start"
          disabled={problems.isFetchingNextPage}
          onClick={() => void problems.fetchNextPage()}
        >
          <ChevronDown aria-hidden="true" className="size-4" />
          <span className="min-w-0 wrap-anywhere">
            {t('loadMoreResources')}
          </span>
        </Button>
      )}
      {error && (
        <p
          role="status"
          className="wrap-anywhere text-muted-foreground text-xs"
        >
          {t('accessError')}
        </p>
      )}
    </div>
  );
}
