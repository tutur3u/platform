import { connection } from 'next/server';
import { accountsRead } from '@/lib/account-management/http';
export async function GET(request: Request) {
  await connection();
  return accountsRead(request);
}
