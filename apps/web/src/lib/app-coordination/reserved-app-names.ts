import {
  FIRST_PARTY_APP_SESSION_SCOPE,
  isReservedInternalAppName,
} from '@tuturuuu/utils/external-app-registry-policy';

/**
 * Whether verified app-coordination claims belong to an external app rather
 * than a first-party app session. First-party sessions always carry
 * `internal-app:session` and target a reserved internal app name; external
 * registrations can have neither, and the exchange never issues them the
 * internal scopes.
 */
export function isExternalAppClaims(claims: {
  scopes?: readonly string[] | null;
  target_app: string;
}) {
  // Claims without a scope list are treated as external, so they get the
  // registry check rather than a first-party pass.
  const scopes = Array.isArray(claims.scopes) ? claims.scopes : [];
  return (
    !scopes.includes(FIRST_PARTY_APP_SESSION_SCOPE) &&
    !isReservedInternalAppName(claims.target_app)
  );
}
