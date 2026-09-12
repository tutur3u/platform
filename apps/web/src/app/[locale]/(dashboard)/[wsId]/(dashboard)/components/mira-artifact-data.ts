import { listWorkspaceCalendarEvents } from '@tuturuuu/internal-api/calendar';
import { listWallets } from '@tuturuuu/internal-api/finance';
import { getWorkspaceMeetings } from '@tuturuuu/internal-api/meetings';
import { getUserTaskDashboard } from '@tuturuuu/internal-api/tasks';
import { getWorkspace } from '@tuturuuu/internal-api/workspaces';
import type { ArtifactKind } from './mira-workspace-state';

export interface ArtifactRow {
  id: string;
  title: string;
  detail?: string;
  date?: string;
  amount?: number;
  currency?: string;
  endDate?: string;
  allDay?: boolean;
  group?: string;
  priority?: string;
  path?: string;
}
export async function loadArtifactRows(
  kind: ArtifactKind,
  wsId: string,
  date?: string
): Promise<ArtifactRow[]> {
  if (kind === 'tasks') {
    const workspace = await getWorkspace(wsId);
    const result = await getUserTaskDashboard({
      wsId: workspace.id,
      isPersonal: workspace.personal === true,
    });
    return (['overdue', 'today', 'upcoming'] as const).flatMap((group) =>
      result[group].map((task) => ({
        id: task.id,
        title: task.name,
        date: task.end_date ?? undefined,
        group,
        priority: task.priority ?? undefined,
        detail: [task.list?.board?.workspaces?.name, task.list?.board?.name]
          .filter(Boolean)
          .join(' · '),
        path: task.list?.board
          ? `/${encodeURIComponent(task.list.board.ws_id)}/boards/${encodeURIComponent(task.list.board.id)}?task=${encodeURIComponent(task.id)}`
          : undefined,
      }))
    );
  }
  if (kind === 'calendar') {
    const start = date ? new Date(`${date}T00:00:00`) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const result = await listWorkspaceCalendarEvents(wsId, {
      start_at: start.toISOString(),
      end_at: end.toISOString(),
    });
    return result.data.map((event) => ({
      id: event.id,
      title: event.title ?? '',
      date: event.start_at,
      endDate: event.end_at,
      detail: event.location,
    }));
  }
  if (kind === 'finance') {
    const wallets = await listWallets(wsId);
    return wallets.map((wallet, index) => ({
      id: wallet.id ?? String(index),
      title: wallet.name ?? '',
      amount: wallet.balance,
      currency: wallet.currency,
    }));
  }
  const result = await getWorkspaceMeetings<{
    meetings: { id: string; name: string; time: string }[];
  }>(wsId, { page: 1, pageSize: 30 });
  return result.meetings.map((meeting) => ({
    id: meeting.id,
    title: meeting.name,
    date: meeting.time,
  }));
}
