import type {
  EligibleRecipientsDiagnostics,
  EnqueueApprovedPostEmailsDiagnostics,
  QueueIdPostRow,
  QueueIdPostUserRow,
} from './types';
import { isValidEmailAddress } from './utils';

export type QueuePostRow = QueueIdPostRow;
export type QueuePostUserRow = QueueIdPostUserRow;

export type QueueSkippedRow = QueuePostUserRow & {
  last_error: string | null;
};

export type ReenqueueCheckRow = {
  post_id: string;
  user_id: string;
  approval_status: string | null;
  is_completed: boolean | null;
  email: string | null;
};

export type SentPairRow = {
  post_id: string;
  receiver_id: string;
};

export type EligibleRecipientDiagnosticsInput = {
  eligibleRecipients: number;
  invalidEmail: number;
  missingEmail: number;
  missingFromUserTable: number;
  missingIsCompleted: number;
  missingUserObject: number;
  notApproved: number;
  rowsWithUserData: number;
  totalCheckRows: number;
};

export type ExistingRecipientStatusRow = {
  status: string;
  user_id: string;
};

export function buildEligibleRecipientsDiagnostics({
  eligibleRecipients,
  invalidEmail,
  missingEmail,
  missingFromUserTable,
  missingIsCompleted,
  missingUserObject,
  notApproved,
  rowsWithUserData,
  totalCheckRows,
}: EligibleRecipientDiagnosticsInput): EligibleRecipientsDiagnostics {
  return {
    eligibleRecipients,
    missingCompletion: missingIsCompleted,
    missingEmail: missingEmail + invalidEmail,
    missingUserRecord: missingFromUserTable + missingUserObject,
    notApproved,
    rowsWithUserData,
    totalCheckRows,
  };
}

export function buildEnqueueApprovedPostEmailsDiagnostics({
  existingRows,
  missingSenderPlatformUser,
  recipientDiagnostics,
  sentRecipientIds,
  upserted,
}: {
  existingRows: ExistingRecipientStatusRow[];
  missingSenderPlatformUser: number;
  recipientDiagnostics: EligibleRecipientsDiagnostics;
  sentRecipientIds: Iterable<string>;
  upserted: number;
}): EnqueueApprovedPostEmailsDiagnostics {
  const sentSet = new Set(sentRecipientIds);
  let alreadySent = sentSet.size;
  let existingQueued = 0;
  let existingProcessing = 0;
  let existingSkipped = 0;

  for (const row of existingRows) {
    if (row.status === 'queued') {
      existingQueued++;
    } else if (row.status === 'processing') {
      existingProcessing++;
    } else if (row.status === 'skipped') {
      existingSkipped++;
    } else if (row.status === 'sent' && !sentSet.has(row.user_id)) {
      alreadySent++;
    }
  }

  return {
    alreadySent,
    eligibleRecipients: recipientDiagnostics.eligibleRecipients,
    existingProcessing,
    existingQueued,
    existingSkipped,
    missingCompletion: recipientDiagnostics.missingCompletion,
    missingEmail: recipientDiagnostics.missingEmail,
    missingSenderPlatformUser,
    missingUserRecord: recipientDiagnostics.missingUserRecord,
    notApproved: recipientDiagnostics.notApproved,
    upserted,
  };
}

export function getQueueIdsForOldPosts(
  candidateRows: QueuePostRow[],
  oldPostIds: Set<string>
): string[] {
  return candidateRows
    .filter((row) => oldPostIds.has(row.post_id))
    .map((row) => row.id);
}

export function filterAgeSkippedRows(
  skippedRows: QueueSkippedRow[],
  isAgeSkipReason: (lastError: string | null | undefined) => boolean
): QueuePostUserRow[] {
  return skippedRows
    .filter((row) => isAgeSkipReason(row.last_error))
    .map((row) => ({
      id: row.id,
      post_id: row.post_id,
      user_id: row.user_id,
    }));
}

export function filterRowsByRecentPosts(
  rows: QueuePostUserRow[],
  recentPostIds: Set<string>
): QueuePostUserRow[] {
  return rows.filter((row) => recentPostIds.has(row.post_id));
}

export function getEligibleReenqueuePairIds(
  checks: ReenqueueCheckRow[]
): Set<string> {
  const pairIds = new Set<string>();

  for (const check of checks) {
    if (check.approval_status !== 'APPROVED') continue;
    if (check.is_completed === null) continue;
    if (!isValidEmailAddress(check.email)) continue;
    pairIds.add(`${check.post_id}:${check.user_id}`);
  }

  return pairIds;
}

export function getSentPairIds(sentRows: SentPairRow[]): Set<string> {
  return new Set(sentRows.map((row) => `${row.post_id}:${row.receiver_id}`));
}

export function getQueueIdsToReenqueue(
  queueRows: QueuePostUserRow[],
  eligiblePairIds: Set<string>,
  sentPairIds: Set<string>
): string[] {
  const queueIds = new Set<string>();

  for (const row of queueRows) {
    const pairId = `${row.post_id}:${row.user_id}`;
    if (!eligiblePairIds.has(pairId)) continue;
    if (sentPairIds.has(pairId)) continue;
    queueIds.add(row.id);
  }

  return [...queueIds];
}
