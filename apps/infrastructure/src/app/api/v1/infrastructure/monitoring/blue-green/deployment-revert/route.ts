import type { BlueGreenMonitoringDeployment } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { NextResponse } from 'next/server';
import { readBlueGreenMonitoringSnapshot } from '@/lib/infrastructure/blue-green-monitoring';
import { queueBlueGreenDeploymentRevertRequest } from '@/lib/infrastructure/blue-green-monitoring-controls';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInfrastructureOperator } from '../authorization';

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

function findRevertTarget(
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

  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const requestedCommitHash = normalizeCommitHash(record.commitHash);

  if (requestedCommitHash.length < 7) {
    return NextResponse.json(
      { message: 'Expected a commit hash with at least 7 characters.' },
      { status: 400 }
    );
  }

  try {
    const snapshot = readBlueGreenMonitoringSnapshot();
    const targetDeployment = findRevertTarget(
      snapshot.deployments,
      requestedCommitHash
    );

    if (!targetDeployment?.commitHash) {
      return NextResponse.json(
        { message: 'No successful deployment was found for that commit.' },
        { status: 404 }
      );
    }

    const cachedTarget = snapshot.recoveryCache.deployments.find(
      (deployment) => deployment.commitHash === targetDeployment.commitHash
    );
    const requestedImageTag =
      typeof record.imageTag === 'string' ? record.imageTag : null;
    const imageTag =
      cachedTarget?.imageTag && requestedImageTag === cachedTarget.imageTag
        ? cachedTarget.imageTag
        : (cachedTarget?.imageTag ?? null);
    const revertRequest = queueBlueGreenDeploymentRevertRequest({
      commitHash: targetDeployment.commitHash,
      commitShortHash: targetDeployment.commitShortHash ?? null,
      commitSubject: targetDeployment.commitSubject ?? null,
      deploymentStamp: targetDeployment.deploymentStamp ?? null,
      imageTag,
      instant: Boolean(imageTag),
      requestedBy: authorization.user.id,
      requestedByEmail: authorization.user.email ?? null,
    });

    return NextResponse.json({
      message: imageTag
        ? 'Queued an instant cached production revert.'
        : 'Queued a production rollback and pin request.',
      request: revertRequest,
    });
  } catch (error) {
    serverLogger.error('Failed to queue production deployment revert:', error);
    return NextResponse.json(
      { message: 'Failed to queue production deployment revert' },
      { status: 500 }
    );
  }
}
