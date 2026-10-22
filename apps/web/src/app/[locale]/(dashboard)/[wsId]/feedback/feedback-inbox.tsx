'use client';

import { useQuery } from '@tanstack/react-query';
import {
  checkProductFeedbackEligibility,
  getProductFeedback,
  listProductFeedback,
  type ProductFeedbackListQuery,
} from '@tuturuuu/internal-api/product-feedback';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FeedbackMedia } from './feedback-media';

type View = NonNullable<ProductFeedbackListQuery['view']>;
export function FeedbackInbox({
  actor,
  mediaEnabled = false,
}: {
  actor: string;
  mediaEnabled?: boolean;
}) {
  const t = useTranslations('product-feedback');
  const [view, setView] = useState<View>('inbox');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const eligibility = useQuery({
    queryKey: ['product-feedback', actor, 'eligibility'],
    queryFn: () => checkProductFeedbackEligibility(),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const filters: ProductFeedbackListQuery = {
    view,
    q: query,
    limit: 25,
    cursor,
    ...(status === 'open' || status === 'resolved' ? { status } : {}),
  };
  const list = useQuery({
    queryKey: ['product-feedback', actor, 'list', filters],
    queryFn: () => listProductFeedback(filters),
    enabled: eligibility.isSuccess,
    retry: false,
    gcTime: 0,
  });
  const detail = useQuery({
    queryKey: ['product-feedback', actor, 'detail', selected],
    queryFn: () => getProductFeedback(selected ?? ''),
    enabled: eligibility.isSuccess && !!selected && list.isSuccess,
    retry: false,
    gcTime: 0,
  });
  function resetPage() {
    setCursor(undefined);
    setSelected(undefined);
  }
  const accessLost = eligibility.isError || list.isError || detail.isError;
  return (
    <section className="space-y-4">
      <header>
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('private')}</p>
      </header>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          resetPage();
          setQuery(search.trim());
        }}
      >
        <select
          aria-label={t('view')}
          className="rounded-md border bg-background p-2"
          value={view}
          onChange={(event) => {
            const value = event.target.value;
            if (
              value === 'inbox' ||
              value === 'resolved' ||
              value === 'archive' ||
              value === 'all'
            ) {
              setView(value);
              setStatus('');
              resetPage();
            }
          }}
        >
          {(['inbox', 'resolved', 'archive', 'all'] as const).map((value) => (
            <option key={value} value={value}>
              {t(value)}
            </option>
          ))}
        </select>
        {(view === 'archive' || view === 'all') && (
          <select
            aria-label={t('status')}
            className="rounded-md border bg-background p-2"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              resetPage();
            }}
          >
            <option value="">{t('all-statuses')}</option>
            <option value="open">{t('open')}</option>
            <option value="resolved">{t('resolved')}</option>
          </select>
        )}
        <Input
          aria-label={t('search')}
          placeholder={t('search')}
          value={search}
          maxLength={160}
          className="max-w-sm"
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit">{t('search')}</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            resetPage();
            void eligibility.refetch();
            void list.refetch();
          }}
        >
          {t('refresh')}
        </Button>
      </form>
      {accessLost ? (
        <p role="alert">{t('unavailable')}</p>
      ) : eligibility.isPending || list.isPending ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            {list.data?.items.length === 0 && <p>{t('empty')}</p>}
            <ul className="space-y-2">
              {list.data?.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={selected === item.id}
                    className="w-full rounded-md border p-3 text-left hover:bg-muted"
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="block break-words font-medium">
                      {item.title}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {t(item.status)} · {item.createdAt}
                      {item.archivedAt ? ` · ${t('archive')}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!cursor}
                onClick={() => {
                  resetPage();
                }}
              >
                {t('first')}
              </Button>
              <Button
                variant="outline"
                disabled={!list.data?.nextCursor}
                onClick={() => {
                  setCursor(list.data?.nextCursor ?? undefined);
                  setSelected(undefined);
                }}
              >
                {t('next')}
              </Button>
            </div>
          </div>
          <article className="min-w-0 rounded-md border p-4" aria-live="polite">
            {!selected ? (
              <p>{t('select')}</p>
            ) : detail.isPending ? (
              <p role="status">{t('loading')}</p>
            ) : (
              detail.data && (
                <>
                  {mediaEnabled && (
                    <FeedbackMedia
                      key={selected}
                      actor={actor}
                      id={detail.data.id}
                    />
                  )}
                  <h2 className="break-words font-semibold">
                    {detail.data.title}
                  </h2>
                  <p className="my-4 whitespace-pre-wrap break-words">
                    {detail.data.body}
                  </p>
                  <dl className="space-y-2 text-sm">
                    <dt>{t('status')}</dt>
                    <dd>{t(detail.data.status)}</dd>
                    <dt>{t('created')}</dt>
                    <dd>{detail.data.createdAt}</dd>
                    <dt>{t('updated')}</dt>
                    <dd>{detail.data.updatedAt}</dd>
                    <dt>{t('archived')}</dt>
                    <dd>{detail.data.archivedAt ?? t('none')}</dd>
                    <dt>{t('revision')}</dt>
                    <dd>{detail.data.revision}</dd>
                  </dl>
                  <p className="mt-4 text-muted-foreground text-sm">
                    {t('read-only')}
                  </p>
                </>
              )
            )}
          </article>
        </div>
      )}
    </section>
  );
}
