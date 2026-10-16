import { connection } from 'next/server';
import { authorizeEmployeeCreation } from '@/lib/infrastructure/employee-creation-authorization';
import { makeEmployeeCreationBoundary } from '@/lib/infrastructure/employee-creation-boundary';
import { createEmployeeRuntimeJournal } from '@/lib/infrastructure/employee-creation-runtime';

export const maxDuration = 60;
async function handle(request: Request) {
  const journal = await createEmployeeRuntimeJournal(request);
  return makeEmployeeCreationBoundary({
    authorize: authorizeEmployeeCreation,
    journal,
  })(request);
}
export async function GET(request: Request) {
  await connection();
  return handle(request);
}
export async function POST(request: Request) {
  await connection();
  return handle(request);
}
