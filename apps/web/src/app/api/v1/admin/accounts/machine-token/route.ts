import { accountsMachineExchange } from '@/lib/account-management/http';
export function POST(request: Request) {
  return accountsMachineExchange(request);
}
