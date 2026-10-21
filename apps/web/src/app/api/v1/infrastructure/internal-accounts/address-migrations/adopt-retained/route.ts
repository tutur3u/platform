import { connection } from 'next/server';
import { employeeAddressMigrationHandlers } from '@/lib/infrastructure/employee-address-migration-runtime';

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  return employeeAddressMigrationHandlers.adoptRetained(request);
}
