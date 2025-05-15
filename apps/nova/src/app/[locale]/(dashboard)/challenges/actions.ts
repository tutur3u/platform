'use server';

import { AdminsResponse } from './challengeForm';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';

export async function fetchAdmins(): Promise<AdminsResponse> {
  try {
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.email) {
      throw new Error('Auth error or missing user');
    }

    // Check if the requester has permission to see admins
    const { data: userRole, error: roleError } = await sbAdmin
      .from('platform_user_roles')
      .select(
        'allow_challenge_management, allow_manage_all_challenges, allow_role_management'
      )
      .eq('user_id', user.id)
      .single();

    if (roleError) {
      console.error('Error fetching user role:', roleError);
      throw new Error('Error fetching user permissions');
    }

    // Only allow admins to fetch other admins
    if (
      !userRole?.allow_challenge_management &&
      !userRole?.allow_manage_all_challenges &&
      !userRole?.allow_role_management
    ) {
      throw new Error('Insufficient permissions to view administrators');
    }

    // Fetch only regular challenge admins (not super admins)
    const { data: admins, error: adminsError } = await sbAdmin
      .from('platform_user_roles')
      .select(
        'user_id, enabled, allow_challenge_management,...users!inner(...user_private_details!inner(email))'
      )
      .eq('enabled', true)
      .eq('allow_challenge_management', true)
      .eq('allow_manage_all_challenges', false)
      .eq('allow_role_management', false)
      .order('created_at');

    if (adminsError) {
      console.error('Error fetching admins:', adminsError);
      throw new Error('Failed to fetch administrators');
    }

    const emails = (admins || [])
      .filter((admin) => admin.email !== null)
      .map((admin) => admin.email as string);

    return { admins: emails };
  } catch (error) {
    console.error('Error in getAdmins:', error);
    return { admins: [], error: String(error) };
  }
}
