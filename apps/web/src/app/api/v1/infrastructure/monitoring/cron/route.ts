import { NextResponse } from 'next/server';
import { readCronMonitoringSnapshot } from '@/lib/infrastructure/cron-monitoring';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  readManagedExternalCronMonitoring,
  unavailableManagedExternalCronMonitoring,
} from '@/lib/infrastructure/managed-external-cron-monitoring';
import { authorizeInfrastructureViewer } from '../blue-green/authorization';

export async function GET(request: Request) {
  const authorization = await authorizeInfrastructureViewer(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const snapshot = readCronMonitoringSnapshot();

    try {
      return NextResponse.json({
        ...snapshot,
        managedExternalCron: await readManagedExternalCronMonitoring(),
      });
    } catch (error) {
      serverLogger.error(
        'Failed to load managed external cron monitoring snapshot:',
        error
      );
      return NextResponse.json({
        ...snapshot,
        managedExternalCron: unavailableManagedExternalCronMonitoring(),
      });
    }
  } catch (error) {
    serverLogger.error('Failed to load cron monitoring snapshot:', error);
    return NextResponse.json(
      { message: 'Failed to load cron monitoring snapshot' },
      { status: 500 }
    );
  }
}
