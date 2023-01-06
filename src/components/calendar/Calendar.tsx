import { PlayIcon, StopIcon } from '@heroicons/react/24/solid';
import { Divider } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import moment from 'moment';
import { useEffect, useState } from 'react';
import { useCalendar } from '../../hooks/useCalendar';
import CalendarHeader from './CalendarHeader';
import CalendarViewWithTrail from './CalendarViewWithTrail';
import WeekdayBar from './WeekdayBar';

const Calendar = () => {
  const { getCurrentEvents, getUpcomingEvent, isEditing } = useCalendar();
  const events = getCurrentEvents();
  const upcomingEvent = getUpcomingEvent();

  const title =
    events.length >= 1
      ? events.length === 1
        ? events[0].title
        : `${events.length} events`
      : upcomingEvent
      ? upcomingEvent.title
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

  const timeLeft = events.length > 0 ? getTimeLeft(events[0].end_at) : 0;

  const generateColor = () => {
    const eventColor = events?.[0]?.color || 'blue';

    const colors: {
      [key: string]: string;
    } = {
      red: `shadow-red-300/20 border-red-300 text-red-200 bg-red-300/20`,
      blue: `shadow-blue-300/20 border-blue-300 text-blue-200 bg-blue-300/20`,
      green: `shadow-green-300/20 border-green-300 text-green-200 bg-green-300/20`,
      yellow: `shadow-yellow-300/20 border-yellow-300 text-yellow-200 bg-yellow-300/20`,
      orange: `shadow-orange-300/20 border-orange-300 text-orange-200 bg-orange-300/20`,
      purple: `shadow-purple-300/20 border-purple-300 text-purple-200 bg-purple-300/20`,
      pink: `shadow-pink-300/20 border-pink-300 text-pink-200 bg-pink-300/20`,
      indigo: `shadow-indigo-300/20 border-indigo-300 text-indigo-200 bg-indigo-300/20`,
      cyan: `shadow-cyan-300/20 border-cyan-300 text-cyan-200 bg-cyan-300/20`,
      gray: `shadow-gray-300/20 border-gray-300 text-gray-200 bg-gray-300/20`,
    };

    return colors[eventColor];
  };

  const [startAt, setStartAt] = useState<Date | null>(null);
  const [endAt, setEndAt] = useState<Date | null>(null);

  useEffect(() => {
    if (events?.[0]?.end_at) setEndAt(events[0].end_at);
  }, [events]);

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
    if (endAt && events?.[0]?.end_at !== endAt) {
      setEndAt(events?.[0]?.end_at);
      setCurrentCycle(1);
      setStartAt(null);
      setTime(0);
    }
  }, [endAt, events]);

  const startTimer = () => {
    if (startAt) {
      setCurrentCycle(1);
      setStartAt(null);
      setEndAt(null);
      setTime(0);
      return;
    }

    const cycle = timeLeft > totalMinutes * 60 ? totalMinutes * 60 : timeLeft;
    setEndAt(events?.[0].end_at);
    setStartAt(new Date());
    setCurrentCycle(1);
    setTime(cycle);
  };

  useEffect(() => {
    if (time <= 0 && startAt && endAt) {
      const cycle = timeLeft > totalMinutes * 60 ? totalMinutes * 60 : timeLeft;
      setCurrentCycle((prev) => prev + 1);
      setTime(cycle);

      // Play an notification sound
      const audio = new Audio('/media/sounds/alarm.mp3');
      audio.play();

      // If the current cycle is equal to the pomodoro cycles, stop the timer
      if (currentCycle === pomodoroCycles) {
        showNotification({
          title: 'Focus completed!',
          message: `You have completed ${pomodoroCycles} ${
            pomodoroCycles > 1 ? 'cycles' : 'cycle'
          } of focus! (${formatDuration(
            getTimeDuration(startAt, endAt),
            false,
            false
          )})`,
          color: 'teal',
          autoClose: false,
        });

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

  return (
    <div className="flex h-full w-full flex-col border-zinc-800 bg-zinc-900 p-6">
      <CalendarHeader />
      <WeekdayBar />
      <CalendarViewWithTrail />

      {((events && events.length > 0) || upcomingEvent) && (
        <div
          className={`absolute inset-x-8 bottom-4 flex justify-center md:bottom-10 lg:inset-x-16 xl:inset-x-32 ${
            isEditing() && 'pointer-events-none'
          }`}
        >
          <div
            className={`flex max-w-4xl items-center gap-4 rounded-lg border border-opacity-30 px-8 py-2 shadow-xl backdrop-blur-xl ${generateColor()} ${
              isEditing() ? 'opacity-0' : 'opacity-100'
            } ${
              !events?.length && !!upcomingEvent
                ? 'w-[calc(min(20rem,100%))] justify-center text-center'
                : startAt && endAt
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
                  startAt && endAt ? 'absolute opacity-0' : 'block opacity-100'
                }`}
                style={{
                  transition: 'opacity 500ms',
                }}
              >
                <div className="max-w-[12rem] font-semibold line-clamp-1">
                  {title}
                </div>
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
                  {!(startAt && endAt) && (
                    <Divider
                      orientation="vertical"
                      className={`border-opacity-30 ${generateColor()}`}
                    />
                  )}

                  <div>
                    <div className="w-full font-semibold line-clamp-1">
                      {startAt
                        ? `Cycle #${currentCycle} — out of ${pomodoroCycles}`
                        : 'Focused work'}
                    </div>
                    {startAt && endAt ? (
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
                onClick={startTimer}
                className={`aspect-square h-fit justify-self-end rounded-lg border border-opacity-10 p-1 ${generateColor()} transition hover:border-opacity-30 `}
              >
                {startAt ? (
                  <StopIcon className="h-6 w-6" />
                ) : (
                  <PlayIcon className="h-6 w-6" />
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
