import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure';
import { NextResponse } from 'next/server';
import { readBlueGreenMonitoringSnapshot } from '@/lib/infrastructure/blue-green-monitoring';
import { authorizeInfrastructureViewer } from './authorization';

export async function GET(request: Request) {
  const authorization = await authorizeInfrastructureViewer(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const snapshot: BlueGreenMonitoringSnapshot =
      readBlueGreenMonitoringSnapshot();

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('Failed to load blue-green monitoring snapshot:', error);
    return NextResponse.json(
      { message: 'Failed to load blue-green monitoring snapshot' },
      { status: 500 }
    );
  }
}
