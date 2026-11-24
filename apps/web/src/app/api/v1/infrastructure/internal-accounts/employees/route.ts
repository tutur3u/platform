import { connection } from 'next/server';
import { makeEmployeeCreationBoundary } from '@/lib/infrastructure/employee-creation-boundary';
import { guardEmployeeCreationCli } from '@/lib/infrastructure/employee-creation-cli-guard';
import { authorizeEmployeeCreationRequest } from '@/lib/infrastructure/employee-creation-request-authorization';
import { createEmployeeRuntimeJournal } from '@/lib/infrastructure/employee-creation-runtime';

export const maxDuration = 60;
async function handle(request: Request) {
  // The journal re-authorizes the actor with the same admission as the route.
  const journal = await createEmployeeRuntimeJournal(
    request,
    authorizeEmployeeCreationRequest
  );
  return makeEmployeeCreationBoundary({
    authorize: authorizeEmployeeCreationRequest,
    journal,
  })(request);
}
export async function GET(request: Request) {
  await connection();
  return handle(request);
}
export async function POST(request: Request) {
  await connection();
  // CLI creates are rate limited and audited; other credentials pass through.
  return guardEmployeeCreationCli(request, handle);
}
