import { NextResponse } from 'next/server';

export const lmsPrivateHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
};

export function lmsFailure(
  status: 400 | 401 | 403 | 404 | 500,
  code: string,
  message: string
) {
  return NextResponse.json(
    { code, message },
    { status, headers: lmsPrivateHeaders }
  );
}

export function lmsNotAvailable() {
  return lmsFailure(404, 'LMS_NOT_AVAILABLE', 'LMS is unavailable');
}

export function lmsAuthFailure(status: number) {
  return status === 403
    ? lmsFailure(403, 'LMS_FORBIDDEN', 'LMS access is denied')
    : lmsFailure(401, 'LMS_UNAUTHENTICATED', 'Authentication required');
}
