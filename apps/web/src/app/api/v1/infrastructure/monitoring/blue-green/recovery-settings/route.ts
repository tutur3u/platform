import { NextResponse } from 'next/server';
import {
  normalizeBlueGreenDockerRecoverySettings,
  writeBlueGreenDockerRecoverySettings,
} from '@/lib/infrastructure/blue-green-monitoring-controls';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInfrastructureOperator } from '../authorization';

export async function PATCH(request: Request) {
  const authorization = await authorizeInfrastructureOperator(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Expected a JSON request body.' },
      { status: 400 }
    );
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json(
      { message: 'Expected a JSON object.' },
      { status: 400 }
    );
  }

  try {
    const normalized = normalizeBlueGreenDockerRecoverySettings(payload);
    const settings = writeBlueGreenDockerRecoverySettings({
      ...normalized,
      updatedBy: authorization.user.id,
      updatedByEmail: authorization.user.email ?? null,
    });

    return NextResponse.json({
      message: 'Updated Docker recovery settings.',
      settings,
    });
  } catch (error) {
    serverLogger.error('Failed to update Docker recovery settings:', error);
    return NextResponse.json(
      { message: 'Failed to update Docker recovery settings' },
      { status: 500 }
    );
  }
}
