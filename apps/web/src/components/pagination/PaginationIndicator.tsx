'use client';

import { Pagination } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  key?: string;
  count?: number;
}

const PaginationIndicator = ({ key, count }: Props) => {
  const { t } = useTranslation('pagination');

  const totalPages = Math.ceil((count || 0) / itemsPerPage);

  return (
    <div className="flex flex-col items-center justify-between gap-2 py-4 text-center md:flex-row">
      <div className="py-1 text-zinc-700 dark:text-zinc-400">
        {count != null ? (
          count === 0 ? (
            t('no_results') + '.'
          ) : (
            <>
              {t('showing_from')}{' '}
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                {activePage * itemsPerPage - itemsPerPage + 1}
              </span>{' '}
              {t('to')}{' '}
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                {activePage * itemsPerPage > count
                  ? count
                  : activePage * itemsPerPage}
              </span>{' '}
              {t('of')}{' '}
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                {count}
              </span>{' '}
              {t('results')}.
            </>
          )
        ) : (
          t('common:loading')
        )}
      </div>

      <Pagination total={totalPages} noWrap />
    </div>
  );
};

export default PaginationIndicator;
