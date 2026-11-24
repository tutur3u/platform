import { z } from 'zod';
import { requireQaOperator } from '@/lib/qa-test-users/authorization';
import {
  admitCiTarget,
  auditCi,
  ciRefusalBody,
} from '@/lib/qa-test-users/ci-policy';
import { deleteQaUser } from '@/lib/qa-test-users/deletion';
import { qaErrorResponse, qaJson } from '@/lib/qa-test-users/http';
import { createQaDeletionDeps } from '@/lib/qa-test-users/runtime';

const STATUS = { deleted: 200, not_found: 404, busy: 409, pending: 202 };

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const access = await requireQaOperator(request);
  if (!access.ok) return access.response;
  const { principal, operator } = access;
  const userId = z.uuid().safeParse((await params).userId);
  if (!userId.success) {
    if (principal.kind === 'github-ci')
      auditCi('delete', principal.claims, { outcome: 'invalid' }, 'warn');
    return qaJson({ error: 'Invalid user ID' }, 400);
  }
  try {
    if (principal.kind === 'github-ci') {
      const refusal = await admitCiTarget(
        access.admin,
        userId.data,
        operator.id
      );
      if (refusal) {
        auditCi(
          'delete',
          principal.claims,
          { outcome: 'refused', reason: refusal.reason, userId: userId.data },
          'warn'
        );
        return qaJson(ciRefusalBody(refusal), refusal.status);
      }
    }
    const outcome = await deleteQaUser(
      createQaDeletionDeps(access.admin),
      userId.data,
      'operator',
      operator.id
    );
    if (principal.kind === 'github-ci')
      auditCi('delete', principal.claims, { outcome, userId: userId.data });
    return qaJson({ userId: userId.data, outcome }, STATUS[outcome]);
  } catch (error) {
    if (principal.kind === 'github-ci')
      auditCi(
        'delete',
        principal.claims,
        { outcome: 'error', userId: userId.data },
        'warn'
      );
    return qaErrorResponse(error, 'delete');
  }
}
