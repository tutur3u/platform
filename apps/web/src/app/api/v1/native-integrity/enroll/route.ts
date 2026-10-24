import type { NextRequest } from 'next/server';
import { nativeIntegrityEndpoint } from '@/lib/native-integrity/endpoints';
export async function POST(request: NextRequest) {
  return nativeIntegrityEndpoint(request, 'enroll');
}
