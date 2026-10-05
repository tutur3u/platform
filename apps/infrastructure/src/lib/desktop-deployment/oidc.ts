import 'server-only';
import {
  createRemoteJWKSet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from 'jose';
import {
  DESKTOP_DEPLOYMENT_AUDIENCE,
  DESKTOP_DEPLOYMENT_ISSUER,
  DESKTOP_DEPLOYMENT_SUBJECT,
  DesktopDeploymentContractError,
} from './contract';
import { validateDesktopOidcClaims } from './oidc-claims';

const githubKeys = createRemoteJWKSet(
  new URL(`${DESKTOP_DEPLOYMENT_ISSUER}/.well-known/jwks`),
  { timeoutDuration: 15000 }
);

export async function verifyDesktopGitHubOidcToken(
  token: string,
  // Injectable key resolver enables signed fixture tests without trusting unverified payloads.
  keyResolver: JWTVerifyGetKey = githubKeys
) {
  if (!token) throw new DesktopDeploymentContractError('missing_oidc');
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keyResolver, {
      issuer: DESKTOP_DEPLOYMENT_ISSUER,
      audience: DESKTOP_DEPLOYMENT_AUDIENCE,
      subject: DESKTOP_DEPLOYMENT_SUBJECT,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat'],
      maxTokenAge: '10m',
    }));
  } catch {
    // Never expose a token, claims or cryptographic diagnostics to logs/callers.
    throw new DesktopDeploymentContractError('invalid_oidc');
  }
  return validateDesktopOidcClaims(payload);
}
