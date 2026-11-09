import type { AppealReason } from './domain';

export type AppealMailer = {
  /** Provisioned isolated transport review receipt; never an SES account suppression override. */
  readonly reviewReceipt: string;
  readonly complaintRecovery: 'recipient_initiated_only' | 'disabled';
  sendConfirmation(input: {
    email: string;
    url: string;
    wsId: string;
    reason: AppealReason;
  }): Promise<void>;
};

export function getAppealMailer(): AppealMailer | null {
  // Activation requires reviewed provider isolation and sender-reputation evidence.
  return null;
}
