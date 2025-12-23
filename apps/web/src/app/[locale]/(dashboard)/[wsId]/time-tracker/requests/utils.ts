import dayjs from 'dayjs';
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
  if (!startTime || !endTime) return '0h 0m';
  const start = dayjs(startTime);
  const end = dayjs(endTime);
  if (!start.isValid() || !end.isValid()) return '0h 0m';

  const diffSeconds = end.diff(start, 'second');
  if (diffSeconds < 0) return '0h 0m';

  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

export interface RequestsViewProps {
  wsId: string;
  currentUser: WorkspaceUser | null;
  onSelectRequest: (request: ExtendedTimeTrackingRequest) => void;
}
