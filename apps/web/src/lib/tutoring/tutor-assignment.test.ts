// @vitest-environment node
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { validateTutorAssignment } from './tutor-assignment';

const mocks = vi.hoisted(() => ({
  policy: vi.fn(),
  tutors: vi.fn(),
  translate: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/tutoring-policy', () => ({
  TUTORING_POLICY_CONFIG_ID: 'TUTORING_POLICY',
  readTutoringPolicyConfigRows: mocks.policy,
}));
vi.mock('@/lib/tutoring/teachers', () => ({
  listWorkspaceTutorIds: mocks.tutors,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => mocks.translate,
}));
vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
const like = vi.fn();
const query = { select: () => query, eq: () => query, like };
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: () => query }),
}));
const validate = async (teacherIds = ['class']) =>
  validateTutorAssignment({
    normalizedWsId: 'center',
    sbAdmin: await createAdminClient(),
    teacherIds,
  });
beforeEach(() => {
  vi.clearAllMocks();
  like.mockResolvedValue({ data: [], error: null });
  mocks.policy.mockReturnValue({ tutorGroupIds: ['tutors'] });
  mocks.tutors.mockResolvedValue({ tutorIds: ['tutor'], error: null });
  mocks.translate.mockReturnValue('Chỉ được chọn gia sư.');
});
it.each([{ teacherIds: ['class'] }, { teacherIds: ['tutor', 'class'] }])(
  'returns a localized validation error for non-tutor assignments (%j)',
  async ({ teacherIds }) => {
    const response = await validate(teacherIds);
    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({
      message: 'Chỉ được chọn gia sư.',
    });
    expect(mocks.translate).toHaveBeenCalledWith('teacher_must_be_tutor');
  }
);
it('accepts tutors, including people who also teach a class', async () => {
  expect(await validate(['tutor'])).toBeNull();
});
it('does not restrict assignments when tutor groups are unset', async () => {
  mocks.policy.mockReturnValue({ tutorGroupIds: [] });
  expect(await validate()).toBeNull();
  expect(mocks.tutors).not.toHaveBeenCalled();
});
it('fails closed on a policy read failure', async () => {
  like.mockResolvedValue({ data: null, error: new Error('fixture') });
  expect((await validate())?.status).toBe(500);
});
it('fails closed on a tutor membership read failure', async () => {
  mocks.tutors.mockResolvedValue({ tutorIds: [], error: new Error('fixture') });
  expect((await validate())?.status).toBe(500);
});
