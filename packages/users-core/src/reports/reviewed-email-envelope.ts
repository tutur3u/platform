import { createHash } from 'node:crypto';
import { reportConfigs } from '@tuturuuu/utils/configs/reports';
import {
  type ReportEmailData,
  renderReportEmail,
  resolveReportEmailTitle,
} from './email-template';

/** Presentation only: this does not assert permission, approval or delivery readiness. */
export interface ReviewedReportEmailInput {
  workspaceId: string;
  reportId: string;
  subjectId: string;
  groupId: string;
  creatorId: string | null;
  revision: string;
  recipient: string;
  report: ReportEmailData;
  /** Complete allowlisted snapshot; absent configuration must be explicitly ''. */
  configs: Readonly<Record<string, string>>;
}

export const REPORT_EMAIL_ENVELOPE_VERSION = 'periodic-report-presentation-v1';
const configKeys = reportConfigs.map(({ id }) => id!).sort();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const textKeys = [
  'title',
  'content',
  'feedback',
  'userName',
  'groupName',
  'teacherName',
] as const;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export type ReviewedEmailEnvelopeResult =
  | { ok: false; reason: 'missing-input' | 'invalid-input' }
  | {
      ok: true;
      version: typeof REPORT_EMAIL_ENVELOPE_VERSION;
      snapshot: Readonly<Omit<ReviewedReportEmailInput, 'report'>> & {
        readonly report: Readonly<ReportEmailData>;
      };
      subject: string;
      html: string;
      recipient: string;
      digest: string;
    };

/** Unwired, synchronous construction from one validated copy; performs no reads/writes. */
export function buildReviewedEmailEnvelope(
  input: ReviewedReportEmailInput
): ReviewedEmailEnvelopeResult {
  if (!record(input) || !record(input.report) || !record(input.configs))
    return { ok: false, reason: 'missing-input' };
  const identityKeys = [
    'workspaceId',
    'reportId',
    'subjectId',
    'groupId',
    'creatorId',
    'revision',
    'recipient',
  ] as const;
  if (
    identityKeys.some((key) => !Object.hasOwn(input, key)) ||
    [...textKeys, 'score'].some((key) => !Object.hasOwn(input.report, key)) ||
    configKeys.some((key) => !Object.hasOwn(input.configs, key))
  )
    return { ok: false, reason: 'missing-input' };
  if (
    ['workspaceId', 'reportId', 'subjectId', 'groupId'].some(
      (key) => typeof input[key] !== 'string' || !uuid.test(input[key])
    ) ||
    (input.creatorId !== null &&
      (typeof input.creatorId !== 'string' || !uuid.test(input.creatorId))) ||
    typeof input.revision !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(input.revision) ||
    BigInt(input.revision) > 9223372036854775807n ||
    typeof input.recipient !== 'string' ||
    !/^[^\s@]+@[^\s@]+$/.test(input.recipient.trim()) ||
    textKeys.some(
      (key) =>
        input.report[key] !== null && typeof input.report[key] !== 'string'
    ) ||
    (input.report.score !== null &&
      (typeof input.report.score !== 'number' ||
        !Number.isFinite(input.report.score))) ||
    Object.keys(input.configs).some((key) => !configKeys.includes(key)) ||
    configKeys.some((key) => typeof input.configs[key] !== 'string')
  )
    return { ok: false, reason: 'invalid-input' };

  const report: ReportEmailData = {
    title: input.report.title,
    content: input.report.content,
    feedback: input.report.feedback,
    score: input.report.score,
    userName: input.report.userName,
    groupName: input.report.groupName,
    teacherName: input.report.teacherName,
  };
  const configs = Object.fromEntries(
    configKeys.map((key) => [key, input.configs[key]!])
  );
  const recipient = input.recipient.trim().toLowerCase();
  const snapshot = Object.freeze({
    workspaceId: input.workspaceId,
    reportId: input.reportId,
    subjectId: input.subjectId,
    groupId: input.groupId,
    creatorId: input.creatorId,
    revision: input.revision,
    recipient,
    report: Object.freeze(report),
    configs: Object.freeze(configs),
  });
  const subject = resolveReportEmailTitle(report, configs);
  const html = renderReportEmail(report, configs);
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        version: REPORT_EMAIL_ENVELOPE_VERSION,
        snapshot,
        subject,
        html,
      })
    )
    .digest('hex');
  return Object.freeze({
    ok: true,
    version: REPORT_EMAIL_ENVELOPE_VERSION,
    snapshot,
    subject,
    html,
    recipient,
    digest,
  });
}
