import { createHash } from 'node:crypto';
import {
  POLICY_NOTICE_HTML,
  POLICY_NOTICE_SUBJECT,
  POLICY_NOTICE_TEXT,
} from './template';

/**
 * Recipients: owners and administrators of non-personal (business)
 * workspaces, one email per address (user decision "notify A"). Every
 * suppression is honoured, including the global unsubscribe; there is no
 * bypass. Everyone else sees the in-app notice instead.
 */
export type PolicyNoticeAudience = 'business_workspace_owners_admins';

export interface PolicyNoticeDefinition {
  id: string;
  templateVersion: string;
  subject: string;
  html: string;
  text: string;
  replyTo: string[];
  audience: PolicyNoticeAudience;
}

export const POLICY_CHANGE_NOTICE: PolicyNoticeDefinition = {
  id: 'policy-change-2026-11-11',
  templateVersion: 'v4',
  subject: POLICY_NOTICE_SUBJECT,
  html: POLICY_NOTICE_HTML,
  text: POLICY_NOTICE_TEXT,
  replyTo: ['legal@tuturuuu.com'],
  audience: 'business_workspace_owners_admins',
};

/**
 * The ledger version: any change to the content, subject, Reply-To or
 * audience is a new version, which needs its own dry run and test-list send
 * before a live send.
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
        notice.replyTo,
        notice.audience,
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
