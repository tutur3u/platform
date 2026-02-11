'use client';

import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { timetzToHour } from '@tuturuuu/utils/date-helper';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useMemo, useState } from 'react';
import DayPlanners from './day-planners';
import TimeColumn from './time-column';

function DatePlanner({
  timeblocks,
  dates,
  start,
  end,
  editable = false,
  disabled = false,
  showBestTimes = false,
  onBestTimesStatusByDateAction,
}: {
  timeblocks: Timeblock[];
  dates?: string[];
  start?: string;
  end?: string;
  editable?: boolean;
  disabled?: boolean;
  showBestTimes?: boolean;
  onBestTimesStatusByDateAction?: (status: Record<string, boolean>) => void;
}) {
  const t = useTranslations('meet-together-plan-details');
  const { user, editing, endEditing, setPreviewDate } = useTimeBlocking();
  const [tentativeMode, setTentativeMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const isMobile = useIsMobile();

  const startHour = useMemo(() => timetzToHour(start), [start]);
  const endHour = useMemo(() => timetzToHour(end), [end]);

  useEffect(() => {
    setCurrentPage(0);
  }, []);

  // Pagination logic
  const maxDatesPerPage = useMemo(() => (isMobile ? 4 : 7), [isMobile]);
  const totalPages = useMemo(
    () => (dates ? Math.ceil(dates.length / maxDatesPerPage) : 0),
    [dates, maxDatesPerPage]
  );

  useEffect(() => {
    if (totalPages > 0 && currentPage >= totalPages) {
      setCurrentPage(totalPages - 1);
    }
  }, [totalPages, currentPage]);

  const currentDates = useMemo(
    () =>
      dates
        ? dates.slice(
            currentPage * maxDatesPerPage,
            (currentPage + 1) * maxDatesPerPage
          )
        : [],
    [dates, currentPage, maxDatesPerPage]
  );

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1));
  };

  const canGoPrevious = currentPage > 0;
  const canGoNext = currentPage < totalPages - 1;

  if (!startHour || !endHour) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex items-center justify-center">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      {editable && (
        <div className="flex justify-center">
          <Tabs
            value={tentativeMode ? 'tentative' : 'available'}
            onValueChange={(value) => setTentativeMode(value === 'tentative')}
          >
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-1">
              <TabsTrigger
                value="available"
                className={cn(
                  'flex items-center gap-2 transition-all duration-300',
                  'data-[state=active]:bg-background data-[state=active]:text-dynamic-green data-[state=active]:shadow-md',
                  'hover:border-border/50 hover:bg-accent/60',
                  'rounded-md border border-transparent px-4 py-2'
                )}
              >
                {t('available')}
              </TabsTrigger>
              <TabsTrigger
                value="tentative"
                className={cn(
                  'flex items-center gap-2 transition-all duration-300',
                  'data-[state=active]:bg-background data-[state=active]:text-dynamic-yellow data-[state=active]:shadow-md',
                  'hover:border-border/50 hover:bg-accent/60',
                  'rounded-md border border-transparent px-4 py-2'
                )}
              >
                {t('tentative')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      <div
        onMouseUp={
          editable
            ? (e) => {
                e.preventDefault();
                endEditing();
              }
            : undefined
        }
        onMouseLeave={
          editable
            ? (e) => {
                e.preventDefault();
                endEditing();
              }
            : undefined
        }
        onTouchEnd={
          editable
            ? () => {
                if (!editing.enabled) return;
                endEditing();
              }
            : undefined
        }
        className="mt-4 flex items-start justify-center gap-2"
      >
        {dates && (
          <div
            className="flex flex-col items-start justify-start gap-4 overflow-x-auto"
            onMouseLeave={
              editable
                ? undefined
                : (e) => {
                    e.preventDefault();
                    setPreviewDate(null);
                  }
            }
          >
            {/* Responsive fixed-width container for dates section - smaller widths to prevent overflow */}
            <div className="w-[350px] max-w-full overflow-hidden sm:w-[350px] md:w-[400px] lg:w-[450px] xl:w-[500px]">
              <div className="relative">
                {/* Scrollable content with sticky header */}
                <div className="max-h-[50vh] overflow-y-auto">
                  <div className="flex gap-2">
                    <TimeColumn
                      id={editable ? 'self' : 'group'}
                      start={startHour}
                      end={endHour}
                      className="flex-initial"
                    />

                    <DayPlanners
                      timeblocks={timeblocks}
                      dates={currentDates}
                      start={startHour}
                      end={endHour}
                      editable={editable}
                      disabled={editable ? (user ? disabled : true) : disabled}
                      showBestTimes={showBestTimes}
                      tentativeMode={tentativeMode}
                      onBestTimesStatusByDateAction={
                        onBestTimesStatusByDateAction
                      }
                      hideHeaders={false}
                      stickyHeader={true}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Pagination controls - positioned below the plan */}
            {totalPages > 1 && (
              <div className="flex w-full items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handlePreviousPage}
                  disabled={!canGoPrevious}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border transition-all',
                    canGoPrevious
                      ? 'cursor-pointer border-foreground/20 hover:bg-accent/50'
                      : 'cursor-not-allowed border-foreground/10 text-foreground/30'
                  )}
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="text-foreground/60 text-sm">
                  {currentPage + 1} of {totalPages}
                </div>

                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!canGoNext}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border transition-all',
                    canGoNext
                      ? 'cursor-pointer border-foreground/20 hover:bg-accent/50'
                      : 'cursor-not-allowed border-foreground/10 text-foreground/30'
                  )}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(DatePlanner);
