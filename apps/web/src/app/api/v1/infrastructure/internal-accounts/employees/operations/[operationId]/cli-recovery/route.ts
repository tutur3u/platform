import { connection } from 'next/server';
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
  return makeEmployeeCliRecoveryBoundary({
    authorize: authorizeEmployeeCliRecovery,
    connect: connectEmployeeRejection,
    journal: (original) =>
      createEmployeeRuntimeJournal(original, authorizeEmployeeCliRecovery),
  })(request, (await context.params).operationId);
}
export const GET = handle;
export const POST = handle;
