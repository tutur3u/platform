import { connection } from 'next/server';
import { accountsMutate, accountsRead } from '@/lib/account-management/http';
type Context = { params: Promise<{ userId: string }> };
export async function GET(request: Request, { params }: Context) {
  await connection();
  return accountsRead(request, (await params).userId);
}
export async function DELETE(request: Request, { params }: Context) {
  return accountsMutate(request, 'delete', (await params).userId);
}
