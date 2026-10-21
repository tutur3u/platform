import { connection } from 'next/server';
import { observeEmployeeCreation } from '@/lib/infrastructure/employee-creation-observation';

export async function GET(
  request: Request,
  context: { params: Promise<{ operationId: string }> }
) {
  await connection();
  const { operationId } = await context.params;
  return observeEmployeeCreation(request, operationId);
}
