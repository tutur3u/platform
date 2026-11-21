import { accountsMutate } from '@/lib/account-management/http';
export function POST(request: Request) {
  return accountsMutate(request, 'invite');
}
