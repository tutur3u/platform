import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useWorkspaces } from './useWorkspaces';
import useSWR, { mutate as swrMutate } from 'swr';
import { CalendarEvent } from '../types/primitives/CalendarEvent';
import moment from 'moment';
import useTranslation from 'next-translate/useTranslation';
import 'moment/locale/vi';
import { useRouter } from 'next/router';

const CalendarContext = createContext({
  refresh: async () => console.log('refresh'),
  getDate: () => new Date(),
  getTitle: () => 'Title' as string,

  isToday: () => true as boolean,
  selectToday: () => console.log('selectToday'),
  selectDate: (date: Date) => console.log('selectDate', date),

  handleNext: () => console.log('handleNext'),
  handlePrev: () => console.log('handlePrev'),

  view: 'day' as 'day' | '4-days' | 'week',
  datesInView: [] as Date[],
  availableViews: [] as { label: string; value: string; disabled?: boolean }[],
  setAvailableViews: (
    views: {
      label: string;
      value: string;
      disabled?: boolean;
    }[]
  ) => console.log('setAvailableViews', views),
  enableDayView: () => console.log('enableDayView'),
  enable4DayView: () => console.log('enable4DayView'),
  enableWeekView: () => console.log('enableWeekView'),

  getEvent: (eventId: string) => {
    console.log('getEvent', eventId);
    return undefined as CalendarEvent | undefined;
  },

  getCurrentEvents: () => [] as CalendarEvent[],
  getUpcomingEvent: () => undefined as CalendarEvent | undefined,

  getEvents: () => [] as CalendarEvent[],

  getEventLevel: (eventId: string) => {
    console.log('getEventLevel', eventId);
    return 0 as number;
  },

  addEvent: (event: CalendarEvent) => console.log('addEvent', event),
  addEmptyEvent: (date: Date) => {
    console.log('addEmptyEvent', date);
    return {} as CalendarEvent | undefined;
  },
  updateEvent: (eventId: string, data: Partial<CalendarEvent>) =>
    console.log('updateEvent', eventId, data),
  deleteEvent: (eventId: string) => console.log('deleteEvent', eventId),

  getModalStatus: (id: string) => {
    console.log('getModalStatus', id);
    return false as boolean;
  },
  getActiveEvent: () => {
    console.log('getActiveEvent');
    return undefined as CalendarEvent | undefined;
  },
  isModalActive: () => false as boolean,
  isEditing: () => false as boolean,
  openModal: (id: string) => console.log('openModal', id),
  closeModal: () => console.log('closeModal'),

  hideModal: () => console.log('hideModal'),
  showModal: () => console.log('showModal'),
});

export const CalendarProvider = ({ children }: { children: ReactNode }) => {
  const [date, setDate] = useState(new Date());

  const { ws } = useWorkspaces();

  const [datesInView, setDatesInView] = useState<Date[]>([]);
  const [view, setView] = useState<'day' | 'week' | '4-days'>('week');

  const getDateRangeQuery = () => {
    if (!datesInView.length) return '';

    const startAt = datesInView[0];
    const endAt = datesInView[datesInView.length - 1];

    return `?start_at=${startAt.toISOString()}&end_at=${endAt.toISOString()}`;
  };

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/calendar/events${getDateRangeQuery()}`
    : null;

  const { data, mutate } = useSWR<{
    data: CalendarEvent[];
    count: number;
  }>(apiPath);

  const router = useRouter();

  const refresh = useCallback(async () => await swrMutate(apiPath), [apiPath]);

  useEffect(() => {
    if (router.pathname === '/[wsId]/calendar') refresh();
  }, [router.pathname, refresh]);

  const events = useMemo(() => data?.data ?? [], [data]);

  const [openedModalId, setOpenedModalId] = useState<string | null>(null);
  const [lastCreatedEventId, setLastCreatedEventId] = useState<string | null>(
    null
  );

  const getEvent = useCallback(
    (eventId: string) => events.find((e) => e.id === eventId),
    [events]
  );

  const getCurrentEvents = useCallback(() => {
    const now = new Date();

    // Get events that is happening right now
    return events.filter((e) => {
      const start = e.start_at;
      const end = e.end_at;

      const startDate = moment(start).toDate();
      const endDate = moment(end).toDate();

      const isSameDay =
        startDate.getDate() === now.getDate() &&
        startDate.getMonth() === now.getMonth() &&
        startDate.getFullYear() === now.getFullYear();

      return isSameDay && startDate <= now && endDate >= now;
    });
  }, [events]);

  const getUpcomingEvent = useCallback(() => {
    const now = new Date();

    // Get the next event that is happening
    return events.find((e) => {
      const start = e.start_at;
      const end = e.end_at;

      const startDate = moment(start).toDate();
      const endDate = moment(end).toDate();

      const isSameDay =
        startDate.getDate() === now.getDate() &&
        startDate.getMonth() === now.getMonth() &&
        startDate.getFullYear() === now.getFullYear();

      return isSameDay && startDate > now && endDate > now;
    });
  }, [events]);

  const getEvents = useCallback(() => events, [events]);

  const getLevel = useCallback(
    (events: CalendarEvent[], eventId: string): number => {
      const event = events.find((e) => e.id === eventId);
      if (!event) return 0;

      const eventIndex = events.findIndex((e) => e.id === eventId);

      const prevEvents = events.slice(0, eventIndex).filter((e) => {
        // If the event is the same
        if (e.id === eventId) return false;

        // If the event is not on the same day
        if (
          moment(e.start_at).toDate().getDate() !==
          moment(event.start_at).toDate().getDate()
        )
          return false;

        // If the event ends before the current event starts,
        // or if the event starts after the current event ends
        if (e.end_at <= event.start_at || e.start_at >= event.end_at)
          return false;

        return true;
      });

      if (prevEvents.length === 0) return 0;

      const prevEventLevels = prevEvents.map((e) => getLevel(events, e.id));
      return Math.max(...prevEventLevels) + 1;
    },
    []
  );

  const getEventLevel = useCallback(
    (eventId: string) => getLevel(events, eventId),
    [events, getLevel]
  );

  const addEvent = async (event: CalendarEvent) => {
    if (!apiPath) return;

    try {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      if (!res.ok) {
        throw new Error('Failed to add event');
      }

      const { id: eventId } = await res.json();
      await refresh();

      setOpenedModalId(eventId);
      setLastCreatedEventId(eventId);
    } catch (err) {
      console.error(err);
    }
  };

  const addEmptyEvent = (date: Date) => {
    if (lastCreatedEventId) {
      setLastCreatedEventId(null);
      setOpenedModalId(null);
      return;
    }

    const start_at = new Date(date);
    const end_at = new Date(date);
    end_at.setHours(end_at.getHours() + 1);

    const event: CalendarEvent = {
      id: crypto.randomUUID(),
      start_at: start_at.toISOString(),
      end_at: end_at.toISOString(),
      local: true,
    };

    addEvent(event);

    return event;
  };

  const updateEvent = useCallback(
    async (eventId: string, data: Partial<CalendarEvent>) => {
      if (!ws) return;

      mutate((prev) => {
        const newEvents =
          prev?.data
            .map((e) => {
              if (e.id !== eventId) return e;

              if (
                (data.title !== undefined && data.title !== e.title) ||
                (data.description !== undefined &&
                  data.description !== e.description) ||
                (data.start_at !== undefined &&
                  !moment(data.start_at).isSame(e.start_at)) ||
                (data.end_at !== undefined &&
                  !moment(data.end_at).isSame(e.end_at)) ||
                (data.color !== undefined && data.color !== e.color)
              ) {
                return { ...e, ...data, local: true };
              }

              return { ...e, ...data };
            })
            .sort((a, b) => {
              if (a.start_at === b.end_at || a.end_at === b.start_at) return 0;
              if (a.start_at < b.start_at) return -1;
              if (a.start_at > b.start_at) return 1;
              if (a.end_at < b.end_at) return 1;
              if (a.end_at > b.end_at) return -1;
              return 0;
            }) ?? [];

        return { data: newEvents, count: newEvents?.length ?? 0 };
      }, false);
    },
    [ws, mutate]
  );

  const deleteEvent = async (eventId: string) => {
    if (!ws) return;

    mutate((prev) => {
      const newEvents = prev?.data.filter((e) => e.id !== eventId) ?? [];
      return { data: newEvents, count: newEvents?.length ?? 0 };
    }, false);

    try {
      const res = await fetch(
        `/api/workspaces/${ws.id}/calendar/events/${eventId}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        mutate((prev) => {
          const newEvents = prev?.data.filter((e) => e.id !== eventId) ?? [];
          return { data: newEvents, count: newEvents?.length ?? 0 };
        }, false);

        throw new Error('Failed to delete event');
      }

      await refresh();
    } catch (err) {
      console.error(err);
    }

    setLastCreatedEventId(null);
    setOpenedModalId(null);
  };

  const getDate = () => date;

  const { lang } = useTranslation('calendar');

  const getTitle = () =>
    moment(date)
      .locale(lang)
      .format(lang === 'vi' ? 'MMMM, YYYY' : 'MMMM YYYY')
      .replace(/^\w/, (c) => c.toUpperCase());

  // Update the date's hour and minute, every minute
  useEffect(() => {
    // calculate seconds to next minute
    const secondsToNextMinute = 60 - new Date().getSeconds();

    // Make sure the date is updated at the start of the next minute
    const timeout = setTimeout(() => {
      setDate((date) => {
        const newDate = new Date(date);

        newDate.setHours(new Date().getHours());
        newDate.setMinutes(new Date().getMinutes());

        return newDate;
      });

      // And then update it every minute
      const interval = setInterval(() => {
        setDate((date) => {
          const newDate = new Date(date);

          newDate.setHours(new Date().getHours());
          newDate.setMinutes(new Date().getMinutes());

          return newDate;
        });
      }, 60000);

      return () => clearInterval(interval);
    }, secondsToNextMinute * 1000);

    return () => clearTimeout(timeout);
  }, []);

  const isToday = () => {
    const today = new Date();
    return date?.toDateString() === today.toDateString();
  };

  const selectDate = (date: Date) => {
    setDate(date);
  };

  const selectToday = () => {
    setDate(new Date());
  };

  const [availableViews, setAvailableViews] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >([]);

  const enableDayView = useCallback(() => {
    if (availableViews.find((v) => v.value === 'day')?.disabled) return;

    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    setDatesInView([newDate]);
    setView('day');
  }, [date, availableViews]);

  const enable4DayView = useCallback(() => {
    if (availableViews.find((v) => v.value === '4-days')?.disabled) return;

    const dates = [];

    for (let i = 0; i < 4; i++) {
      const newDate = new Date(date);
      newDate.setHours(0, 0, 0, 0);
      newDate.setDate(newDate.getDate() + i);
      dates.push(newDate);
    }

    setDatesInView(dates);
    setView('4-days');
  }, [date, availableViews]);

  const enableWeekView = useCallback(() => {
    if (availableViews.find((v) => v.value === 'week')?.disabled) return;

    const getMonday = () => {
      const day = date.getDay() || 7;
      const newDate = new Date(date);
      if (day !== 1) newDate.setHours(-24 * (day - 1));
      return newDate;
    };

    const getWeekdays = () => {
      const monday = getMonday();
      const dates = [];

      for (let i = 0; i < 7; i++) {
        const newDate = new Date(monday);
        newDate.setHours(0, 0, 0, 0);
        newDate.setDate(newDate.getDate() + i);
        dates.push(newDate);
      }
      return dates;
    };

    setDatesInView(getWeekdays());
    setView('week');
  }, [date, availableViews]);

  useEffect(() => {
    const updateDatesInView = () => {
      if (
        datesInView.length === 7 &&
        availableViews.find((v) => v.value === 'week')?.disabled === false
      )
        enableWeekView();
      else if (
        datesInView.length === 4 &&
        availableViews.find((v) => v.value === '4-days')?.disabled === false
      )
        enable4DayView();
      else enableDayView();
    };

    updateDatesInView();
  }, [
    view,
    date,
    datesInView.length,
    availableViews,
    enableDayView,
    enable4DayView,
    enableWeekView,
  ]);

  const handleNext = () =>
    setDate((date) => {
      const newDate = new Date(date);
      newDate.setDate(newDate.getDate() + datesInView.length);
      return newDate;
    });

  const handlePrev = () =>
    setDate((date) => {
      const newDate = new Date(date);
      newDate.setDate(newDate.getDate() - datesInView.length);
      return newDate;
    });

  // Set the initial view to week view
  useEffect(() => {
    if (datesInView.length !== 0) return;
    if (window.innerWidth > 768) enableWeekView();
    else enableDayView();
  }, [datesInView.length, enableWeekView, enableDayView]);

  const [isModalHidden, setModalHidden] = useState(false);

  const getModalStatus = useCallback(
    (id: string) => (isModalHidden ? false : openedModalId === id),
    [isModalHidden, openedModalId]
  );

  const getActiveEvent = useCallback(
    () =>
      isModalHidden ? undefined : events.find((e) => e.id === openedModalId),
    [isModalHidden, events, openedModalId]
  );

  const isModalActive = useCallback(
    () => (isModalHidden ? false : openedModalId !== null),
    [isModalHidden, openedModalId]
  );

  const isEditing = useCallback(
    () => isModalHidden || !!openedModalId,
    [isModalHidden, openedModalId]
  );

  const openModal = useCallback((id: string) => {
    setOpenedModalId(id);
    setLastCreatedEventId(id);
  }, []);

  const closeModal = useCallback(() => setOpenedModalId(null), []);

  const hideModal = useCallback(() => setModalHidden(true), []);
  const showModal = useCallback(() => setModalHidden(false), []);

  const values = {
    refresh,
    getDate,
    getTitle,

    isToday,
    selectToday,
    selectDate,

    handleNext,
    handlePrev,

    view,
    datesInView,
    availableViews,
    setAvailableViews,
    enableDayView,
    enable4DayView,
    enableWeekView,

    getEvent,
    getCurrentEvents,
    getUpcomingEvent,

    getEvents,

    getEventLevel,

    addEvent,
    addEmptyEvent,
    updateEvent,
    deleteEvent,

    getModalStatus,
    getActiveEvent,
    isModalActive,
    isEditing,
    openModal,
    closeModal,

    hideModal,
    showModal,
  };

  return (
    <CalendarContext.Provider value={values}>
      {children}
    </CalendarContext.Provider>
  );
};

export const useCalendar = () => {
  const context = useContext(CalendarContext);

  if (context === undefined)
    throw new Error('useCalendar() must be used within a CalendarProvider.');

  return context;
};
