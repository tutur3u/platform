import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const ROOT_USER_ID = '00000000-0000-0000-0000-000000000001';
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;
const FORMS_BASE_URL = process.env.FORMS_BASE_URL ?? 'http://localhost:7828';

function assertSafeFormsBaseUrl(): void {
  const url = new URL(FORMS_BASE_URL);
  const isDirectLocalhost =
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(url.hostname) &&
    url.port === '7828';
  const isPortlessLocalhost =
    url.protocol === 'https:' &&
    url.hostname === 'forms.tuturuuu.localhost' &&
    url.port === '1355';

  if (!isDirectLocalhost && !isPortlessLocalhost) {
    throw new Error(
      `Refusing to run Forms lifecycle E2E against non-local origin: ${url.origin}`
    );
  }
}

function privateServiceHeaders(prefer?: string) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'accept-profile': 'private',
    'content-profile': 'private',
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

test.describe('Forms private schema APIs', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
    assertSafeFormsBaseUrl();
  });

  test('serves a shared form through the app API while rows live in private', async ({
    request,
  }) => {
    const formId = randomUUID();
    const sectionId = randomUUID();
    const questionId = randomUUID();
    const shareLinkId = randomUUID();
    const optionId = randomUUID();
    const shareCode = `F${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;

    try {
      const formResponse = await request.post(`${SUPABASE_URL}/rest/v1/forms`, {
        data: {
          access_mode: 'anonymous',
          creator_id: ROOT_USER_ID,
          id: formId,
          settings: {
            requireTurnstile: true,
            showProgressBar: true,
          },
          status: 'published',
          title: 'Private E2E Form',
          ws_id: ROOT_WORKSPACE_ID,
        },
        failOnStatusCode: false,
        headers: privateServiceHeaders('return=minimal'),
      });
      expect(formResponse.status()).toBe(201);

      const sectionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/form_sections`,
        {
          data: {
            form_id: formId,
            id: sectionId,
            position: 0,
            title: 'Private section',
          },
          failOnStatusCode: false,
          headers: privateServiceHeaders('return=minimal'),
        }
      );
      expect(sectionResponse.status()).toBe(201);

      const questionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/form_questions`,
        {
          data: {
            form_id: formId,
            id: questionId,
            position: 0,
            required: true,
            section_id: sectionId,
            title: 'Pick one private option',
            type: 'single_choice',
          },
          failOnStatusCode: false,
          headers: privateServiceHeaders('return=minimal'),
        }
      );
      expect(questionResponse.status()).toBe(201);

      const optionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/form_question_options`,
        {
          data: {
            id: optionId,
            label: 'Private option',
            position: 0,
            question_id: questionId,
            value: 'private-option',
          },
          failOnStatusCode: false,
          headers: privateServiceHeaders('return=minimal'),
        }
      );
      expect(optionResponse.status()).toBe(201);

      const shareLinkResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/form_share_links`,
        {
          data: {
            active: true,
            code: shareCode,
            created_by_user_id: ROOT_USER_ID,
            form_id: formId,
            id: shareLinkId,
          },
          failOnStatusCode: false,
          headers: privateServiceHeaders('return=minimal'),
        }
      );
      expect(shareLinkResponse.status()).toBe(201);

      const response = await request.get(
        `${FORMS_BASE_URL}/api/v1/shared/forms/${shareCode}`,
        {
          failOnStatusCode: false,
        }
      );

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.form).toMatchObject({
        id: formId,
        title: 'Private E2E Form',
      });
      expect(body.form.sections[0]).toMatchObject({
        id: sectionId,
        title: 'Private section',
      });
      expect(body.form.sections[0].questions[0]).toMatchObject({
        id: questionId,
        title: 'Pick one private option',
      });
      expect(body.form.sections[0].questions[0].options[0]).toMatchObject({
        id: optionId,
        label: 'Private option',
      });
    } finally {
      await request.delete(`${SUPABASE_URL}/rest/v1/forms?id=eq.${formId}`, {
        failOnStatusCode: false,
        headers: privateServiceHeaders(),
      });
    }
  });
});
