import { X509Certificate } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import { z } from 'zod';
import {
  handleAppealFeedback,
  readFeedbackText,
} from '@/lib/email-appeals/feedback-handler';
import { createSnsVerifier } from '@/lib/email-appeals/feedback-sns';
import { readActiveAppealFeedbackBindings } from '@/lib/email-appeals/transport';

type FeedbackSchema = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
    Functions: {
      email_appeal_feedback: {
        Args: {
          p_event_id: string;
          p_message_id: string;
          p_appeal_id: string;
          p_account_id: string;
          p_region: string;
          p_email: string;
          p_ws_id: string;
          p_event_type: string;
          p_bounce_type: string | null;
        };
        Returns: Json;
      };
    };
  };
};

const topicSchema = z
  .array(
    z
      .string()
      .regex(
        /^arn:aws:sns:[a-z]{2}(?:-[a-z]+)+-\d:\d{12}:[A-Za-z0-9_-]{1,256}$/
      )
  )
  .min(1)
  .max(10);
const resultSchema = z.object({
  status: z.enum(['recorded', 'duplicate', 'invalid']),
});
const authenticate = createSnsVerifier({
  now: Date.now,
  parseCertificate: (pem) => new X509Certificate(pem),
  async fetchCertificate(url) {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
      credentials: 'omit',
    });
    if (response.status >= 400 && response.status < 500) return null;
    if (!response.ok) throw new Error('certificate_unavailable');
    return readFeedbackText(response, 64 * 1024);
  },
});

export async function POST(request: Request) {
  const topics = topicSchema.safeParse(
    (process.env.EMAIL_APPEAL_FEEDBACK_TOPIC_ARNS ?? '')
      .split(',')
      .map((topic) => topic.trim())
  );
  const bindings = topics.success
    ? await readActiveAppealFeedbackBindings().catch(() => [])
    : [];
  return handleAppealFeedback(request, {
    bindings,
    topics: topics.success ? topics.data : [],
    authenticate,
    async record(input) {
      const admin = await createAdminClient<FeedbackSchema>({ noCookie: true });
      const { data, error } = await admin.rpc('email_appeal_feedback', {
        p_event_id: input.eventId,
        p_message_id: input.messageId,
        p_appeal_id: input.appealId,
        p_account_id: input.accountId,
        p_region: input.region,
        p_email: input.email,
        p_ws_id: input.wsId,
        p_event_type: input.eventType,
        p_bounce_type: input.bounceType,
      });
      if (error) throw new Error('feedback_unavailable');
      return resultSchema.parse(data).status;
    },
  });
}
