import { manageSso } from '@/lib/sso/management';

type Context = { params: Promise<{ wsId: string }> };
export async function GET(request: Request, context: Context) {
  return manageSso(request, await context.params, 'list');
}
export async function POST(request: Request, context: Context) {
  return manageSso(request, await context.params, 'create');
}
