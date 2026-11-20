export type CostProvider =
  | 'google-cloud'
  | 'google-workspace'
  | 'supabase'
  | 'vercel'
  | 'polar'
  | 'cloudflare';

export interface ReportingWindow {
  readonly start: string;
  readonly endExclusive: string;
}

export interface CostScope {
  readonly provider: CostProvider;
  readonly accountId: string;
  readonly currency: string;
  readonly window: ReportingWindow;
}

export interface CostTarget {
  readonly kind: 'app' | 'workspace';
  readonly id: string;
}

export interface UsageWeight {
  readonly target: CostTarget;
  readonly quantity: bigint;
}

export interface AllocationBasis {
  readonly sourceRef: string;
  readonly window: ReportingWindow;
  readonly unit: string;
  readonly weights: readonly [UsageWeight, ...UsageWeight[]];
}

export type CostAssignment =
  | { readonly kind: 'direct'; readonly target: CostTarget }
  | { readonly kind: 'weighted'; readonly basis: AllocationBasis }
  | { readonly kind: 'shared'; readonly reason: string }
  | { readonly kind: 'unallocated'; readonly reason: string };

export interface CostStatement {
  readonly id: string;
  readonly kind: 'invoice' | 'fee-statement';
  readonly postedOn: string;
  readonly totalMinor: bigint;
}

export interface PostedCostLine {
  readonly statementId: string;
  readonly id: string;
  readonly category: 'charge' | 'tax' | 'credit' | 'adjustment' | 'fee';
  readonly amountMinor: bigint;
  readonly assignment: CostAssignment;
}

export interface PostedCosts {
  readonly statements: readonly CostStatement[];
  readonly lines: readonly PostedCostLine[];
}

export interface EstimatedCostLine {
  readonly id: string;
  readonly amountMinor: bigint;
  readonly evidenceRef: string;
}

export type EstimateBasis =
  | { readonly kind: 'provider-rated' }
  | { readonly kind: 'rate-model'; readonly rateSnapshotRef: string };

export interface EstimatedCosts {
  readonly basis: EstimateBasis;
  readonly lines: readonly EstimatedCostLine[];
}

export type CostRead<T> =
  | { readonly kind: 'unavailable'; readonly reason: string }
  | Readonly<
      {
        scope: CostScope;
        sourceRef: string;
        asOf: string;
        data: T;
      } & ({ kind: 'complete' } | { kind: 'partial'; reason: string })
    >;

export interface CostEvidence {
  readonly posted: CostRead<PostedCosts>;
  readonly estimated: CostRead<EstimatedCosts>;
}

// Implementations normalize one selected snapshot per lane for the requested
// account, currency and window. Source references are opaque and non-secret.
export interface ReadOnlyCostAdapter {
  readonly read: (
    scope: CostScope,
    signal: AbortSignal
  ) => Promise<CostEvidence>;
}
