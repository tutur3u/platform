import type { ReportEmailReplyIdentity } from './email-reply-types';

/** Server-only inputs. Raw addresses, MIME and tokens must never enter public DTOs. */
export interface ReportReplyIngressEvent {
  provider: 'ses' | 'cloudflare';
  accountId: string;
  eventId: string;
  envelopeRecipient: string;
  raw: Uint8Array;
  rawSha256: string;
  from: string[];
  internetMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  bodyText: string;
}

/** Produced by a real transport verifier, never derived from MIME headers. */
export interface ReportReplyTransportProof {
  provider: ReportReplyIngressEvent['provider'];
  accountId: string;
  eventId: string;
  envelopeRecipient: string;
  rawSha256: string;
  signatureVerified: true;
  verificationBypassed: false;
  spam: 'pass';
  malware: 'pass';
}

/** Independent raw-MIME verification, not Worker HMAC or Authentication-Results. */
export interface ReportReplySenderProof {
  rawSha256: string;
  /** Hash of the policy's ordered parsed-content tuple, independently parsed from raw MIME. */
  contentSha256: string;
  sender: string;
  alignedDomain: string;
  method: 'raw-dkim';
  fullBodyVerified: true;
  signatureTimeValid: true;
}

export type ReportReplySenderVerification =
  | { status: 'verified'; proof: ReportReplySenderProof }
  | { status: 'rejected' }
  | { status: 'unknown' };

export interface ReportReplyAppend {
  identityId: string;
  wsId: string;
  reportId: string;
  subjectUserId: string;
  deliveryKind: 'send' | 'test';
  provider: ReportReplyIngressEvent['provider'];
  accountId: string;
  eventId: string;
  envelopeRecipientDigest: string;
  rawSha256: string;
  contentSha256: string;
  sender: string;
  internetMessageId: string | null;
  inReplyTo: string | null;
  references: readonly string[];
  bodyText: string;
}

/** P2b must implement this transactionally; a check-then-insert adapter is unsafe. */
export type ReportReplyAppendReceipt =
  | {
      status: 'accepted' | 'duplicate';
      identityId: string;
      rawSha256: string;
      messageId: string;
      receiptId: string;
    }
  | { status: 'conflict' }
  | { status: 'unknown' };

export interface ReportReplyIngressDependencies {
  verifyTransport(event: Readonly<ReportReplyIngressEvent>): Promise<unknown>;
  lookupIdentity(tokenDigest: string): Promise<ReportEmailReplyIdentity | null>;
  validateCurrentScope(identity: Readonly<ReportEmailReplyIdentity>): Promise<{
    identityId: string;
    wsId: string;
    reportId: string;
    subjectUserId: string;
    accessible: boolean;
  }>;
  verifySender(
    event: Readonly<ReportReplyIngressEvent>
  ): Promise<ReportReplySenderVerification>;
  /** Return known ancestor identity IDs; never use subject fallback. */
  resolveAncestors(ids: readonly string[]): Promise<readonly string[]>;
  append(
    message: Readonly<ReportReplyAppend>
  ): Promise<ReportReplyAppendReceipt>;
}

export type ReportReplyIngressResult =
  | { status: 'disabled' }
  | {
      status: 'rejected';
      reason:
        | 'invalid_event'
        | 'untrusted_transport'
        | 'identity_unavailable'
        | 'scope_denied';
    }
  | {
      status: 'quarantined';
      reason: 'sender_unverified' | 'ancestor_conflict' | 'content_conflict';
    }
  | { status: 'unknown' }
  | { status: 'accepted' | 'duplicate'; messageId: string; receiptId: string };
