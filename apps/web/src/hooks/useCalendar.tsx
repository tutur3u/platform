import { Workspace } from '@tutur3u/types/primitives/Workspace';
import { CalendarEvent } from '@tutur3u/types/primitives/calendar-event';
import moment from 'moment';
import 'moment/locale/vi';
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import useSWR, { mutate as swrMutate } from 'swr';

const CalendarContext = createContext({
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

export const CalendarProvider = ({
  ws,
  children,
}: {
  ws: Workspace;
  children: ReactNode;
}) => {
  const getDateRangeQuery = ({
    startDate,
    endDate,
  }: {
    startDate: Date;
    endDate: Date;
  }) => {
    return `?start_at=${startDate.toISOString()}&end_at=${endDate.toISOString()}`;
  };

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/calendar/events${getDateRangeQuery({
        startDate: new Date(),
        endDate: new Date(),
      })}`
    : null;

  const { data } = useSWR<{
    data: CalendarEvent[];
    count: number;
  }>(apiPath);

  const refresh = useCallback(async () => await swrMutate(apiPath), [apiPath]);

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
        return !(e.end_at <= event.start_at || e.start_at >= event.end_at);
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
    async (eventId: string, event: Partial<CalendarEvent>) => {
      if (!ws) return;

      const newEvents =
        data?.data
          .map((e) => {
            if (e.id !== eventId) return e;

            if (
              (event.title !== undefined && event.title !== e.title) ||
              (event.description !== undefined &&
                event.description !== e.description) ||
              (event.start_at !== undefined &&
                !moment(event.start_at).isSame(e.start_at)) ||
              (event.end_at !== undefined &&
                !moment(event.end_at).isSame(e.end_at)) ||
              (event.color !== undefined && event.color !== e.color)
            ) {
              return { ...e, ...event, local: true };
            }

            return { ...e, ...event };
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
    },
    [ws, data?.data]
  );

  const deleteEvent = async (eventId: string) => {
    if (!ws) return;

    try {
      const res = await fetch(
        `/api/workspaces/${ws.id}/calendar/events/${eventId}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) throw new Error('Failed to delete event');

      await refresh();
    } catch (err) {
      console.error(err);
    }

    setLastCreatedEventId(null);
    setOpenedModalId(null);
  };

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
