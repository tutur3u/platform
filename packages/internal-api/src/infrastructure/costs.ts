import { getInternalApiClient, type InternalApiClientOptions } from '../client';

// Admin cost analytics (apps/docs/build/devops/cost-discovery.mdx). Amounts
// are USD. Daily lines are API-reported charges; invoices are reviewed
// provider receipts, linked to the Finance transaction they posted to.

export interface InfrastructureCostDay {
  day: string;
  provider: string;
  service: string;
  app: string;
  environment: string;
  /** Null when the provider reports no list price. */
  listUsd: number | null;
  billedUsd: number;
}

export interface InfrastructureCostInvoice {
  provider: string;
  accountId: string;
  app: string;
  reference: string;
  issuedOn: string;
  amountUsd: number;
  financeTransactionId: string | null;
}

export interface InfrastructureCostCollection {
  provider: string;
  firstDay: string | null;
  lastDay: string | null;
  days: number;
  exhaustedDays: number;
  lastCollectedAt: string | null;
}

export interface InfrastructureRecordedCost {
  month: string;
  provider: string;
  service: string;
  app: string;
  amountUsd: number;
}

export type InfrastructureCostSource<T> =
  | { status: 'ok'; data: T }
  | { status: 'unavailable' };

export interface InfrastructureCostCompleteDays {
  provider: string;
  days: string[];
}

export interface InfrastructureCostsResponse {
  from: string;
  /** The UTC month containing the request; may have no complete day yet. */
  reportingMonth: string;
  /** The last complete UTC day before the request. */
  lastCompleteDay: string;
  completeDays: InfrastructureCostSource<InfrastructureCostCompleteDays[]>;
  daily: InfrastructureCostSource<InfrastructureCostDay[]>;
  collection: InfrastructureCostSource<InfrastructureCostCollection[]>;
  invoices: InfrastructureCostSource<InfrastructureCostInvoice[]>;
  recorded: InfrastructureCostSource<InfrastructureRecordedCost[]>;
  /** Users active in the 30 days up to the request, including today. */
  monthlyActiveUsers: InfrastructureCostSource<number>;
  rootWorkspaceId: string;
}

export function getInfrastructureCosts(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<InfrastructureCostsResponse>(
    '/api/v1/infrastructure/costs',
    { cache: 'no-store' }
  );
}
