import { describe, expect, it } from 'vitest';
import {
  buildEligibleRecipientsDiagnostics,
  buildEnqueueApprovedPostEmailsDiagnostics,
} from './logic';

describe('buildEligibleRecipientsDiagnostics', () => {
  it('counts missing or invalid email addresses under missingEmail', () => {
    const result = buildEligibleRecipientsDiagnostics({
      eligibleRecipients: 0,
      invalidEmail: 1,
      missingEmail: 2,
      missingFromUserTable: 0,
      missingIsCompleted: 0,
      missingUserObject: 1,
      notApproved: 0,
      rowsWithUserData: 3,
      totalCheckRows: 4,
    });

    expect(result).toMatchObject({
      eligibleRecipients: 0,
      missingEmail: 3,
      missingUserRecord: 1,
      rowsWithUserData: 3,
      totalCheckRows: 4,
    });
  });
});

describe('buildEnqueueApprovedPostEmailsDiagnostics', () => {
  it('reports upserted recipients when sender mappings are available', () => {
    const result = buildEnqueueApprovedPostEmailsDiagnostics({
      existingRows: [],
      missingSenderPlatformUser: 0,
      recipientDiagnostics: {
        eligibleRecipients: 1,
        missingCompletion: 0,
        missingEmail: 0,
        missingUserRecord: 0,
        notApproved: 0,
        rowsWithUserData: 1,
        totalCheckRows: 1,
      },
      sentRecipientIds: [],
      upserted: 1,
    });

    expect(result.upserted).toBe(1);
    expect(result.missingSenderPlatformUser).toBe(0);
  });

  it('tracks missing sender mappings for otherwise eligible recipients', () => {
    const result = buildEnqueueApprovedPostEmailsDiagnostics({
      existingRows: [],
      missingSenderPlatformUser: 2,
      recipientDiagnostics: {
        eligibleRecipients: 2,
        missingCompletion: 0,
        missingEmail: 0,
        missingUserRecord: 0,
        notApproved: 0,
        rowsWithUserData: 2,
        totalCheckRows: 2,
      },
      sentRecipientIds: [],
      upserted: 0,
    });

    expect(result.missingSenderPlatformUser).toBe(2);
    expect(result.upserted).toBe(0);
  });

  it('classifies existing skipped, processing, and sent rows without re-enqueueing them', () => {
    const result = buildEnqueueApprovedPostEmailsDiagnostics({
      existingRows: [
        { status: 'skipped', user_id: 'user-skipped' },
        { status: 'processing', user_id: 'user-processing' },
        { status: 'sent', user_id: 'user-sent' },
      ],
      missingSenderPlatformUser: 0,
      recipientDiagnostics: {
        eligibleRecipients: 3,
        missingCompletion: 0,
        missingEmail: 0,
        missingUserRecord: 0,
        notApproved: 0,
        rowsWithUserData: 3,
        totalCheckRows: 3,
      },
      sentRecipientIds: [],
      upserted: 0,
    });

    expect(result.existingSkipped).toBe(1);
    expect(result.existingProcessing).toBe(1);
    expect(result.alreadySent).toBe(1);
    expect(result.upserted).toBe(0);
  });
});
