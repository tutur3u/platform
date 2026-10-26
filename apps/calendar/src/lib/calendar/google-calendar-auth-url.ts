import { OAuth2Client } from '@tuturuuu/google';
import {
  createCalendarOAuthState,
  deriveCalendarOAuthPkce,
} from './calendar-oauth-state';
import { resolveGoogleCalendarOAuthRedirectUri } from './google-oauth-urls';

type GenerateAuthUrlOptions = NonNullable<
  Parameters<InstanceType<typeof OAuth2Client>['generateAuthUrl']>[0]
>;
const S256 = 'S256' as GenerateAuthUrlOptions['code_challenge_method'];

/**
 * Signed, PKCE-bound Google Calendar authorization URL. `consent` shows the
 * consent screen, which makes Google issue a fresh refresh token even for an
 * existing grant; ordinary reconnects omit it.
 */
export function buildGoogleCalendarAuthUrl(args: {
  request: Request;
  userId: string;
  wsId: string;
  clientId: string;
  clientSecret: string;
  consent: boolean;
}) {
  const auth = new OAuth2Client({
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    redirectUri: resolveGoogleCalendarOAuthRedirectUri(args.request),
  });
  const { nonce, state } = createCalendarOAuthState(
    'google',
    { userId: args.userId, wsId: args.wsId },
    args.clientSecret
  );
  const { codeChallenge } = deriveCalendarOAuthPkce(
    'google',
    nonce,
    args.clientSecret
  );
  return auth.generateAuthUrl({
    state,
    code_challenge: codeChallenge,
    code_challenge_method: S256,
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    access_type: 'offline',
    ...(args.consent ? { prompt: 'consent' } : {}),
    include_granted_scopes: true,
  });
}
