import { connection } from 'next/server';
import { handleEmployeeRejection } from '@/lib/infrastructure/employee-rejection-boundary';

async function handle(
  request: Request,
  context: { params: Promise<{ operationId: string }> }
) {
  await connection();
  return handleEmployeeRejection(request, (await context.params).operationId);
}
export const GET = handle;
export const POST = handle;
