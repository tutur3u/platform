import type { NextRequest, NextResponse } from 'next/server';

interface VercelDeploymentEnvironment {
  VERCEL_DEPLOYMENT_ID?: string;
  VERCEL_SKEW_PROTECTION_ENABLED?: string;
}

const VERCEL_DEPLOYMENT_COOKIE = '__vdpl';

export function pinFinanceDeployment(
  request: NextRequest,
  response: NextResponse,
  env: VercelDeploymentEnvironment = {
    VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    VERCEL_SKEW_PROTECTION_ENABLED: process.env.VERCEL_SKEW_PROTECTION_ENABLED,
  }
) {
  const deploymentId = env.VERCEL_DEPLOYMENT_ID?.trim();

  if (
    env.VERCEL_SKEW_PROTECTION_ENABLED !== '1' ||
    !deploymentId ||
    request.cookies.has(VERCEL_DEPLOYMENT_COOKIE)
  ) {
    return response;
  }

  response.cookies.set(VERCEL_DEPLOYMENT_COOKIE, deploymentId, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: true,
  });

  return response;
}
