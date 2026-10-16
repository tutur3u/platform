import { connection } from 'next/server';
import { readInternalEmployeeManagement } from '@/lib/infrastructure/employee-management';

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  await connection();
  return readInternalEmployeeManagement(request, context);
}
