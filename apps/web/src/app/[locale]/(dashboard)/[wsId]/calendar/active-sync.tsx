'use client';

import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import dayjs from 'dayjs';
import { useState } from 'react';

const InnerComponent = () => {
  const { data, googleData, dates, error } = useCalendarSync();

  return (
    <div>
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

export const CalendarActiveSyncDebugger = () => {
  const [isDebuggingOpen, setIsDebuggingOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <Switch
            checked={isDebuggingOpen}
            onCheckedChange={setIsDebuggingOpen}
          />
          <span>Show Debugger</span>
        </label>
      </div>
      {isDebuggingOpen && <InnerComponent />}
    </>
  );
};
