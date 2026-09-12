import { CalendarDays, ListTodo, Video, Wallet } from '@tuturuuu/icons';

export const artifactVisuals = {
  tasks: {
    icon: ListTodo,
    iconClass: 'bg-chart-1/15 text-chart-1',
    headerClass: 'bg-chart-1/5',
  },
  calendar: {
    icon: CalendarDays,
    iconClass: 'bg-chart-2/15 text-chart-2',
    headerClass: 'bg-chart-2/5',
  },
  finance: {
    icon: Wallet,
    iconClass: 'bg-chart-3/15 text-chart-3',
    headerClass: 'bg-chart-3/5',
  },
  meetings: {
    icon: Video,
    iconClass: 'bg-chart-4/15 text-chart-4',
    headerClass: 'bg-chart-4/5',
  },
} as const;
