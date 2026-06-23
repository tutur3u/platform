import type { IPBlockStatus } from '@tuturuuu/utils/abuse-protection';
import { z } from 'zod';

const BLOCKED_IP_STATUS_VALUES = [
  'active',
  'expired',
  'manually_unblocked',
] as const satisfies readonly IPBlockStatus[];

const BLOCKED_IP_STATUS_FILTER_VALUES = [
  ...BLOCKED_IP_STATUS_VALUES,
  '',
] as const;

export const BlockedIpSearchParamsSchema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z.preprocess(
    (value) => (typeof value === 'string' ? value : ''),
    z.enum(BLOCKED_IP_STATUS_FILTER_VALUES).catch('')
  ),
});

export type BlockedIpSearchParams = z.infer<typeof BlockedIpSearchParamsSchema>;

export function shouldApplyBlockedIpStatusFilter(
  status: BlockedIpSearchParams['status']
): status is IPBlockStatus {
  return status !== '';
}
