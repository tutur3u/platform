'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { GuestUserLead } from '@tuturuuu/types/primitives/GuestUserLead';
import { useEffect } from 'react';

interface Props {
  wsId: string;
  initialData: GuestUserLead[];
  initialCount: number;
  searchParams: {
    q?: string;
    page?: string;
    pageSize?: string;
  };
}

export default function GuestLeadsClient({
  wsId,
  initialData,
  initialCount,
  searchParams,
}: Props) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  const queryKey = ['guest-leads', wsId, searchParams];

  // Hydrate the initial data
  useEffect(() => {
    queryClient.setQueryData(queryKey, {
      data: initialData,
      count: initialCount,
    });
  }, [queryClient, queryKey, initialData, initialCount]);

  // Set up the query for client-side refetching
  const { data: queryData, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const { q, page = '1', pageSize = '10' } = searchParams;
      
      // Get workspace settings to check threshold
      const { data: settings } = await supabase
        .from('workspace_settings')
        .select('guest_user_checkup_threshold')
        .eq('ws_id', wsId)
        .maybeSingle();

      const threshold = settings?.guest_user_checkup_threshold;

      if (!threshold) {
        return { data: [] as GuestUserLead[], count: 0 };
      }

      // First, get all workspace users
      let userQueryBuilder = supabase
        .from('workspace_users')
        .select(`
          id,
          full_name,
          email,
          phone,
          gender,
          created_at,
          workspace_user_groups_users!inner(
            workspace_user_groups!inner(id, name, is_guest)
          )
        `)
        .eq('ws_id', wsId)
        .eq('workspace_user_groups_users.workspace_user_groups.is_guest', true);

      // Add search functionality
      if (q) {
        userQueryBuilder = userQueryBuilder.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
      }

      const { data: workspaceUsers, error: usersError } = await userQueryBuilder;

      if (usersError) throw usersError;

      if (!workspaceUsers || workspaceUsers.length === 0) {
        return { data: [] as GuestUserLead[], count: 0 };
      }

      // Filter users who are actually guests using the is_user_guest function
      const guestUsers = [];
      for (const user of workspaceUsers) {
        const { data: isGuest, error: guestError } = await supabase.rpc('is_user_guest', {
          user_uuid: user.id,
        });
        
        if (guestError) continue; // Skip users with errors
        if (!isGuest) continue; // Skip non-guest users

        // Calculate attendance count for this user
        const { count: attendanceCount, error: attendanceError } = await supabase
          .from('user_group_attendance')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('status', ['PRESENT', 'LATE']);

        if (attendanceError) continue; // Skip users with attendance errors
        
        // Only include users who meet the attendance threshold
        if ((attendanceCount || 0) >= threshold) {
          guestUsers.push({
            ...user,
            attendance_count: attendanceCount || 0,
          });
        }
      }

      // Check which users already have lead generation records
      const userIds = guestUsers.map(user => user.id);
      const { data: leadGenData, error: leadGenError } = await supabase
        .from('guest_users_lead_generation')
        .select('user_id')
        .eq('ws_id', wsId)
        .in('user_id', userIds);

      if (leadGenError) throw leadGenError;

      const usersWithLeads = new Set(leadGenData?.map((lead: any) => lead.user_id) || []);

      // Filter out users who already have lead generation records
      const eligibleUsers = guestUsers.filter(user => !usersWithLeads.has(user.id));

      // Apply pagination to the filtered results
      const totalCount = eligibleUsers.length;
      const parsedPage = parseInt(page, 10);
      const parsedSize = parseInt(pageSize, 10);
      const start = (parsedPage - 1) * parsedSize;
      const end = start + parsedSize;
      const paginatedUsers = eligibleUsers.slice(start, end);

      // Transform the data to match our GuestUserLead interface
      const transformedData: GuestUserLead[] = paginatedUsers.map((user: any) => {
        const userGroup = user.workspace_user_groups_users?.[0]?.workspace_user_groups;
        return {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          gender: user.gender,
          attendance_count: user.attendance_count,
          group_id: userGroup?.id || null,
          group_name: userGroup?.name || null,
          has_lead_generation: false, // These are all users without lead generation records
          created_at: user.created_at,
        };
      });

      return { data: transformedData, count: totalCount };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });

  // This component doesn't render anything, it just manages the query state
  return null;
}
