'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { listTutoringTeachers } from '@tuturuuu/internal-api/tutoring';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

/** Searches only verified center teachers, independently of the learner's class. */
export function TutoringTeacherPicker({
  wsId,
  value,
  knownOptions = [],
  disabled,
  onChange,
}: {
  wsId: string;
  value: string;
  knownOptions?: ComboboxOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('ws-tutoring');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ComboboxOption>();
  const [q] = useDebounce(search, 250);
  const query = useInfiniteQuery({
    enabled: !disabled,
    initialPageParam: 1,
    queryKey: ['tutoring-teachers', wsId, q],
    queryFn: ({ pageParam }) =>
      listTutoringTeachers(wsId, {
        page: pageParam,
        pageSize: 20,
        q: q || undefined,
      }),
    getNextPageParam: (page) =>
      page.page < page.totalPages ? page.page + 1 : undefined,
  });
  const options = useMemo(() => {
    const teachers = new Map<string, ComboboxOption>();
    for (const page of query.data?.pages ?? [])
      for (const person of page.data)
        teachers.set(person.id, {
          value: person.id,
          label: person.display_name || person.full_name || person.id,
        });
    // Preserve a selected label across search pages, without adding arbitrary people to the catalog.
    const current =
      selected?.value === value
        ? selected
        : knownOptions.find((option) => option.value === value);
    if (value && !teachers.has(value))
      teachers.set(value, current ?? { value, label: t('teacher') });
    return [...teachers.values()];
  }, [query.data?.pages, value, selected, knownOptions, t]);
  return (
    <div className="space-y-1">
      <Combobox
        disabled={disabled}
        emptyText={query.isError ? t('teachers_load_failed') : t('no_teachers')}
        hasMore={Boolean(query.hasNextPage)}
        loadingMore={query.isFetchingNextPage}
        onLoadMore={() => {
          if (query.hasNextPage && !query.isFetchingNextPage)
            void query.fetchNextPage();
        }}
        onOpenChange={(open) => {
          if (!open) setSearch('');
        }}
        onSearchChange={setSearch}
        onChange={(next) => {
          const id = next as string;
          setSelected(options.find((option) => option.value === id));
          setSearch('');
          onChange(id);
        }}
        options={options}
        placeholder={t('select_teacher')}
        searchPlaceholder={t('search_teachers')}
        selected={value}
      />
      {query.isError ? (
        <Button onClick={() => void query.refetch()} size="sm" variant="ghost">
          {t('retry')}
        </Button>
      ) : null}
    </div>
  );
}
