'use client';

import { Button } from '@tuturuuu/ui/button';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import dayjs from 'dayjs';
import { useState } from 'react';

const InnerComponent = () => {
  const {
    data,
    googleData,
    dates,
    error,
    currentView,
    syncToTuturuuu,
    setCurrentView,
  } = useCalendarSync();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    phase: 'get' | 'fetch' | 'delete' | 'upsert' | 'complete';
    percentage: number;
    statusMessage: string;
    changesMade: boolean;
  }>({
    phase: 'complete',
    percentage: 100,
    statusMessage: '',
    changesMade: false,
  });

  const handleSyncToTuturuuu = async () => {
    setIsSyncing(true);
    setSyncProgress({
      phase: 'get',
      percentage: 0,
      statusMessage: 'Starting sync...',
      changesMade: false,
    });

    try {
      await syncToTuturuuu((progress) => {
        setSyncProgress({
          phase: progress.phase,
          percentage: progress.percentage,
          statusMessage: progress.statusMessage,
          changesMade: progress.changesMade,
        });
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Button
          variant={currentView === 'day' ? undefined : 'outline'}
          onClick={() => setCurrentView('day')}
          disabled={currentView === 'day'}
        >
          Switch to day
        </Button>
        <Button
          variant={currentView === '4-day' ? undefined : 'outline'}
          onClick={() => setCurrentView('4-day')}
          disabled={currentView === '4-day'}
        >
          Switch to 4-day
        </Button>
        <Button
          variant={currentView === 'week' ? undefined : 'outline'}
          onClick={() => setCurrentView('week')}
          disabled={currentView === 'week'}
        >
          Switch to week
        </Button>
        <Button
          variant={currentView === 'month' ? undefined : 'outline'}
          onClick={() => setCurrentView('month')}
          disabled={currentView === 'month'}
        >
          Switch to month
        </Button>
      </div>

      {/* Add sync progress bar when syncing */}
      {isSyncing && (
        <>
          <Separator className="my-2" />
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-green-700 dark:text-green-400">
                {syncProgress.statusMessage}
              </span>
              <span className="text-green-700 dark:text-green-400">
                {Math.round(syncProgress.percentage)}%
              </span>
            </div>
            <Progress
              value={syncProgress.percentage}
              className="h-1.5 w-full"
            />
          </div>
          <Separator className="my-2" />
        </>
      )}

      <Button onClick={handleSyncToTuturuuu}>Sync to Tuturuuu</Button>

      {data && (
        <>
          <Separator className="my-2" />
          <div>
            {data.map((event) => (
              <div key={event.id}>{event.title}</div>
            ))}
          </div>
        </>
      )}

      {googleData && (
        <>
          <Separator className="my-2" />
          <div>
            {googleData.map((event) => (
              <div key={event.google_event_id}>{event.title}</div>
            ))}
          </div>
        </>
      )}

      {dates && (
        <>
          <Separator className="my-2" />
          <div>
            {dates.map((date) => (
              <div key={date.toISOString()}>
                {dayjs(date).format('YYYY-MM-DD')}
              </div>
            ))}
          </div>
        </>
      )}

      {error && (
        <>
          <Separator className="my-2" />
          <div>{error.message}</div>
          <Separator className="my-2" />
        </>
      )}
    </div>
  );
};

export const CalendarActiveSyncDebugger = ({}: { wsId: string }) => {
  return <InnerComponent />;
};
