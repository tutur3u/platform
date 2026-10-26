import type { NextRequest } from 'next/server';
import { connection } from 'next/server';
import { handleCalendarSettings } from '@/lib/calendar-settings-handler';

type Context = { params: Promise<{ wsId: string }> };

export async function GET(request: NextRequest, context: Context) {
  await connection();
  return handleCalendarSettings(request, (await context.params).wsId);
}

export async function PATCH(request: NextRequest, context: Context) {
  return handleCalendarSettings(request, (await context.params).wsId);
}
