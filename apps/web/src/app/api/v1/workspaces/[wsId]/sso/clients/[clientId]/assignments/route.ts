import { manageSso } from '@/lib/sso/management';

type Context = { params: Promise<{ wsId: string; clientId: string }> };
export async function PUT(request: Request, context: Context) {
  return manageSso(request, await context.params, 'assignment');
}
