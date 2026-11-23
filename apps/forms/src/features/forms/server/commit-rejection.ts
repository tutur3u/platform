import type { SharedFormCommitResult } from './commit-response';

/**
 * Maps a refused or replayed `commit_form_response` result to the public
 * route's status and message. The transaction reports one `limit` for both
 * the response cap and the one-response settings, so a signed-in respondent's
 * earlier response decides which message applies.
 */
export async function describeCommitRejection(
  result: SharedFormCommitResult,
  context: {
    respondentUserId: string | null;
    onePerRespondent: boolean;
    /** Whether this respondent already has a response to the form. */
    hasResponse: (respondentUserId: string) => Promise<boolean>;
  }
): Promise<{ status: number; error: string }> {
  switch (result.kind) {
    case 'submitted':
    case 'conflict':
      return { status: 409, error: 'This session has already been submitted' };
    case 'closed':
      return {
        status: 410,
        error: 'This form is not currently accepting responses',
      };
    case 'not_found':
      return { status: 404, error: 'Session not found' };
    case 'invalid':
      return { status: 400, error: 'Invalid response payload' };
    case 'policy_changed':
      return {
        status: 409,
        error:
          'This form changed while you were responding. Reload it and submit again',
      };
    case 'limit': {
      if (
        context.onePerRespondent &&
        context.respondentUserId &&
        (await context.hasResponse(context.respondentUserId))
      )
        return {
          status: 409,
          error: 'Only one response is allowed for this form',
        };
      return {
        status: 409,
        error: 'This form has reached its response limit',
      };
    }
  }
}
