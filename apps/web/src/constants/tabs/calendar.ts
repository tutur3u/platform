import { NavTabs } from '../../types/Tab';

export const calendarTabs: NavTabs = {
  namespace: 'calendar-tabs',
  tabs: [
    {
      name: 'overview',
      href: '/[wsId]/calendar',
    },
    {
      name: 'events',
      href: '/[wsId]/calendar/events',
    },
  ],
};
