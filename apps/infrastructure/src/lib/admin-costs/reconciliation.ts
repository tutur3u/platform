import {
  allocateCost,
  type CostAllocation,
  compareKeys,
  sameWindow,
  targetKey,
} from './attribution';
import type {
  CostAssignment,
  CostEvidence,
  CostRead,
  CostScope,
  CostStatement,
  EstimatedCosts,
  PostedCostLine,
  PostedCosts,
} from './contracts';

export function parseMinorUnits(decimal: string, exponent: number): bigint {
  const match = /^(-?\d+)(?:\.(\d+))?$/.exec(decimal);
  const whole = match?.[1];
  if (
    match?.[0] !== decimal ||
    !whole ||
    !Number.isInteger(exponent) ||
    exponent < 0 ||
    exponent > 4
  ) {
    throw new Error('Expected a decimal string and a currency exponent of 0–4');
  }

  const fraction = match[2] ?? '';
  if (/[1-9]/.test(fraction.slice(exponent))) {
    throw new Error('Amount contains fractional minor units');
  }
  const minor = fraction.slice(0, exponent).padEnd(exponent, '0');
  return BigInt(`${whole}${minor}`);
}

export interface ReconciledLine {
  readonly line: PostedCostLine;
  readonly allocations: readonly CostAllocation[];
}

export interface ReconciledStatement {
  readonly statement: CostStatement;
  readonly lines: readonly ReconciledLine[];
  readonly lineTotalMinor: bigint;
  readonly unmatchedMinor: bigint;
}

export interface PostedSummary {
  readonly statements: readonly ReconciledStatement[];
  readonly statementTotalMinor: bigint;
  readonly attributedMinor: bigint;
  readonly sharedMinor: bigint;
  readonly unallocatedMinor: bigint;
  readonly balanced: boolean;
}

interface EstimatedSummary extends EstimatedCosts {
  readonly observedTotalMinor: bigint;
}

export interface CostReport {
  readonly scope: CostScope;
  readonly posted: CostRead<PostedSummary>;
  readonly estimated: CostRead<EstimatedSummary>;
}

function dateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return (
    Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

function mapRead<Input, Output>(
  scope: CostScope,
  read: CostRead<Input>,
  normalize: (data: Input) => Output
): CostRead<Output> {
  if (read.kind === 'unavailable') return read;
  if (
    read.scope.provider !== scope.provider ||
    read.scope.accountId !== scope.accountId ||
    read.scope.currency !== scope.currency ||
    !sameWindow(read.scope.window, scope.window)
  ) {
    throw new Error('Cost evidence does not match the requested scope');
  }
  if (!read.sourceRef || !Number.isFinite(Date.parse(read.asOf))) {
    throw new Error(
      'Cost evidence requires a source reference and snapshot time'
    );
  }
  return { ...read, data: normalize(read.data) };
}

function uniqueRows<Row>(
  rows: readonly Row[],
  keyOf: (row: Row) => string,
  fingerprintOf: (row: Row) => string
): Row[] {
  const seen = new Map<string, { row: Row; fingerprint: string }>();
  for (const row of rows) {
    const key = keyOf(row);
    const fingerprint = fingerprintOf(row);
    const existing = seen.get(key);
    if (existing && existing.fingerprint !== fingerprint) {
      throw new Error(
        'Conflicting cost evidence for the same canonical record'
      );
    }
    if (!existing) seen.set(key, { row, fingerprint });
  }
  return Array.from(seen.entries())
    .sort(([left], [right]) => compareKeys(left, right))
    .map(([, { row }]) => row);
}

function assignmentFingerprint(assignment: CostAssignment): readonly unknown[] {
  switch (assignment.kind) {
    case 'direct':
      return [assignment.kind, targetKey(assignment.target)];
    case 'shared':
    case 'unallocated':
      return [assignment.kind, assignment.reason];
    case 'weighted': {
      const { sourceRef, unit, window, weights } = assignment.basis;
      return [
        assignment.kind,
        sourceRef,
        unit,
        window.start,
        window.endExclusive,
        weights
          .map(({ target, quantity }): [string, string] => [
            targetKey(target),
            quantity.toString(),
          ])
          .sort(([left], [right]) => compareKeys(left, right)),
      ];
    }
  }
}

function reconcilePosted(scope: CostScope, data: PostedCosts): PostedSummary {
  const statements = uniqueRows(
    data.statements,
    (statement) => statement.id,
    ({ kind, postedOn, totalMinor }) =>
      JSON.stringify([kind, postedOn, totalMinor.toString()])
  );
  const lines = uniqueRows(
    data.lines,
    (line) => JSON.stringify([line.statementId, line.id]),
    ({ category, amountMinor, assignment }) =>
      JSON.stringify([
        category,
        amountMinor.toString(),
        assignmentFingerprint(assignment),
      ])
  );

  const polar = scope.provider === 'polar';
  const byStatement = new Map<
    string,
    { statement: CostStatement; lines: ReconciledLine[] }
  >();
  for (const statement of statements) {
    if (
      !statement.id ||
      statement.kind !== (polar ? 'fee-statement' : 'invoice') ||
      !dateOnly(statement.postedOn) ||
      statement.postedOn < scope.window.start ||
      statement.postedOn >= scope.window.endExclusive
    ) {
      throw new Error(
        'Statement kind or posting date does not match the report'
      );
    }
    byStatement.set(statement.id, { statement, lines: [] });
  }

  let attributedMinor = 0n;
  let sharedMinor = 0n;
  let unallocatedMinor = 0n;
  for (const line of lines) {
    const entry = byStatement.get(line.statementId);
    if (!line.id || !entry || (polar && line.category !== 'fee')) {
      throw new Error(
        'Posted cost line does not belong to an eligible statement'
      );
    }
    const allocations = allocateCost(
      line.amountMinor,
      line.assignment,
      scope.window
    );
    entry.lines.push({ line, allocations });
    switch (line.assignment.kind) {
      case 'direct':
      case 'weighted':
        attributedMinor += line.amountMinor;
        break;
      case 'shared':
        sharedMinor += line.amountMinor;
        break;
      case 'unallocated':
        unallocatedMinor += line.amountMinor;
        break;
    }
  }

  let statementTotalMinor = 0n;
  const reconciled = Array.from(
    byStatement.values(),
    ({ statement, lines: statementLines }) => {
      const lineTotalMinor = statementLines.reduce(
        (sum, { line }) => sum + line.amountMinor,
        0n
      );
      const unmatchedMinor = statement.totalMinor - lineTotalMinor;
      statementTotalMinor += statement.totalMinor;
      unallocatedMinor += unmatchedMinor;
      return {
        statement,
        lines: statementLines,
        lineTotalMinor,
        unmatchedMinor,
      };
    }
  );

  return {
    statements: reconciled,
    statementTotalMinor,
    attributedMinor,
    sharedMinor,
    unallocatedMinor,
    balanced: reconciled.every(({ unmatchedMinor }) => unmatchedMinor === 0n),
  };
}

export function reconcileCosts(
  scope: CostScope,
  evidence: CostEvidence
): CostReport {
  if (
    !scope.accountId ||
    scope.currency.length !== 3 ||
    !/^[A-Z]{3}$/.test(scope.currency) ||
    !dateOnly(scope.window.start) ||
    !dateOnly(scope.window.endExclusive) ||
    scope.window.start >= scope.window.endExclusive
  ) {
    throw new Error('Invalid cost report scope');
  }

  return {
    scope,
    posted: mapRead(scope, evidence.posted, (data) =>
      reconcilePosted(scope, data)
    ),
    estimated: mapRead(scope, evidence.estimated, ({ basis, lines }) => {
      if (basis.kind === 'rate-model' && !basis.rateSnapshotRef) {
        throw new Error('Modeled estimates require a rate snapshot reference');
      }
      const unique = uniqueRows(
        lines,
        ({ id }) => id,
        ({ amountMinor, evidenceRef }) =>
          JSON.stringify([amountMinor.toString(), evidenceRef])
      );
      if (unique.some(({ id, evidenceRef }) => !id || !evidenceRef)) {
        throw new Error(
          'Estimated cost lines require an identity and evidence'
        );
      }
      return {
        basis,
        lines: unique,
        observedTotalMinor: unique.reduce(
          (sum, line) => sum + line.amountMinor,
          0n
        ),
      };
    }),
  };
}
