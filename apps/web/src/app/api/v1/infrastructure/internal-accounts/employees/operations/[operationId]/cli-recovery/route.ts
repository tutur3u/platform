import { connection } from 'next/server';
import { observeEmployeeCliOutcome } from '@/lib/infrastructure/employee-cli-outcome-observation';
import { authorizeEmployeeCliRecovery } from '@/lib/infrastructure/employee-cli-recovery-authorization';
import { makeEmployeeCliRecoveryBoundary } from '@/lib/infrastructure/employee-cli-recovery-boundary';
import { createEmployeeRuntimeJournal } from '@/lib/infrastructure/employee-creation-runtime';
import { connectEmployeeRejection } from '@/lib/infrastructure/employee-rejection-boundary';

export const maxDuration = 60;
async function handle(
  request: Request,
  context: { params: Promise<{ operationId: string }> }
) {
  await connection();
  const { operationId } = await context.params;
  if (
    request.method === 'GET' &&
    new URL(request.url).searchParams.get('view') === 'outcome'
  )
    return observeEmployeeCliOutcome(request, operationId);
  return makeEmployeeCliRecoveryBoundary({
    authorize: authorizeEmployeeCliRecovery,
    connect: connectEmployeeRejection,
    journal: (original) =>
      createEmployeeRuntimeJournal(original, authorizeEmployeeCliRecovery),
  })(request, operationId);
}
export const GET = handle;
export const POST = handle;
