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
  user?: { id: string } | null;
  path?: string;
}

export function MeetTogetherClient({
  plans,
  locale,
  totalPages,
  totalCount,
  currentPage,
  pageSize,
  user,
  path,
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
        <PlansListView
          path={path}
          plans={plans}
          locale={locale}
          t={t}
          user={user}
        />
      ) : (
        <PlansGrid
          path={path}
          plans={plans}
          locale={locale}
          t={t}
          user={user}
        />
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
