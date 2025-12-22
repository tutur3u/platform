import type { ExtendedTimeTrackingRequest } from './page';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

export const STATUS_LABELS: Record<
  'pending' | 'approved' | 'rejected' | 'needs_info' | 'all',
  string
> = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  needs_info: 'Needs Info',
};

export const STATUS_COLORS: Record<
  'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO',
  string
> = {
  PENDING: 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
  APPROVED: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  REJECTED: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
  NEEDS_INFO: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
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
