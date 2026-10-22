export const ASSURANCE_ORIGIN = 'https://meet-ci.supabase.invalid';
export const ASSURANCE_SUBJECT = 'be0e8f2e-c239-4e40-a1f4-d6881938cae4';
export const ASSURANCE_PATH = `/auth/v1/admin/users/${ASSURANCE_SUBJECT}`;
export const ASSURANCE_READS = 8;
const account = Object.freeze({
  id: ASSURANCE_SUBJECT,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'meet-ci@example.invalid',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  confirmed_at: '2026-01-01T00:00:00.000Z',
  banned_until: null,
  app_metadata: Object.freeze({
    tuturuuu_required_mfa: Object.freeze({ required: false }),
  }),
  user_metadata: Object.freeze({}),
  identities: Object.freeze([]),
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
});

export function isAssuranceRequest(request, key) {
  return (
    typeof key === 'string' &&
    request.method === 'GET' &&
    request.url === `${ASSURANCE_ORIGIN}${ASSURANCE_PATH}` &&
    request.headers.get('apikey') === key &&
    request.headers.get('authorization') === `Bearer ${key}` &&
    !request.headers.has('cookie') &&
    !request.body
  );
}

export function assuranceResponse() {
  return Response.json(account);
}
