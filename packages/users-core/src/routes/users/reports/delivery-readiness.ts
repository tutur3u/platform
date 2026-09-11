import { NextResponse } from 'next/server';

export function isDeliveryMigrationPending(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return ['42883', 'PGRST202'].includes(String(error.code));
}

export function deliveryMigrationPendingResponse() {
  return NextResponse.json(
    {
      code: 'REPORT_DELIVERY_UPDATING',
      message: 'Report delivery is updating. Please try again shortly.',
      queued: false,
    },
    { status: 503, headers: { 'Retry-After': '60' } }
  );
}
