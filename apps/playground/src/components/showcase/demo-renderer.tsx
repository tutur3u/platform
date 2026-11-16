import type { InteractiveSlug } from '@/lib/showcase/catalog';
import { CalendarDemo } from './demos/calendar-demo';
import { FinanceDemo } from './demos/finance-demo';
import { MailDemo } from './demos/mail-demo';
import { MindDemo } from './demos/mind-demo';
import { TasksDemo } from './demos/tasks-demo';
import { TrackDemo } from './demos/track-demo';

/** Maps each interactive slug to its demo; adding a slug requires a view. */
export function DemoRenderer({ slug }: { slug: InteractiveSlug }) {
  switch (slug) {
    case 'tasks':
      return <TasksDemo />;
    case 'calendar':
      return <CalendarDemo />;
    case 'track':
      return <TrackDemo />;
    case 'finance':
      return <FinanceDemo />;
    case 'mail':
      return <MailDemo />;
    case 'mind':
      return <MindDemo />;
    default: {
      const unreachable: never = slug;
      return unreachable;
    }
  }
}
