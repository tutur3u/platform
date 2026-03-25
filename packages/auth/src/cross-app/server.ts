import {
  createAdminClient,
  createClient,
  createDetachedClient,
} from '@tuturuuu/supabase/next/server';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Creates a POST handler for cross-app token verification.
 *
 * When a valid token is verified, this creates a fresh session using a
 * "detached" Supabase client (no cookie reads/writes). The session tokens
 * are returned in the response body so the CLIENT stores them via its own
 * cookie handler. This prevents the server response from overwriting
 * another app's auth cookies — the root cause of cross-app session
 * clobbering on shared domains (e.g. localhost in development).
 *
 * @param appName The name of the target app (e.g., 'nova', 'rewise', 'platform')
 */
export function createPOST(appName: AppName) {
  return async function POST(request: NextRequest) {
    try {
      const supabase = await createClient();

      // Get the request body
      const body = await request.json();
      const { token } = body;

      if (!token) {
        return NextResponse.json(
          { error: 'Missing required parameter: token' },
          { status: 400 }
        );
      }

      console.log('[cross-app] Validating token for app:', appName);

      // Call the RPC function to validate the token
      const { data, error } = await supabase.rpc(
        'validate_cross_app_token_with_session',
        {
          p_token: token,
          p_target_app: appName,
        }
      );

      if (error) {
        console.error('[cross-app] Error validating token:', error);
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      if (!data) {
        console.error('[cross-app] No data returned from RPC');
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      // Process the result - first row of the returned table
      const firstRow = Array.isArray(data) ? data[0] : data;

      if (!firstRow?.user_id) {
        console.log('[cross-app] Invalid result or user_id is null');
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      const userId = firstRow.user_id as string;
      console.log('[cross-app] Token valid for user:', userId);

      // Create an independent session for the satellite app.
      // We NEVER share refresh tokens between apps — Supabase uses refresh
      // token rotation, so sharing causes the first-to-refresh to invalidate
      // the other's session. Instead we always create a fresh session via
      // generateLink + verifyOtp.
      //
      // Optimization: if the origin app passed the user's email through
      // session_data, we skip the getUserById admin call (saves 1 round-trip).
      try {
        const sbAdmin = await createAdminClient();

        const sessionData = firstRow.session_data as {
          email?: string;
        } | null;

        let userEmail: string | undefined;

        if (sessionData?.email) {
          // Fast path: use pre-fetched email, skip getUserById
          console.log('[cross-app] Using email from session_data (fast path)');
          userEmail = sessionData.email;
        } else {
          // Slow path: look up user email via admin API
          const { data: userData, error: userError } =
            await sbAdmin.auth.admin.getUserById(userId);

          if (userError || !userData?.user?.email) {
            console.error(
              '[cross-app] Could not get user for session creation:',
              userError
            );
            return NextResponse.json({
              userId,
              valid: true,
              sessionCreated: false,
            });
          }

          userEmail = userData.user.email;
        }

        if (!userEmail) {
          console.error('[cross-app] No email available for session creation');
          return NextResponse.json({
            userId,
            valid: true,
            sessionCreated: false,
          });
        }

        // Generate a magic link for the user
        const { data: linkData, error: linkError } =
          await sbAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: userEmail,
          });

        if (linkError || !linkData) {
          console.error(
            '[cross-app] Could not generate session link:',
            linkError
          );
          return NextResponse.json({
            userId,
            valid: true,
            sessionCreated: false,
          });
        }

        // Extract the token hash from the magic link
        const magicLinkUrl = new URL(linkData.properties.action_link);
        const tokenHash = magicLinkUrl.searchParams.get('token');

        if (!tokenHash) {
          console.error('[cross-app] No token hash in magic link');
          return NextResponse.json({
            userId,
            valid: true,
            sessionCreated: false,
          });
        }

        // Verify OTP using a DETACHED client (no cookie side-effects)
        const detached = createDetachedClient();
        const { data: otpData, error: verifyError } =
          await detached.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'magiclink',
          });

        if (verifyError || !otpData.session) {
          console.error(
            '[cross-app] Could not verify magic link:',
            verifyError
          );
          return NextResponse.json({
            userId,
            valid: true,
            sessionCreated: false,
          });
        }

        console.log('[cross-app] Fresh session created for user:', userId);

        // Return session tokens in the response body.
        // The CLIENT will call setSession() to store them in its own cookies.
        return NextResponse.json({
          userId,
          valid: true,
          sessionCreated: true,
          session: {
            access_token: otpData.session.access_token,
            refresh_token: otpData.session.refresh_token,
          },
        });
      } catch (sessionError) {
        console.error(
          '[cross-app] Error creating fresh session:',
          sessionError
        );
      }

      // Return the user ID even if session creation failed
      // The client can handle re-authentication if needed
      return NextResponse.json({
        userId,
        valid: true,
        sessionCreated: false,
      });
    } catch (error) {
      console.error('[cross-app] Error processing request:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
