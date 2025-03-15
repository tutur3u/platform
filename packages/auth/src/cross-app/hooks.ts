import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@tuturuuu/types/supabase';
import { useCallback } from 'react';

/**
 * Hook for cross-app navigation
 * @param supabase The Supabase client
 * @param originApp The identifier of the current app (e.g., 'web')
 * @returns Functions for cross-app navigation
 */
export function useCrossAppNavigation(
  supabase: SupabaseClient<Database>,
  originApp: string
) {
  /**
   * Navigate to another app using cross-app authentication
   * @param targetAppUrl The URL of the target app (e.g., 'https://nova.tuturuuu.com')
   * @param targetPath The path to navigate to in the target app (e.g., '/dashboard')
   * @param targetApp The identifier of the target app (e.g., 'nova')
   * @param expirySeconds Token expiry in seconds (default: 300 seconds / 5 minutes)
   */
  const navigateTo = useCallback(
    async (
      targetAppUrl: string,
      targetPath: string,
      targetApp: string,
      expirySeconds: number = 300
    ) => {
      try {
        // Get the current user
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          console.error('Error getting user:', userError);
          // Redirect to the target app without a token, it will handle authentication
          window.location.href = `${targetAppUrl}${targetPath}`;
          return;
        }

        // Call the RPC function to generate a token
        const { data: token, error } = await supabase.rpc(
          'generate_cross_app_token',
          {
            p_user_id: user.id,
            p_origin_app: originApp,
            p_target_app: targetApp,
            p_expiry_seconds: expirySeconds,
          }
        );

        if (error || !token) {
          console.error('Error generating cross-app token:', error);
          // Redirect to the target app without a token, it will handle authentication
          window.location.href = `${targetAppUrl}${targetPath}`;
          return;
        }

        // Redirect to the target app with the token as a query parameter
        window.location.href = `${targetAppUrl}${targetPath}?token=${token}`;
      } catch (error) {
        console.error('Unexpected error navigating to cross app:', error);
        // Redirect to the target app without a token, it will handle authentication
        window.location.href = `${targetAppUrl}${targetPath}`;
      }
    },
    [supabase, originApp]
  );

  /**
   * Create a link to another app using cross-app authentication
   * @param targetAppUrl The URL of the target app (e.g., 'https://nova.tuturuuu.com')
   * @param targetPath The path to navigate to in the target app (e.g., '/dashboard')
   * @param targetApp The identifier of the target app (e.g., 'nova')
   * @param expirySeconds Token expiry in seconds (default: 300 seconds / 5 minutes)
   * @returns A promise that resolves to the URL with the token
   */
  const createLink = useCallback(
    async (
      targetAppUrl: string,
      targetPath: string,
      targetApp: string,
      expirySeconds: number = 300
    ): Promise<string> => {
      try {
        // Get the current user
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          console.error('Error getting user:', userError);
          // Return the target app URL without a token
          return `${targetAppUrl}${targetPath}`;
        }

        // Call the RPC function to generate a token
        const { data: token, error } = await supabase.rpc(
          'generate_cross_app_token',
          {
            p_user_id: user.id,
            p_origin_app: originApp,
            p_target_app: targetApp,
            p_expiry_seconds: expirySeconds,
          }
        );

        if (error || !token) {
          console.error('Error generating cross-app token:', error);
          // Return the target app URL without a token
          return `${targetAppUrl}${targetPath}`;
        }

        // Return the target app URL with the token as a query parameter
        return `${targetAppUrl}${targetPath}?token=${token}`;
      } catch (error) {
        console.error('Unexpected error creating cross app link:', error);
        // Return the target app URL without a token
        return `${targetAppUrl}${targetPath}`;
      }
    },
    [supabase, originApp]
  );

  return {
    navigateTo,
    createLink,
  };
}
