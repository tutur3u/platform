import { connection } from 'next/server';
import { handleGoogleColorRecovery } from '@/lib/calendar/google-color-operations/route-handlers';

type Params = { params: Promise<{ wsId: string; eventId: string }> };
export async function GET(request: Request, { params }: Params) {
  await connection();
  const { wsId, eventId } = await params;
  return handleGoogleColorRecovery(request, wsId, eventId, 'inspect');
}
export async function POST(request: Request, { params }: Params) {
  const { wsId, eventId } = await params;
  return handleGoogleColorRecovery(request, wsId, eventId, 'execute');
}
export async function DELETE(request: Request, { params }: Params) {
  const { wsId, eventId } = await params;
  return handleGoogleColorRecovery(request, wsId, eventId, 'cancel');
}
