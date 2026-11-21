import { connection } from 'next/server';
import { accountOperationStatus } from '@/lib/account-management/http';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ operationId: string }> }
) {
  await connection();
  return accountOperationStatus(request, (await params).operationId);
}
