import { expect, test } from '@playwright/test';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const PRIVATE_TABLES = [
  {
    name: 'ai_gateway_models',
    select: 'id',
  },
  {
    name: 'external_user_monthly_report_logs',
    select: 'id',
  },
  {
    name: 'external_user_monthly_reports',
    select: 'id',
  },
  {
    name: 'form_logic_rules',
    select: 'id',
  },
  {
    name: 'form_question_options',
    select: 'id',
  },
  {
    name: 'form_questions',
    select: 'id',
  },
  {
    name: 'form_response_answers',
    select: 'id',
  },
  {
    name: 'form_responses',
    select: 'id',
  },
  {
    name: 'form_sections',
    select: 'id',
  },
  {
    name: 'form_sessions',
    select: 'id',
  },
  {
    name: 'form_share_links',
    select: 'id',
  },
  {
    name: 'forms',
    select: 'id',
  },
  {
    name: 'mira_accessories',
    select: 'id',
  },
  {
    name: 'mira_achievements',
    select: 'id',
  },
  {
    name: 'recording_transcripts',
    select: 'id',
  },
  {
    name: 'topic_announcement_attachments',
    select: 'id',
  },
  {
    name: 'topic_announcement_batches',
    select: 'id',
  },
  {
    name: 'topic_announcement_contact_verifications',
    select: 'id',
  },
  {
    name: 'topic_announcement_contacts',
    select: 'id',
  },
  {
    name: 'topic_announcement_recipients',
    select: 'announcement_id',
  },
  {
    name: 'topic_announcement_templates',
    select: 'id',
  },
  {
    name: 'topic_announcements',
    select: 'id',
  },
  {
    name: 'time_tracking_request_activity',
    select: 'id',
  },
  {
    name: 'time_tracking_request_comments',
    select: 'id',
  },
  {
    name: 'time_tracking_requests',
    select: 'id',
  },
  {
    name: 'user_group_metric_categories',
    select: 'id',
  },
  {
    name: 'user_group_metric_category_links',
    select: 'category_id',
  },
  {
    name: 'user_group_post_checks',
    select: 'post_id',
  },
  {
    name: 'user_group_post_logs',
    select: 'id',
  },
  {
    name: 'user_group_posts',
    select: 'id',
  },
  {
    name: 'user_linked_promotions',
    select: 'user_id',
  },
  {
    name: 'v_user_referral_discounts',
    select: 'promo_id',
  },
  {
    name: 'workspace_education_access_requests',
    select: 'id',
  },
  {
    name: 'workspace_calendars',
    select: 'id',
  },
  {
    name: 'workspace_credit_packs',
    select: 'id',
  },
  {
    name: 'workspace_promotions',
    select: 'id',
  },
  {
    name: 'workspace_subscription_products',
    select: 'id',
  },
  {
    name: 'workspace_debt_loan_transactions',
    select: 'id',
  },
  {
    name: 'workspace_debt_loans',
    select: 'id',
  },
  {
    name: 'workspace_tutoring_sessions',
    select: 'id',
  },
] as const;

test.describe('Private schema REST surface', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test.skip(
    !SUPABASE_PUBLISHABLE_KEY,
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required for Supabase REST E2E'
  );

  for (const table of PRIVATE_TABLES) {
    test(`does not expose public.${table.name}`, async ({ request }) => {
      const response = await request.get(
        `${SUPABASE_URL}/rest/v1/${table.name}?select=${table.select}&limit=1`,
        {
          failOnStatusCode: false,
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY ?? '',
            authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY ?? ''}`,
          },
        }
      );

      expect(response.status()).toBe(404);
    });
  }
});
