'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { MeetTogetherPlanWithParticipants } from './page';
import MeetTogetherPagination from './pagination';
import { PlansGrid } from './plans-grid';
import { PlansListView } from './plans-list-view';
import ViewToggle from './view-toggle';

interface MeetTogetherClientProps {
  plans: MeetTogetherPlanWithParticipants[];
  locale: string;
  totalPages: number;
  totalCount: number;
  currentPage: number;
  pageSize: number;
}

export function MeetTogetherClient({
  plans,
  locale,
  totalPages,
  totalCount,
  currentPage,
  pageSize,
}: MeetTogetherClientProps) {
  const t = useTranslations('meet-together');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  return (
    <>
      {/* View toggle */}
      <div className="mb-6 flex justify-end">
        <ViewToggle currentView={view} onViewChange={setView} />
      </div>

      {/* Plans content */}
      {view === 'list' ? (
        <PlansListView plans={plans} locale={locale} t={t} />
      ) : (
        <PlansGrid plans={plans} locale={locale} t={t} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8">
          <MeetTogetherPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={pageSize}
          />
        </div>
      )}
    </>
  );
}
