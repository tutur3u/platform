'use client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronDown, Plus } from '@tuturuuu/icons';
import { listProgrammingProblems } from '@tuturuuu/internal-api/programming';
import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useLocale, useTranslations } from 'next-intl';
import { readMeetingProjects } from '../lib/programming-catalog';

/** Select value for "start a new playground"; the panel keeps an empty id for it. */
const NEW_PLAYGROUND = '__new__';

/**
 * The project or problem select of the open dialog. Playgrounds list "New
 * playground" first; long names truncate inside the trigger and wrap only in
 * the open list.
 */
export function ProgrammingResourcePicker({
  wsId,
  accountId,
  kind,
  id,
  onSelect,
  triggerId,
}: {
  wsId: string;
  accountId: string;
  kind: 'problem' | 'playground';
  id: string;
  onSelect: (id: string, language?: PlaygroundLanguage) => void;
  triggerId?: string;
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
  const value =
    kind === 'playground' && !id ? NEW_PLAYGROUND : (selected?.id ?? '');
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Select
        value={value}
        onValueChange={(next) =>
          next === NEW_PLAYGROUND
            ? onSelect('')
            : onSelect(next, options.find((p) => p.id === next)?.language)
        }
        disabled={kind === 'problem' && (loading || error)}
      >
        <SelectTrigger
          id={triggerId}
          aria-label={t('resource')}
          className="h-10 w-full min-w-0 rounded-full [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
        >
          <SelectValue
            placeholder={t(loading ? 'connecting' : 'chooseProblem')}
          >
            {value === NEW_PLAYGROUND ? (
              <span className="truncate">{t('newPlayground')}</span>
            ) : selected ? (
              <span className="truncate">{selected.label}</span>
            ) : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72 max-w-(--radix-select-content-available-width)">
          {kind === 'playground' && (
            <>
              <SelectItem value={NEW_PLAYGROUND}>
                <Plus aria-hidden="true" className="size-4" />
                {t('newPlayground')}
              </SelectItem>
              {options.length > 0 && <SelectSeparator />}
            </>
          )}
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="min-w-0 wrap-anywhere">{p.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {kind === 'problem' && problems.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto min-h-8 max-w-full self-start whitespace-normal rounded-full text-start"
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
        <p role="status" className="wrap-anywhere text-destructive text-xs">
          {t('catalogUnavailable')}
        </p>
      )}
    </div>
  );
}
