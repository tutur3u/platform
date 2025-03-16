import { createClient } from '@tuturuuu/supabase/next/server';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';

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

      console.log('Validating token:', token, 'for app:', appName);

      // Call the RPC function directly
      const { data, error } = await supabase.rpc(
        'validate_cross_app_token_with_session',
        {
          p_token: token,
          p_target_app: appName,
        }
      );

      console.log('RPC response data:', JSON.stringify(data));
      console.log('RPC response error:', error);

      if (error) {
        console.error('Error validating cross-app token:', error);
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      if (!data) {
        console.error(
          'No data returned from validate_cross_app_token_with_session'
        );
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      // Process the result - first row of the returned table
      const firstRow = Array.isArray(data) ? data[0] : data;
      console.log('Processing result row:', JSON.stringify(firstRow));

      if (!firstRow || !firstRow.user_id) {
        console.log('Invalid result or user_id is null');
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      // If session data is available, set the session
      if (firstRow.session_data) {
        console.log(
          'Setting session with data:',
          JSON.stringify(firstRow.session_data)
        );

        // Type assertion for session_data
        const sessionData = firstRow.session_data as {
          access_token: string;
          refresh_token: string;
        };

        await supabase.auth.setSession({
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token,
        });
      } else {
        console.log('No session data available');
      }

      // Return the user ID
      return NextResponse.json({ userId: firstRow.user_id, valid: true });
    } catch (error) {
      console.error('Error validating cross-app token:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
