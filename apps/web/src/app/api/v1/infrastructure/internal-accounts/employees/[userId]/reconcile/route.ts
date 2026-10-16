import { connection } from 'next/server';
import { employeeRestorationHandlers } from '@/lib/infrastructure/employee-restoration-runtime';

export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  await connection();
  return employeeRestorationHandlers.reconcile(request, context);
}
