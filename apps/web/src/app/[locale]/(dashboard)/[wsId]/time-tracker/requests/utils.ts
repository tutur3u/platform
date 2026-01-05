import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import dayjs from 'dayjs';
import type { ExtendedTimeTrackingRequest } from './page';

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

export const CATEGORY_COLOR_NAMES = [
  'RED',
  'BLUE',
  'GREEN',
  'YELLOW',
  'ORANGE',
  'PURPLE',
  'PINK',
  'INDIGO',
  'CYAN',
  'GRAY',
] as const;

export type CategoryColor = (typeof CATEGORY_COLOR_NAMES)[number];

export const CATEGORY_COLORS: Record<CategoryColor, string> = {
  RED: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
  BLUE: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
  GREEN: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  YELLOW: 'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20',
  ORANGE: 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
  PURPLE: 'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
  PINK: 'bg-dynamic-pink/10 text-dynamic-pink border-dynamic-pink/20',
  INDIGO: 'bg-dynamic-indigo/10 text-dynamic-indigo border-dynamic-indigo/20',
  CYAN: 'bg-dynamic-cyan/10 text-dynamic-cyan border-dynamic-cyan/20',
  GRAY: 'bg-dynamic-gray/10 text-dynamic-gray border-dynamic-gray/20',
};

export function getCategoryColorClasses(
  color: string | null | undefined
): string {
  const normalizedColor = color?.toUpperCase();
  return normalizedColor && normalizedColor in CATEGORY_COLORS
    ? CATEGORY_COLORS[normalizedColor as CategoryColor]
    : CATEGORY_COLORS.GRAY;
}

export function getStatusColorClasses(
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO'
): string {
  return STATUS_COLORS[status];
}

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
