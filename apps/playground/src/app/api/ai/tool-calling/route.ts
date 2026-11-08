import { NextResponse } from 'next/server';
import {
  getPlaygroundAccess,
  playgroundDeniedResponse,
} from '@/lib/staff-access';

export const GET = async () => {
  const access = await getPlaygroundAccess();
  if (!access.ok) return playgroundDeniedResponse(access.status);

  return NextResponse.json({});
};
