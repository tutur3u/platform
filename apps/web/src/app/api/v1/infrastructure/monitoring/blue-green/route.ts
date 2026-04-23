import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure';
import { NextResponse } from 'next/server';
import { readBlueGreenMonitoringSnapshot } from '@/lib/infrastructure/blue-green-monitoring';
import { authorizeInfrastructureViewer } from './authorization';

function parseOptionalPositiveInt(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function GET(request: Request) {
  const authorization = await authorizeInfrastructureViewer(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const snapshot: BlueGreenMonitoringSnapshot =
      readBlueGreenMonitoringSnapshot({
        requestPreviewLimit: parseOptionalPositiveInt(
          searchParams.get('requestPreviewLimit')
        ),
        watcherLogLimit: parseOptionalPositiveInt(
          searchParams.get('watcherLogLimit')
        ),
      });

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('Failed to load blue-green monitoring snapshot:', error);
    return NextResponse.json(
      { message: 'Failed to load blue-green monitoring snapshot' },
      { status: 500 }
    );
  }
}
