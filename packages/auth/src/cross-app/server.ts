import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Creates a POST handler for cross-app token verification
 * When a valid token is verified, this creates a fresh session for the user
 * in the target app, rather than copying session tokens between services.
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

      if (!firstRow || !firstRow.user_id) {
        console.log('[cross-app] Invalid result or user_id is null');
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      const userId = firstRow.user_id as string;
      console.log('[cross-app] Token valid for user:', userId);

      // Create a fresh session for the user using admin API
      // This generates new tokens instead of copying existing ones
      try {
        const sbAdmin = await createAdminClient();

        // Generate a magic link for the user - this creates a fresh session
        const { data: linkData, error: linkError } =
          await sbAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: '', // We'll get email from user lookup
            options: {
              // Short-lived link, only for immediate use
              redirectTo: request.nextUrl.origin,
            },
          });

        // If we can't generate a link directly, get user email first
        if (linkError) {
          // Get user details to find their email
          const { data: userData, error: userError } =
            await sbAdmin.auth.admin.getUserById(userId);

          if (userError || !userData?.user?.email) {
            console.error(
              '[cross-app] Could not get user for session creation:',
              userError
            );
            // Fall back to just returning the userId - client will handle session
            return NextResponse.json({
              userId,
              valid: true,
              sessionCreated: false,
            });
          }

          // Generate magic link with user's email
          const { data: newLinkData, error: newLinkError } =
            await sbAdmin.auth.admin.generateLink({
              type: 'magiclink',
              email: userData.user.email,
            });

          if (newLinkError || !newLinkData) {
            console.error(
              '[cross-app] Could not generate session link:',
              newLinkError
            );
            return NextResponse.json({
              userId,
              valid: true,
              sessionCreated: false,
            });
          }

          // Extract the token from the magic link
          const magicLinkUrl = new URL(newLinkData.properties.action_link);
          const tokenHash = magicLinkUrl.searchParams.get('token');

          if (tokenHash) {
            // Use the token to create a session
            const { error: verifyError } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: 'magiclink',
            });

            if (verifyError) {
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
            return NextResponse.json({
              userId,
              valid: true,
              sessionCreated: true,
            });
          }
        } else if (linkData) {
          // Magic link generated successfully with provided email
          const magicLinkUrl = new URL(linkData.properties.action_link);
          const tokenHash = magicLinkUrl.searchParams.get('token');

          if (tokenHash) {
            const { error: verifyError } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: 'magiclink',
            });

            if (!verifyError) {
              console.log(
                '[cross-app] Fresh session created for user:',
                userId
              );
              return NextResponse.json({
                userId,
                valid: true,
                sessionCreated: true,
              });
            }
          }
        }
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
