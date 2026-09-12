import { listWorkspaceCalendarEvents } from '@tuturuuu/internal-api/calendar';
import { listWallets } from '@tuturuuu/internal-api/finance';
import { getWorkspaceMeetings } from '@tuturuuu/internal-api/meetings';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { ArtifactKind } from './mira-workspace-state';

export interface ArtifactRow {
  id: string;
  title: string;
  detail?: string;
  date?: string;
  amount?: number;
  currency?: string;
}
export async function loadArtifactRows(
  kind: ArtifactKind,
  wsId: string
): Promise<ArtifactRow[]> {
  if (kind === 'tasks') {
    const result = await listWorkspaceTasks(wsId, {
      limit: 30,
      listStatuses: ['not_started', 'active'],
      assignedToMe: true,
    });
    return result.tasks.map((task) => ({
      id: task.id,
      title: task.name,
      date: task.end_date ?? undefined,
    }));
  }
  if (kind === 'calendar') {
    const start = new Date();
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
