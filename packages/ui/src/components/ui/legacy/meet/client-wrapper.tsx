'use client';

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

/** The viewer's plans in a grid or a list, with the view choice and paging. */
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
  const [view, setView] = useState<'grid' | 'list'>('list');

  return (
    <div className="space-y-4">
      {plans.length > 0 && (
        <div className="flex justify-end">
          <ViewToggle currentView={view} onViewChange={setView} />
        </div>
      )}
      {view === 'list' ? (
        <PlansListView locale={locale} path={path} plans={plans} user={user} />
      ) : (
        <PlansGrid locale={locale} path={path} plans={plans} user={user} />
      )}
      {totalPages > 1 && (
        <MeetTogetherPagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
        />
      )}
    </div>
  );
}
