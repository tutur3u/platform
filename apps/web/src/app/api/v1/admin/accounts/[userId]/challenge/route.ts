import { accountsChallenge } from '@/lib/account-management/http';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  return accountsChallenge(request, (await params).userId);
}
