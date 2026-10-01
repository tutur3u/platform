import { Play, StopCircle } from '@tuturuuu/icons';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { Separator } from '@tuturuuu/ui/separator';
import { calendarEventStyle } from '@tuturuuu/utils/calendar-event-colors';
import moment from 'moment';
import { useEffect, useMemo, useState } from 'react';

export const DynamicIsland = () => {
  const { getCurrentEvents, getUpcomingEvent, isEditing } = useCalendar();

  const events = getCurrentEvents();
  const upcomingEvent = getUpcomingEvent();

  const title =
    events.length >= 1
      ? events.length === 1
        ? events?.[0]?.title || 'Unnamed Event'
        : `${events.length} events`
      : upcomingEvent
        ? upcomingEvent.title || 'Unnamed Event'
        : 'No events';

  const getTimeDuration = (start: Date, end: Date) => {
    const timeDuration = end.getTime() - start.getTime();
    return Math.floor(timeDuration / 1000);
  };

  const getTimeLeft = (endTime: Date) => {
    const now = new Date();
    const end = new Date(endTime);

    const timeLeft = end.getTime() - now.getTime();
    return Math.floor(timeLeft / 1000);
  };

  const formatDuration = (
    duration: number,
    showSeconds = false,
    showMinutes = true
  ) => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration - hours * 3600) / 60);
    const seconds = duration - hours * 3600 - minutes * 60;

    const hoursString = hours > 0 ? `${hours.toFixed(0)}h ` : '';
    const minutesString =
      minutes > 0 ? `${minutes.toFixed(0)}m ` : showMinutes ? '0m ' : '';
    const secondsString =
      ((showSeconds && hours === 0) || minutes === 0) && seconds > 0
        ? `${seconds.toFixed(0)}s `
        : '';

    return `${hoursString}${minutesString}${secondsString}`.trimEnd();
  };

  const firstEventEndAt = events?.[0]?.end_at;
  const firstEventEnd = useMemo(
    () => (firstEventEndAt ? moment(firstEventEndAt).toDate() : null),
    [firstEventEndAt]
  );
  const timeLeft = firstEventEnd ? getTimeLeft(firstEventEnd) : 0;

  const [startAt, setStartAt] = useState<Date | null>(null);
  const [endAt, setEndAt] = useState<Date | null>(null);

  const focusMinutes = 25;
  const breakMinutes = 5;

  const totalMinutes = focusMinutes + breakMinutes;

  const pomodoroCycles = Math.ceil(
    endAt
      ? getTimeDuration(startAt || new Date(), endAt) / 60 / totalMinutes
      : 0
  );

  const [currentCycle, setCurrentCycle] = useState(1);
  const [time, setTime] = useState(0);

  const firstEventId = events?.[0]?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: A different event with the same deadline starts a new session.
  useEffect(() => {
    setEndAt(firstEventEnd);
    setCurrentCycle(1);
    setStartAt(null);
    setTime(0);
  }, [firstEventId, firstEventEnd]);

  const startTimer = () => {
    if (startAt) {
      setCurrentCycle(1);
      setStartAt(null);
      setTime(0);
      return;
    }

    const cycle = timeLeft > totalMinutes * 60 ? totalMinutes * 60 : timeLeft;
    setEndAt(firstEventEnd);
    setStartAt(new Date());
    setCurrentCycle(1);
    setTime(cycle);
  };

  useEffect(() => {
    if (time <= 0 && startAt && endAt) {
      const cycle = timeLeft > totalMinutes * 60 ? totalMinutes * 60 : timeLeft;
      setCurrentCycle((prev) => prev + 1);
      setTime(cycle);

      // Play a notification sound
      const audio = new Audio('/media/sounds/alarm.mp3');
      audio.play();

      // If the current cycle is equal to the pomodoro cycles, stop the timer
      if (currentCycle === pomodoroCycles) {
        // showNotification({
        //   title: 'Focus completed!',
        //   message: `You have completed ${pomodoroCycles} ${
        //     pomodoroCycles > 1 ? 'cycles' : 'cycle'
        //   } of focus! (${formatDuration(
        //     getTimeDuration(startAt, endAt),
        //     false,
        //     false
        //   )})`,
        //   color: 'teal',
        //   autoClose: false,
        // });

        setStartAt(null);
        setTime(0);
      }

      return;
    }

    if (!startAt || !endAt || time <= 0) return;

    const interval = setInterval(() => {
      setTime(time - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [
    time,
    startAt,
    endAt,
    currentCycle,
    pomodoroCycles,
    timeLeft,
    totalMinutes,
  ]);

  const isRunning = startAt && endAt;
  const isUpcoming = events?.length === 0 && !!upcomingEvent;

  const hasEvents = events?.length > 0 || !!upcomingEvent;
  const hidden = isEditing() || !hasEvents;

  const activeEvent = isUpcoming ? upcomingEvent : events?.[0];
  const eventStyle = calendarEventStyle(activeEvent ?? {});

  return (
    <div
      className={`absolute inset-x-8 bottom-4 flex justify-center md:bottom-10 lg:inset-x-16 xl:inset-x-32 ${
        hidden && 'pointer-events-none'
      }`}
    >
      <div
        className={`flex max-w-4xl items-center gap-4 rounded-lg border px-8 py-2 shadow-xl backdrop-blur-xl ${hidden ? 'opacity-0' : 'opacity-100'} ${
          isUpcoming
            ? 'w-[calc(min(20rem,100%))] justify-center text-center'
            : isRunning
              ? 'w-[calc(min(30rem,100%))] justify-between'
              : 'w-full justify-between'
        } duration-300`}
        style={{
          ...eventStyle,
          borderColor: eventStyle.color,
          transition: 'width 1s, opacity 300ms',
        }}
      >
        <div className="flex gap-4">
          <div
            className={`${
              isRunning ? 'absolute opacity-0' : 'block opacity-100'
            }`}
            style={{
              transition: 'opacity 500ms',
            }}
          >
            <div className="line-clamp-1 max-w-48 font-semibold">{title}</div>
            {events && events.length > 0 ? (
              <div>{formatDuration(timeLeft)} left</div>
            ) : (
              upcomingEvent && (
                <div>{moment(upcomingEvent.start_at).fromNow()}</div>
              )
            )}
          </div>

          {pomodoroCycles > 0 && (
            <>
              {!isRunning && (
                <Separator
                  orientation="vertical"
                  style={{ backgroundColor: eventStyle.color }}
                />
              )}

              <div>
                <div className="line-clamp-1 w-full font-semibold">
                  {startAt
                    ? `Cycle #${currentCycle} — out of ${pomodoroCycles}`
                    : 'Focused work'}
                </div>
                {isRunning ? (
                  <div>{formatDuration(time, true)}</div>
                ) : (
                  <div className="line-clamp-1">
                    <span className="font-semibold">
                      {pomodoroCycles} cycles
                    </span>{' '}
                    can be completed.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {pomodoroCycles > 0 && (
          <button
            type="button"
            onClick={startTimer}
            className="aspect-square h-fit justify-self-end rounded-lg border p-1 transition hover:ring-1 hover:ring-current"
            style={{ ...eventStyle, borderColor: eventStyle.color }}
          >
            {startAt ? (
              <StopCircle className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};
