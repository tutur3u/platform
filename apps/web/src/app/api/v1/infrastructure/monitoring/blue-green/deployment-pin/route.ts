import type { BlueGreenMonitoringDeployment } from '@tuturuuu/internal-api/infrastructure';
import { NextResponse } from 'next/server';
import { readBlueGreenMonitoringSnapshot } from '@/lib/infrastructure/blue-green-monitoring';
import {
  clearBlueGreenDeploymentPin,
  writeBlueGreenDeploymentPin,
} from '@/lib/infrastructure/blue-green-monitoring-controls';
import { authorizeInfrastructureViewer } from '../authorization';

function normalizeCommitHash(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function matchesCommit(
  deployment: BlueGreenMonitoringDeployment,
  requestedCommitHash: string
) {
  return (
    deployment.commitHash === requestedCommitHash ||
    deployment.commitHash?.startsWith(requestedCommitHash) ||
    deployment.commitShortHash === requestedCommitHash
  );
}

function findRollbackTarget(
  deployments: BlueGreenMonitoringDeployment[],
  requestedCommitHash: string
) {
  return deployments.find(
    (deployment) =>
      deployment.status === 'successful' &&
      deployment.commitHash &&
      matchesCommit(deployment, requestedCommitHash)
  );
}

export async function POST(request: Request) {
  const authorization = await authorizeInfrastructureViewer(request);
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

  const requestedCommitHash = normalizeCommitHash(
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).commitHash
      : null
  );

  if (requestedCommitHash.length < 7) {
    return NextResponse.json(
      { message: 'Expected a commit hash with at least 7 characters.' },
      { status: 400 }
    );
  }

  try {
    const snapshot = readBlueGreenMonitoringSnapshot();
    const targetDeployment = findRollbackTarget(
      snapshot.deployments,
      requestedCommitHash
    );

    if (!targetDeployment?.commitHash) {
      return NextResponse.json(
        { message: 'No successful deployment was found for that commit.' },
        { status: 404 }
      );
    }

    const pin = writeBlueGreenDeploymentPin({
      activeColor: targetDeployment.activeColor ?? null,
      commitHash: targetDeployment.commitHash,
      commitShortHash: targetDeployment.commitShortHash ?? null,
      commitSubject: targetDeployment.commitSubject ?? null,
      deploymentStamp: targetDeployment.deploymentStamp ?? null,
      requestedBy: authorization.user.id,
      requestedByEmail: authorization.user.email ?? null,
    });

    return NextResponse.json({
      message: 'Pinned production to the selected deployment.',
      pin,
    });
  } catch (error) {
    console.error('Failed to pin blue-green deployment:', error);
    return NextResponse.json(
      { message: 'Failed to pin blue-green deployment' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeInfrastructureViewer(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    clearBlueGreenDeploymentPin();

    return NextResponse.json({
      message: 'Cleared the pinned deployment.',
    });
  } catch (error) {
    console.error('Failed to clear blue-green deployment pin:', error);
    return NextResponse.json(
      { message: 'Failed to clear blue-green deployment pin' },
      { status: 500 }
    );
  }
}
