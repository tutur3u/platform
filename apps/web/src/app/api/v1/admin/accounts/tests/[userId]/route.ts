import { accountsMutate } from '@/lib/account-management/http';
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  return accountsMutate(request, 'test-delete', (await params).userId);
}
