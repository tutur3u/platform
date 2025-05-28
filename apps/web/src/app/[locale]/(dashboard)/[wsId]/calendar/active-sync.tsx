'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  CalendarSyncProvider,
  useCalendarSync,
} from '@tuturuuu/ui/hooks/use-calendar-sync';
import { Separator } from '@tuturuuu/ui/separator';

const InnerComponent = () => {
  const {
    data,
    googleData,
    error,
    currentView,
    syncToTuturuuu,
    setCurrentView,
  } = useCalendarSync();
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

      <Button onClick={syncToTuturuuu}>Sync to Tuturuuu</Button>

      {data && (
        <>
          <Separator className="my-2" />
          <div>
            {data.map((event) => (
              <div key={event.id}>{event.title}</div>
            ))}
          </div>
          <Separator className="my-2" />
        </>
      )}

      {googleData && (
        <>
          <Separator className="my-2" />
          <div>
            {googleData.map((event) => (
              <div key={event.id}>{event.title}</div>
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

export const CalendarActiveSyncDebugger = ({ wsId }: { wsId: string }) => {
  return (
    <CalendarSyncProvider wsId={wsId}>
      <InnerComponent />
    </CalendarSyncProvider>
  );
};
