import type { ExtendedTimeTrackingRequest } from './page';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

export const STATUS_LABELS: Record<
  'pending' | 'approved' | 'rejected' | 'all',
  string
> = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const STATUS_COLORS: Record<'PENDING' | 'APPROVED' | 'REJECTED', string> = {
  PENDING: 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
  APPROVED: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  REJECTED: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
};

export const calculateDuration = (startTime: string, endTime: string) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMs = end.getTime() - start.getTime();
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};

export interface RequestsViewProps {
  wsId: string;
  bypassRulesPermission: boolean;
  currentUser: WorkspaceUser | null;
  onSelectRequest: (request: ExtendedTimeTrackingRequest) => void;
}
