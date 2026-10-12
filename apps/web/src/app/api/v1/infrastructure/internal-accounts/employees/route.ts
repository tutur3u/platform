import { connection } from 'next/server';
import { authorizeEmployeeCreation } from '@/lib/infrastructure/employee-creation-authorization';
import { makeEmployeeCreationBoundary } from '@/lib/infrastructure/employee-creation-boundary';

// No persistent journal or runtime connector is installed by source preparation.
const handle = makeEmployeeCreationBoundary({
  authorize: authorizeEmployeeCreation,
});
export async function GET(request: Request) {
  await connection();
  return handle(request);
}
export async function POST(request: Request) {
  await connection();
  return handle(request);
}
