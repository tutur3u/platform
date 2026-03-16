import { sendWorkspaceEmail } from '@tuturuuu/email-service';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import type { NextRequest } from 'next/server';
import { normalizeMarkdownToText } from './content';

export const RESPONSE_COPY_TEMPLATE_TYPE = 'form-response-copy';
export const RESPONSE_COPY_ENTITY_TYPE = 'form_session';
const RESPONSE_COPY_HOURLY_LIMIT = 2;
const RESPONSE_COPY_DAILY_LIMIT = 6;

export async function getAuthenticatedUserContext(
  request?: NextRequest | Pick<Request, 'headers'>
) {
  const supabase = await createClient(request ?? undefined);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      authenticatedEmail: null as string | null,
    };
  }

  if (user.email) {
    return {
      user,
      authenticatedEmail: user.email,
    };
  }

  const adminClient = await createAdminClient();
  const { data: emailRow } = await adminClient
    .from('user_private_details')
    .select('email')
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    user,
    authenticatedEmail: emailRow?.email ?? null,
  };
}

export async function hasSentResponseCopyEmail(
  adminClient: TypedSupabaseClient,
  wsId: string,
  sessionId: string
) {
  const { data: existingCopy } = await adminClient
    .from('email_audit')
    .select('id')
    .eq('ws_id', wsId)
    .eq('template_type', RESPONSE_COPY_TEMPLATE_TYPE)
    .eq('entity_type', RESPONSE_COPY_ENTITY_TYPE)
    .eq('entity_id', sessionId)
    .in('status', ['pending', 'sent'])
    .limit(1)
    .maybeSingle();

  return Boolean(existingCopy);
}

async function enforceResponseCopyRateLimits(
  adminClient: TypedSupabaseClient,
  wsId: string,
  userId: string
) {
  const statuses = ['pending', 'sent'];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: hourlyCount }, { count: dailyCount }] = await Promise.all([
    adminClient
      .from('email_audit')
      .select('id', { count: 'exact', head: true })
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .eq('template_type', RESPONSE_COPY_TEMPLATE_TYPE)
      .in('status', statuses)
      .gte('created_at', oneHourAgo),
    adminClient
      .from('email_audit')
      .select('id', { count: 'exact', head: true })
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .eq('template_type', RESPONSE_COPY_TEMPLATE_TYPE)
      .in('status', statuses)
      .gte('created_at', oneDayAgo),
  ]);

  if ((hourlyCount ?? 0) >= RESPONSE_COPY_HOURLY_LIMIT) {
    throw new Error(
      'Too many response copy emails were requested recently. Please wait a bit before requesting another copy.'
    );
  }

  if ((dailyCount ?? 0) >= RESPONSE_COPY_DAILY_LIMIT) {
    throw new Error(
      'Too many response copy emails were requested today. Please contact support@tuturuuu.com if you need more help.'
    );
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatAnswerForEmail(answer: {
  answer_text: string | null;
  answer_json: unknown;
}) {
  if (typeof answer.answer_text === 'string' && answer.answer_text.trim()) {
    return answer.answer_text.trim();
  }

  if (Array.isArray(answer.answer_json)) {
    return answer.answer_json
      .filter((entry): entry is string => typeof entry === 'string')
      .join(', ');
  }

  if (typeof answer.answer_json === 'number') {
    return String(answer.answer_json);
  }

  return '—';
}

type ResponseCopyLocale = 'en' | 'vi';

const RESPONSE_COPY_MESSAGES: Record<
  ResponseCopyLocale,
  {
    preheader: string;
    eyebrow: string;
    recipientLabel: string;
    submittedLabel: string;
    countLabel: string;
    deliveryLabel: string;
    deliveryValue: string;
    intro: (params: {
      submittedAt: string;
      recipientEmail: string;
      answerCount: number;
    }) => string;
    answersTitle: string;
    answersDescription: string;
    emptyAnswers: string;
    untitledQuestion: string;
    whyTitle: string;
    whyDescription: string;
    supportTitle: string;
    supportDescription: string;
    oneTimeNotice: string;
    subject: (formTitle: string) => string;
    textSubmitted: (submittedAt: string) => string;
    textRecipient: (recipientEmail: string) => string;
    textCount: (answerCount: number) => string;
    textReason: string;
    textAnswersTitle: string;
    textSupport: string;
  }
> = {
  en: {
    preheader: 'Your one-time Tuturuuu Forms response copy is ready to review.',
    eyebrow: 'Response copy',
    recipientLabel: 'Sent to',
    submittedLabel: 'Submitted',
    countLabel: 'Questions saved',
    deliveryLabel: 'Delivery',
    deliveryValue: 'One-time email copy',
    intro: ({ submittedAt, recipientEmail, answerCount }) =>
      `Here is the one-time copy of your submitted response from ${submittedAt}. It was delivered to ${recipientEmail} and includes ${answerCount} saved answer${answerCount === 1 ? '' : 's'}.`,
    answersTitle: 'Saved answers',
    answersDescription:
      'This snapshot reflects the answers stored at the moment your response was submitted.',
    emptyAnswers: 'No answers were stored for this response.',
    untitledQuestion: 'Untitled question',
    whyTitle: 'Why you received this',
    whyDescription:
      'This copy was only sent because a signed-in Tuturuuu account requested a one-time response email.',
    supportTitle: 'Need help?',
    supportDescription:
      'If you need delivery help or additional support, contact support@tuturuuu.com.',
    oneTimeNotice: 'Only one response copy can be sent from this form.',
    subject: (formTitle) => `Your response copy for ${formTitle}`,
    textSubmitted: (submittedAt) => `Submitted: ${submittedAt}`,
    textRecipient: (recipientEmail) => `Sent to: ${recipientEmail}`,
    textCount: (answerCount) => `Questions saved: ${answerCount}`,
    textReason:
      'This copy was sent because a signed-in Tuturuuu account requested a one-time response email.',
    textAnswersTitle: 'Saved answers',
    textSupport:
      'Need delivery help or additional support? Contact support@tuturuuu.com.',
  },
  vi: {
    preheader:
      'Bản sao phản hồi một lần từ Tuturuuu Forms của bạn đã sẵn sàng để xem.',
    eyebrow: 'Bản sao phản hồi',
    recipientLabel: 'Đã gửi tới',
    submittedLabel: 'Thời điểm gửi',
    countLabel: 'Câu trả lời đã lưu',
    deliveryLabel: 'Hình thức gửi',
    deliveryValue: 'Bản sao email một lần',
    intro: ({ submittedAt, recipientEmail, answerCount }) =>
      `Đây là bản sao một lần của phản hồi bạn đã gửi vào ${submittedAt}. Email này được gửi tới ${recipientEmail} và bao gồm ${answerCount} câu trả lời đã lưu.`,
    answersTitle: 'Các câu trả lời đã lưu',
    answersDescription:
      'Ảnh chụp này phản ánh các câu trả lời đã được lưu tại thời điểm bạn gửi phản hồi.',
    emptyAnswers: 'Không có câu trả lời nào được lưu cho phản hồi này.',
    untitledQuestion: 'Câu hỏi chưa có tiêu đề',
    whyTitle: 'Vì sao bạn nhận được email này',
    whyDescription:
      'Bản sao này chỉ được gửi vì một tài khoản Tuturuuu đã đăng nhập đã yêu cầu email phản hồi một lần.',
    supportTitle: 'Cần hỗ trợ?',
    supportDescription:
      'Nếu cần hỗ trợ nhận email hoặc hỗ trợ thêm, vui lòng liên hệ support@tuturuuu.com.',
    oneTimeNotice: 'Mỗi biểu mẫu chỉ có thể gửi một bản sao phản hồi duy nhất.',
    subject: (formTitle) => `Bản sao phản hồi của bạn cho ${formTitle}`,
    textSubmitted: (submittedAt) => `Thời điểm gửi: ${submittedAt}`,
    textRecipient: (recipientEmail) => `Đã gửi tới: ${recipientEmail}`,
    textCount: (answerCount) => `Câu trả lời đã lưu: ${answerCount}`,
    textReason:
      'Bản sao này được gửi vì một tài khoản Tuturuuu đã đăng nhập đã yêu cầu email phản hồi một lần.',
    textAnswersTitle: 'Các câu trả lời đã lưu',
    textSupport:
      'Nếu cần hỗ trợ nhận email hoặc hỗ trợ thêm, vui lòng liên hệ support@tuturuuu.com.',
  },
};

function resolveResponseCopyLocale(request: NextRequest): ResponseCopyLocale {
  const acceptLanguage = request.headers.get('accept-language')?.toLowerCase();

  if (acceptLanguage?.startsWith('vi')) {
    return 'vi';
  }

  return 'en';
}

function formatSubmittedAtForEmail(
  submittedAt: string,
  locale: ResponseCopyLocale
) {
  const date = new Date(submittedAt);

  if (Number.isNaN(date.getTime())) {
    return submittedAt;
  }

  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

function buildResponseCopyEmail({
  locale,
  formTitle,
  submittedAt,
  recipientEmail,
  answerRows,
}: {
  locale: ResponseCopyLocale;
  formTitle: string;
  submittedAt: string;
  recipientEmail: string;
  answerRows: Array<{
    question_title: string;
    answer_text: string | null;
    answer_json: unknown;
  }>;
}) {
  const messages = RESPONSE_COPY_MESSAGES[locale];
  const formattedSubmittedAt = formatSubmittedAtForEmail(submittedAt, locale);
  const safeFormTitle = escapeHtml(formTitle);
  const safeSubmittedAt = escapeHtml(formattedSubmittedAt);
  const safeRecipientEmail = escapeHtml(recipientEmail);
  const safePreheader = escapeHtml(messages.preheader);
  const answerCount = answerRows.length;
  const answerItems = answerRows.length
    ? answerRows
        .map((answer) => {
          const questionTitle = escapeHtml(
            normalizeMarkdownToText(answer.question_title) ||
              messages.untitledQuestion
          );
          const answerValue = escapeHtml(formatAnswerForEmail(answer));

          return `
            <div style="margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 18px; background: #ffffff; padding: 18px 18px 16px;">
              <p style="margin: 0 0 8px; color: #64748b; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                ${questionTitle}
              </p>
              <div style="margin: 0; color: #111827; font-size: 15px; line-height: 1.75; white-space: pre-wrap; word-break: break-word;">
                ${answerValue}
              </div>
            </div>
          `;
        })
        .join('')
    : `<div style="margin-top: 14px; border: 1px dashed #d1d5db; border-radius: 18px; background: #ffffff; padding: 18px; color: #6b7280; font-size: 14px; line-height: 1.7;">${escapeHtml(messages.emptyAnswers)}</div>`;

  const html = `
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
      ${safePreheader}
    </div>
    <div style="margin: 0; background: radial-gradient(circle at top left, #ecfdf5 0%, #f8fafc 34%, #eef2ff 100%); padding: 32px 16px; font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="margin: 0 auto; max-width: 720px;">
        <div style="margin-bottom: 16px; color: #0f172a; font-size: 12px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; text-align: center;">
          Tuturuuu Forms
        </div>
        <div style="overflow: hidden; border: 1px solid rgba(148, 163, 184, 0.24); border-radius: 30px; background: rgba(255, 255, 255, 0.92); box-shadow: 0 28px 70px rgba(15, 23, 42, 0.10);">
          <div style="padding: 32px 32px 26px; background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 48%, #eef2ff 100%); border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0 0 10px; color: #15803d; font-size: 12px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase;">
              ${escapeHtml(messages.eyebrow)}
            </p>
            <h1 style="margin: 0; color: #0f172a; font-size: 34px; line-height: 1.15; letter-spacing: -0.03em;">
              ${safeFormTitle}
            </h1>
            <p style="margin: 16px 0 0; color: #475569; font-size: 15px; line-height: 1.8;">
              ${escapeHtml(
                messages.intro({
                  submittedAt: formattedSubmittedAt,
                  recipientEmail,
                  answerCount,
                })
              )}
            </p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: separate; border-spacing: 0 10px; margin-top: 22px;">
              <tr>
                <td style="width: 50%; padding-right: 8px; vertical-align: top;">
                  <div style="border: 1px solid #dbe4ee; border-radius: 18px; background: rgba(255, 255, 255, 0.85); padding: 14px 16px;">
                    <p style="margin: 0 0 6px; color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;">
                      ${escapeHtml(messages.recipientLabel)}
                    </p>
                    <p style="margin: 0; color: #0f172a; font-size: 14px; font-weight: 600; line-height: 1.6; word-break: break-word;">
                      ${safeRecipientEmail}
                    </p>
                  </div>
                </td>
                <td style="width: 50%; padding-left: 8px; vertical-align: top;">
                  <div style="border: 1px solid #dbe4ee; border-radius: 18px; background: rgba(255, 255, 255, 0.85); padding: 14px 16px;">
                    <p style="margin: 0 0 6px; color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;">
                      ${escapeHtml(messages.submittedLabel)}
                    </p>
                    <p style="margin: 0; color: #0f172a; font-size: 14px; font-weight: 600; line-height: 1.6;">
                      ${safeSubmittedAt}
                    </p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="width: 50%; padding-right: 8px; vertical-align: top;">
                  <div style="border: 1px solid #dbe4ee; border-radius: 18px; background: rgba(255, 255, 255, 0.85); padding: 14px 16px;">
                    <p style="margin: 0 0 6px; color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;">
                      ${escapeHtml(messages.countLabel)}
                    </p>
                    <p style="margin: 0; color: #0f172a; font-size: 14px; font-weight: 600; line-height: 1.6;">
                      ${escapeHtml(String(answerCount))}
                    </p>
                  </div>
                </td>
                <td style="width: 50%; padding-left: 8px; vertical-align: top;">
                  <div style="border: 1px solid #dbe4ee; border-radius: 18px; background: rgba(255, 255, 255, 0.85); padding: 14px 16px;">
                    <p style="margin: 0 0 6px; color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;">
                      ${escapeHtml(messages.deliveryLabel)}
                    </p>
                    <p style="margin: 0; color: #0f172a; font-size: 14px; font-weight: 600; line-height: 1.6;">
                      ${escapeHtml(messages.deliveryValue)}
                    </p>
                  </div>
                </td>
              </tr>
            </table>
          </div>
          <div style="padding: 32px;">
            <div style="padding: 22px 22px 20px; border: 1px solid #e5e7eb; border-radius: 22px; background: #f8fafc;">
              <h2 style="margin: 0; color: #0f172a; font-size: 20px; line-height: 1.3;">
                ${escapeHtml(messages.answersTitle)}
              </h2>
              <p style="margin: 8px 0 0; color: #64748b; font-size: 14px; line-height: 1.7;">
                ${escapeHtml(messages.answersDescription)}
              </p>
              <div style="margin-top: 18px;">
                ${answerItems}
              </div>
            </div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: separate; border-spacing: 0; margin-top: 18px;">
              <tr>
                <td style="width: 50%; padding-right: 8px; vertical-align: top;">
                  <div style="height: 100%; border: 1px solid #e5e7eb; border-radius: 20px; background: #ffffff; padding: 20px;">
                    <p style="margin: 0 0 10px; color: #0f172a; font-size: 15px; font-weight: 700;">
                      ${escapeHtml(messages.whyTitle)}
                    </p>
                    <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.7;">
                      ${escapeHtml(messages.whyDescription)}
                    </p>
                  </div>
                </td>
                <td style="width: 50%; padding-left: 8px; vertical-align: top;">
                  <div style="height: 100%; border: 1px solid #e5e7eb; border-radius: 20px; background: #ffffff; padding: 20px;">
                    <p style="margin: 0 0 10px; color: #0f172a; font-size: 15px; font-weight: 700;">
                      ${escapeHtml(messages.supportTitle)}
                    </p>
                    <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.7;">
                      ${escapeHtml(messages.supportDescription)}
                    </p>
                  </div>
                </td>
              </tr>
            </table>
            <div style="margin-top: 18px; padding-top: 18px; border-top: 1px solid #e5e7eb; color: #64748b; font-size: 13px; line-height: 1.7;">
              ${escapeHtml(messages.oneTimeNotice)}
            </div>
          </div>
        </div>
        <div style="padding: 18px 8px 0; color: #64748b; font-size: 12px; line-height: 1.7; text-align: center;">
          Tuturuuu Forms
        </div>
      </div>
    </div>
  `;

  const textAnswers = answerRows.length
    ? answerRows
        .map((answer) => {
          const questionTitle =
            normalizeMarkdownToText(answer.question_title) ||
            messages.untitledQuestion;
          return `- ${questionTitle}: ${formatAnswerForEmail(answer)}`;
        })
        .join('\n')
    : `- ${messages.emptyAnswers}`;

  const text = [
    formTitle,
    messages.textSubmitted(formattedSubmittedAt),
    messages.textRecipient(recipientEmail),
    messages.textCount(answerCount),
    messages.oneTimeNotice,
    '',
    messages.textReason,
    '',
    messages.textAnswersTitle,
    textAnswers,
    '',
    messages.textSupport,
  ].join('\n');

  return {
    subject: messages.subject(formTitle),
    html,
    text,
  };
}

export async function maybeSendResponseCopyEmail({
  adminClient,
  request,
  form,
  sessionId,
  responseId,
  responder,
  answerRows,
  submittedAt,
}: {
  adminClient: TypedSupabaseClient;
  request: NextRequest;
  form: {
    id: string;
    title: string | null;
    ws_id: string;
  };
  sessionId: string;
  responseId: string;
  responder: {
    authenticatedUser: { id: string } | null;
    authenticatedEmail: string | null;
  };
  answerRows: Array<{
    question_title: string;
    answer_text: string | null;
    answer_json: unknown;
  }>;
  submittedAt: string;
}) {
  if (!responder.authenticatedUser?.id || !responder.authenticatedEmail) {
    throw new Error(
      'Sign in with the email account that should receive the response copy'
    );
  }

  const alreadySent = await hasSentResponseCopyEmail(
    adminClient,
    form.ws_id,
    sessionId
  );

  if (alreadySent) {
    return null;
  }

  await enforceResponseCopyRateLimits(
    adminClient,
    form.ws_id,
    responder.authenticatedUser.id
  );

  const locale = resolveResponseCopyLocale(request);
  const emailContent = buildResponseCopyEmail({
    locale,
    formTitle: normalizeMarkdownToText(form.title) || 'Untitled form',
    submittedAt,
    recipientEmail: responder.authenticatedEmail,
    answerRows,
  });

  const result = await sendWorkspaceEmail(form.ws_id, {
    recipients: {
      to: [responder.authenticatedEmail],
    },
    content: emailContent,
    metadata: {
      userId: responder.authenticatedUser.id,
      templateType: RESPONSE_COPY_TEMPLATE_TYPE,
      entityType: RESPONSE_COPY_ENTITY_TYPE,
      entityId: sessionId,
      ipAddress: extractIPFromHeaders(request.headers),
      userAgent: request.headers.get('user-agent')?.slice(0, 500) || undefined,
      priority: 'normal',
    },
  });

  if (!result.success) {
    console.error('[forms] Failed to send response copy email', {
      formId: form.id,
      responseId,
      sessionId,
      userId: responder.authenticatedUser.id,
      hasRateLimitInfo: Boolean(result.rateLimitInfo),
      blockedRecipients: result.blockedRecipients?.length ?? 0,
      error: result.error,
    });
    return null;
  }

  return responder.authenticatedEmail;
}
