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
    name: 'user_group_metric_categories',
    select: 'id',
  },
  {
    name: 'user_group_metric_category_links',
    select: 'category_id',
  },
  {
    name: 'workspace_education_access_requests',
    select: 'id',
  },
  {
    name: 'workspace_calendars',
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
