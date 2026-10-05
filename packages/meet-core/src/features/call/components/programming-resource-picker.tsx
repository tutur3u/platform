'use client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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
  return (
    <div className="min-w-48 flex-1 space-y-1">
      <Select
        value={options.some((p) => p.id === id) ? id : ''}
        onValueChange={(value) =>
          onSelect(value, options.find((p) => p.id === value)?.language)
        }
        disabled={loading || error}
      >
        <SelectTrigger aria-label={t('resource')}>
          <SelectValue
            placeholder={t(loading ? 'connecting' : 'chooseResource')}
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {kind === 'problem' && problems.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          disabled={problems.isFetchingNextPage}
          onClick={() => void problems.fetchNextPage()}
        >
          {t('loadMoreResources')}
        </Button>
      )}
      {error && (
        <p role="status" className="text-muted-foreground text-xs">
          {t('accessError')}
        </p>
      )}
    </div>
  );
}
