import { accountsMutate } from '@/lib/account-management/http';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  return accountsMutate(request, 'role', (await params).userId);
}
