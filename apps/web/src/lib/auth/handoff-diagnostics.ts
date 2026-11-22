type HandoffPath =
  | '/api/v1/auth/cross-app-return'
  | '/api/v1/auth/cross-app-session/refresh'
  | '/api/v1/auth/cross-app-token/verify';

type HandoffErrorCode =
  | 'ACCOUNT_CHANGED'
  | 'APP_SESSION_REFRESH_UNAVAILABLE'
  | 'AUTH_UNAVAILABLE'
  | 'INVALID_CODE_CHALLENGE'
  | 'INVALID_MFA_MAX_AGE'
  | 'INVALID_REFRESH_CREDENTIALS'
  | 'INVALID_REFRESH_PAYLOAD'
  | 'INVALID_RETURN_URL'
  | 'INVALID_VERIFICATION_PAYLOAD'
  | 'ISSUER_PROOF_REQUIRED'
  | 'MFA_REQUIRED'
  | 'MISSING_REFRESH_CREDENTIALS'
  | 'PKCE_REQUIRED'
  | 'REDEEM_PROOF_REQUIRED'
  | 'REFRESH_RATE_LIMITED'
  | 'REFRESH_SUBJECT_UNAVAILABLE'
  | 'TOKEN_MINT_FAILED'
  | 'TOKEN_VERIFICATION_FAILED'
  | 'UNAUTHORIZED';

export type ReportHandoffFailure = (
  code: HandoffErrorCode,
  response: Response
) => Response;

export async function withAuthHandoffDiagnostics(
  path: HandoffPath,
  handler: (fail: ReportHandoffFailure) => Promise<Response>
): Promise<Response> {
  function log(code: HandoffErrorCode | 'INTERNAL_ERROR', status: number) {
    console.warn(
      JSON.stringify({ code, path, requestId: crypto.randomUUID(), status })
    );
  }

  try {
    return await handler((code, response) => {
      log(code, response.status);
      return response;
    });
  } catch (error) {
    log('INTERNAL_ERROR', 500);
    throw error;
  }
}
