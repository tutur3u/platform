import { createHash } from 'node:crypto';
import {
  POLICY_NOTICE_HTML,
  POLICY_NOTICE_SUBJECT,
  POLICY_NOTICE_TEXT,
} from './template';

/**
 * Whether the global unsubscribe (email_blacklist reason
 * 'recipient_unsubscribed') stops this notice. Legal ruling 4 Nov 2026 (Cora):
 * a required notice of Terms and Privacy changes is not advertising email, so
 * marketing-unsubscribed owners and admins still receive it. Hard bounces,
 * complaints and every other do-not-send entry always suppress, whatever this
 * says.
 */
export type MarketingUnsubscribePolicy = 'send' | 'suppress';

export interface PolicyNoticeDefinition {
  id: string;
  templateVersion: string;
  subject: string;
  html: string;
  text: string;
  marketingUnsubscribe: MarketingUnsubscribePolicy;
  /** Owners of personal workspaces count as workspace owners. */
  includePersonalWorkspaces: boolean;
}

export const POLICY_CHANGE_NOTICE: PolicyNoticeDefinition = {
  id: 'policy-change-2026-11-11',
  templateVersion: 'v3',
  subject: POLICY_NOTICE_SUBJECT,
  html: POLICY_NOTICE_HTML,
  text: POLICY_NOTICE_TEXT,
  marketingUnsubscribe: 'send',
  includePersonalWorkspaces: true,
};

/**
 * The ledger version: any change to the content, subject, audience or
 * unsubscribe policy is a new version, which needs its own dry run and
 * test-list send before a live send.
 */
export function policyNoticeVersion(notice: PolicyNoticeDefinition) {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        notice.id,
        notice.templateVersion,
        notice.subject,
        notice.html,
        notice.text,
        notice.marketingUnsubscribe,
        notice.includePersonalWorkspaces,
      ])
    )
    .digest('hex');
  return `${notice.templateVersion}-${digest.slice(0, 12)}`;
}

export function policyNoticeRecipientHash(email: string) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** Typed by the operator for a real send; binds the request to one version. */
export function policyNoticeConfirmToken(
  mode: 'test_list' | 'live',
  version: string
) {
  return `${mode === 'live' ? 'send-live' : 'send-test'}:${version}`;
}
