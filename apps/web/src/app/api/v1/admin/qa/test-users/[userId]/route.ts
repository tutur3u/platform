import { z } from 'zod';
import { requireQaOperator } from '@/lib/qa-test-users/authorization';
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
  const userId = z.uuid().safeParse((await params).userId);
  if (!userId.success) return qaJson({ error: 'Invalid user ID' }, 400);
  try {
    const outcome = await deleteQaUser(
      createQaDeletionDeps(access.admin),
      userId.data,
      'operator',
      access.operator.id
    );
    return qaJson({ userId: userId.data, outcome }, STATUS[outcome]);
  } catch (error) {
    return qaErrorResponse(error, 'delete');
  }
}
