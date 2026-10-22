import { CalendarWorkspacePage } from '../components/calendar-workspace-page';
import type { calendarPageModel } from './calendar-page-model.server';
export function CalendarPageView({
  model,
}: {
  model: Awaited<ReturnType<typeof calendarPageModel>>;
}) {
  return <CalendarWorkspacePage {...model} />;
}
