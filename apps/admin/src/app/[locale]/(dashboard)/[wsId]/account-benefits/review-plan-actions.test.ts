import { expect, it, vi } from 'vitest';

const authorizeInfrastructureRootMemberRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureRootMemberRequest,
}));

import { updateWorkspaceReviewPlan } from './review-plan-actions';

it('does not let a non-root-admin invoke plan changes', async () => {
  const rpc = vi.fn();
  authorizeInfrastructureRootMemberRequest.mockResolvedValue({
    ok: false,
    sbAdmin: { rpc },
  });
  const form = new FormData();
  form.set('operation', 'grant');
  expect(await updateWorkspaceReviewPlan({ status: 'idle' }, form)).toEqual({
    status: 'denied',
  });
  expect(authorizeInfrastructureRootMemberRequest).toHaveBeenCalledWith(
    'admin'
  );
  expect(rpc).not.toHaveBeenCalled();
});
