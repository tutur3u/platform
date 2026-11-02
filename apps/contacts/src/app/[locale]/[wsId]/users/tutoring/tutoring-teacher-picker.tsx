'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { listTutoringTeachers } from '@tuturuuu/internal-api/tutoring';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState } from 'react';

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
  const [tutorsOnly, setTutorsOnly] = useState(true);
  const [locked, setLocked] = useState(false);
  const [cleared, setCleared] = useState(false);
  const effectiveTutorsOnly = locked || tutorsOnly;
  // One picker renders per session slot, so the toggle id must be unique.
  const tutorsOnlyId = useId();
  const [q] = useDebounce(search, 250);
  const query = useInfiniteQuery({
    enabled: !disabled,
    initialPageParam: 1,
    queryKey: ['tutoring-teachers', wsId, q, effectiveTutorsOnly],
    queryFn: ({ pageParam }) =>
      listTutoringTeachers(wsId, {
        page: pageParam,
        pageSize: 20,
        q: q || undefined,
        tutorsOnly: effectiveTutorsOnly,
      }),
    getNextPageParam: (page) =>
      page.page < page.totalPages ? page.page + 1 : undefined,
  });
  const tutorsOnlyLocked =
    locked || query.data?.pages[0]?.tutorsOnlyLocked === true;
  const tutorGroupConfigMissing =
    query.data?.pages[0]?.tutorGroupConfigMissing === true;
  useEffect(() => {
    const metadata = query.data?.pages[0];
    if (metadata) setLocked(metadata.tutorsOnlyLocked);
  }, [query.data?.pages]);
  const eligibility = useQuery({
    queryKey: ['tutoring-teacher-eligibility', wsId, value],
    enabled: tutorsOnlyLocked && Boolean(value) && !disabled,
    queryFn: () =>
      listTutoringTeachers(wsId, {
        teacherId: value,
        tutorsOnly: true,
        pageSize: 1,
      }),
  });
  useEffect(() => {
    if (
      tutorsOnlyLocked &&
      value &&
      eligibility.data &&
      !eligibility.data.data.some(
        (teacher) => teacher.id === value && teacher.isTutor
      )
    ) {
      setCleared(true);
      onChange('');
    }
  }, [tutorsOnlyLocked, value, eligibility.data, onChange]);
  const options = useMemo(() => {
    const teachers = new Map<string, ComboboxOption>();
    for (const page of query.data?.pages ?? [])
      for (const person of page.data) {
        if (tutorsOnlyLocked && !person.isTutor) continue;
        // A person can hold both roles; each label shows alongside the name.
        const roles = [
          person.isTutor ? t('tutor') : null,
          person.isClassTeacher ? t('teacher') : null,
        ].filter(Boolean);
        teachers.set(person.id, {
          value: person.id,
          label: person.display_name || person.full_name || person.id,
          ...(roles.length ? { badge: roles.join(' · ') } : {}),
        });
      }
    if (tutorsOnlyLocked) {
      for (const person of eligibility.data?.data ?? []) {
        if (person.id === value && person.isTutor && !teachers.has(value))
          teachers.set(value, {
            value,
            label: person.display_name || person.full_name || person.id,
            badge: t('tutor'),
          });
      }
    }
    // Preserve a selected label across search pages, without adding arbitrary people to the catalog.
    const current =
      selected?.value === value
        ? selected
        : knownOptions.find((option) => option.value === value);
    if (!tutorsOnlyLocked && value && !teachers.has(value))
      teachers.set(value, current ?? { value, label: t('teacher') });
    return [...teachers.values()];
  }, [
    query.data?.pages,
    value,
    selected,
    knownOptions,
    t,
    tutorsOnlyLocked,
    eligibility.data,
  ]);
  return (
    <div className="space-y-1">
      {!tutorsOnlyLocked && !tutorGroupConfigMissing && (
        <div className="flex items-center gap-2">
          <Switch
            checked={tutorsOnly}
            disabled={disabled}
            id={tutorsOnlyId}
            onCheckedChange={setTutorsOnly}
          />
          <Label className="text-xs" htmlFor={tutorsOnlyId}>
            {t('tutors_only')}
          </Label>
        </div>
      )}
      {tutorGroupConfigMissing && (
        <p className="text-muted-foreground text-xs">
          {t('configure_tutor_group')}
        </p>
      )}
      {cleared && (
        <p role="status" className="text-muted-foreground text-xs">
          {t('non_tutor_selection_cleared')}
        </p>
      )}
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
          setCleared(false);
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
