'use client';

import { Pagination } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  totalItems: number | null;
}

export default function PaginationIndicator({ totalItems }: Props) {
  const { t } = useTranslation('pagination');

  const activePage = 1;
  const itemsPerPage = 15;

  const totalPages = Math.ceil((totalItems || 0) / itemsPerPage);

  return (
    <div className="flex flex-col items-center justify-between gap-2 py-4 text-center md:flex-row">
      <div className="py-1 text-zinc-700 dark:text-zinc-400">
        {totalItems != null ? (
          totalItems === 0 ? (
            t('no_results') + '.'
          ) : (
            <>
              {t('showing_from')}{' '}
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                {activePage * itemsPerPage - itemsPerPage + 1}
              </span>{' '}
              {t('to')}{' '}
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                {activePage * itemsPerPage > totalItems
                  ? totalItems
                  : activePage * itemsPerPage}
              </span>{' '}
              {t('of')}{' '}
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                {totalItems}
              </span>{' '}
              {t('results')}.
            </>
          )
        ) : (
          t('common:loading')
        )}
      </div>

      <Pagination
        value={activePage}
        // onChange={setActivePage}
        total={totalPages}
        noWrap
      />
    </div>
  );
}
