import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type UpgradePlanCycle = 'month' | 'year';

/** One self-serve plan a workspace can choose in the Upgrade dialog. */
export interface UpgradePlan {
  billingCycle: UpgradePlanCycle | null;
  description: string | null;
  id: string;
  maxSeats: number | null;
  minSeats: number | null;
  name: string;
  /** Flat price in cents; zero for Free and seat-based plans. */
  price: number;
  /** Seat price in cents for seat-based plans. */
  pricePerSeat: number | null;
  pricingModel: string;
  tier: string;
}

export interface UpgradeCurrentPlan {
  billingCycle: UpgradePlanCycle | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  name: string;
  productId: string;
  seatCount: number | null;
  status: string;
  tier: string | null;
}

export interface WorkspaceUpgradeOptions {
  /** The billing page on the pay app, where checkout is completed. */
  billingUrl: string;
  /** Null when the workspace has no active subscription (the Free plan). */
  currentPlan: UpgradeCurrentPlan | null;
  plans: UpgradePlan[];
}

export function getWorkspaceUpgradeOptions(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<WorkspaceUpgradeOptions>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/billing/upgrade-options`,
    { cache: 'no-store' }
  );
}
