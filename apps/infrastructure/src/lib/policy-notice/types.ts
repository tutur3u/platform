export type PolicyNoticeMode = 'dry_run' | 'test_list' | 'live';
export type SendMode = Exclude<PolicyNoticeMode, 'dry_run'>;

/** Every reason suppresses; 'unsubscribed' is the global unsubscribe. */
export type Suppression =
  | 'complaint'
  | 'hard_bounce'
  | 'blocked'
  | 'unsubscribed';

export interface Recipient {
  recipientHash: string;
  email: string;
  suppression: Suppression | null;
}

export interface AudienceCounts {
  eligible: number;
  suppressed: number;
  alreadySent: number;
  /** Earlier failed or unknown outcomes; never retried automatically. */
  previouslyFailed: number;
  /** For the record: confirmed accounts outside the audience. */
  excludedPersonalOnly: number;
}

export interface DeliveryHealth {
  attempted: number;
  rejected: number;
  unknown: number;
  hardBounces: number;
  complaints: number;
}

export type RunStatus = 'completed' | 'paused' | 'stopped' | 'failed';
export type StopReason =
  | 'bounce_rate'
  | 'complaint_rate'
  | 'unknown_rate'
  | 'error';

export type DeliveryOutcome =
  | { status: 'sent'; messageId: string }
  | { status: 'failed' }
  | { status: 'unknown' }
  | { status: 'suppressed'; suppression: Suppression };

export interface PolicyNoticeStore {
  counts(input: { noticeId: string; version: string }): Promise<AudienceCounts>;
  /** Throws `policy_notice_gate:<code>` when the ledger gate refuses. */
  startRun(input: {
    noticeId: string;
    version: string;
    mode: PolicyNoticeMode;
    actorId: string;
  }): Promise<string>;
  finishRun(
    runId: string,
    status: RunStatus,
    stopReason: StopReason | null,
    counts: Record<string, number> | null
  ): Promise<void>;
  nextRecipients(input: {
    noticeId: string;
    version: string;
    limit: number;
  }): Promise<Recipient[]>;
  classify(emails: string[]): Promise<Recipient[]>;
  /** False when this version already has a ledger row for the recipient. */
  claim(
    runId: string,
    recipientHash: string,
    suppression: Suppression | null
  ): Promise<boolean>;
  record(
    runId: string,
    recipientHash: string,
    outcome: DeliveryOutcome
  ): Promise<boolean>;
  health(noticeId: string, version: string): Promise<DeliveryHealth>;
}

export type MailerOutcome =
  | { kind: 'sent'; messageId: string }
  | { kind: 'rejected' }
  | { kind: 'blocked' }
  | { kind: 'unknown' };

export interface PolicyNoticeMailer {
  send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    noticeId: string;
    replyTo: string[];
  }): Promise<MailerOutcome>;
}

export interface PolicyNoticeClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface SendCounts {
  sent: number;
  failed: number;
  unknown: number;
  suppressed: number;
  /** Already in the ledger for this version (claimed by another run). */
  skipped: number;
}

export type PolicyNoticeResult =
  | {
      mode: 'dry_run';
      noticeId: string;
      noticeVersion: string;
      counts: AudienceCounts;
    }
  | {
      mode: SendMode;
      noticeId: string;
      noticeVersion: string;
      runId: string;
      status: RunStatus;
      stopReason: StopReason | null;
      /** True once no audience address is left without a ledger row. */
      done: boolean;
      counts: SendCounts;
    };
