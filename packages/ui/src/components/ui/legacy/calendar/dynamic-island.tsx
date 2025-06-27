import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { Separator } from '@tuturuuu/ui/separator';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { Play, StopCircle } from 'lucide-react';
import moment from 'moment';
import { useEffect, useState } from 'react';

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

  const firstEventEnd = events?.[0]?.end_at
    ? moment(events[0].end_at).toDate()
    : null;
  const timeLeft = firstEventEnd ? getTimeLeft(firstEventEnd) : 0;

  const [startAt, setStartAt] = useState<Date | null>(null);
  const [endAt, setEndAt] = useState<Date | null>(null);

  useEffect(() => {
    if (events?.[0]?.end_at) setEndAt(firstEventEnd);
  }, [events, firstEventEnd]);

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

  useEffect(() => {
    if (endAt && firstEventEnd !== endAt) {
      setEndAt(firstEventEnd);
      setCurrentCycle(1);
      setStartAt(null);
      setTime(0);
    }
  }, [endAt, firstEventEnd]);

  const startTimer = () => {
    if (startAt) {
      setCurrentCycle(1);
      setStartAt(null);
      setEndAt(null);
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
        setEndAt(null);
        setTime(0);
      }

      return;
    }

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

  const color =
    (isUpcoming ? upcomingEvent?.color : events?.[0]?.color) ?? 'BLUE';
  const { bg, text } = getEventStyles(color);

  return (
    <div
      className={`absolute inset-x-8 bottom-4 flex justify-center md:bottom-10 lg:inset-x-16 xl:inset-x-32 ${
        hidden && 'pointer-events-none'
      }`}
    >
      <div
        className={`flex max-w-4xl items-center gap-4 rounded-lg border px-8 py-2 shadow-xl backdrop-blur-xl ${bg} ${text} ${hidden ? 'opacity-0' : 'opacity-100'} ${
          isUpcoming
            ? 'w-[calc(min(20rem,100%))] justify-center text-center'
            : isRunning
              ? 'w-[calc(min(30rem,100%))] justify-between'
              : 'w-full justify-between'
        } duration-300`}
        style={{
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
                <Separator orientation="vertical" className={bg} />
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
            className={`aspect-square h-fit justify-self-end rounded-lg border p-1 ${bg} transition`}
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
