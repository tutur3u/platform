import type { NextRequest } from 'next/server';
import { connection } from 'next/server';
import { handleCalendarSettings } from '@/lib/calendar-settings-handler';

export async function GET(request: NextRequest) {
  await connection();
  return handleCalendarSettings(request);
}

export async function PATCH(request: NextRequest) {
  return handleCalendarSettings(request);
}
