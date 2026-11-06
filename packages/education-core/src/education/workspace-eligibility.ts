import type { WorkspaceMemberType } from '@tuturuuu/utils/workspace-helper';

import { isEducationEnabled } from './education-flag';

type EducationEligibilityResult =
  | { ok: true }
  | { ok: false; message: string; status: 403 | 404 | 500 };

export async function checkEducationWorkspaceEligibility({
  membershipType,
  readEducationSecret,
}: {
  membershipType: WorkspaceMemberType | null | undefined;
  readEducationSecret: () => Promise<{
    data: { value: string | null } | null;
    error: unknown;
  }>;
}): Promise<EducationEligibilityResult> {
  if (membershipType !== 'MEMBER') {
    return {
      ok: false,
      message: "You don't have access to this workspace",
      status: 403,
    };
  }

  const { data, error } = await readEducationSecret();
  if (error) {
    return {
      ok: false,
      message: 'Failed to verify education access',
      status: 500,
    };
  }
  if (!isEducationEnabled(data?.value)) {
    return {
      ok: false,
      message: 'Education is not enabled for this workspace',
      status: 404,
    };
  }
  return { ok: true };
}
