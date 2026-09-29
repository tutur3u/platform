import { connection, NextResponse } from 'next/server';
import {
  authorizeMobileDeploymentAdmin,
  validateSameOriginMutation,
} from '@/lib/mobile-deployment/access';
import { exportActiveMobileDartDefines } from '@/lib/mobile-deployment/admin-env-export';
import { MobileDeploymentStoreError } from '@/lib/mobile-deployment/store';

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export async function POST(request: Request) {
  await connection();
  const csrf = validateSameOriginMutation(request);
  if (csrf) return csrf;

  const access = await authorizeMobileDeploymentAdmin(request);
  if (!access.ok) return access.response;

  try {
    const result = await exportActiveMobileDartDefines({
      db: access.db,
      userId: access.userId,
    });
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof MobileDeploymentStoreError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { headers: privateHeaders, status: error.status }
      );
    }
    console.error('Mobile Dart define export failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { message: 'Mobile configuration export unavailable' },
      { headers: privateHeaders, status: 500 }
    );
  }
}
