import { manageSso } from '@/lib/sso/management';

type Context = { params: Promise<{ wsId: string; clientId: string }> };
export async function GET(request: Request, context: Context) {
  return manageSso(request, await context.params, 'detail');
}
export async function PATCH(request: Request, context: Context) {
  return manageSso(request, await context.params, 'update');
}
