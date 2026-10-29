import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const settingsUpdateSchema = z
  .object({
    break_duration_minutes: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional(),
    break_enabled: z.boolean().nullable().optional(),
    break_interval_minutes: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional(),
    guest_user_checkup_threshold: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional(),
    missed_entry_date_threshold: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional(),
    referral_count_cap: z.number().int().nonnegative().optional(),
    referral_increment_percent: z.number().nonnegative().optional(),
    referral_promotion_id: z.uuid().nullable().optional(),
    referral_reward_type: z.enum(['REFERRER', 'RECEIVER', 'BOTH']).optional(),
  })
  .strict();

export const GET = withSessionAuth<{ wsId: string }>(
  async (_request, { user, supabase }, { wsId }) => {
    try {
      const sbAdmin = await createAdminClient();

      // Verify workspace access
      const memberCheck = await verifyWorkspaceMembershipType({
        wsId: wsId,
        userId: user.id,
        supabase: supabase,
      });

      if (memberCheck.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      if (!memberCheck.ok) {
        return NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        );
      }

      // Fetch workspace info to check if it's personal
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('personal')
        .eq('id', wsId)
        .maybeSingle();

      // Fetch workspace settings
      const { data: settings, error } = await sbAdmin
        .from('workspace_settings')
        .select('*')
        .eq('ws_id', wsId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching workspace settings:', error);
        return NextResponse.json(
          { error: 'Failed to fetch workspace settings' },
          { status: 500 }
        );
      }

      // For personal workspaces, always return null for missed_entry_date_threshold
      // This disables all time tracking request/threshold flows for personal workspaces
      if (workspace?.personal) {
        return NextResponse.json({
          ...settings,
          missed_entry_date_threshold: null,
        });
      }

      return NextResponse.json(settings);
    } catch (error) {
      console.error('Error in workspace settings API:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 60, swr: 30 } }
);

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    try {
      // Verify workspace access
      const memberCheck = await verifyWorkspaceMembershipType({
        wsId,
        userId: user.id,
        supabase,
      });

      if (memberCheck.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      if (!memberCheck.ok) {
        return NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        );
      }

      const permissions = await getPermissions({ user, wsId });
      if (!permissions?.containsPermission('manage_workspace_settings'))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const parsed = settingsUpdateSchema.safeParse(await request.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: 'Invalid settings' },
          { status: 400 }
        );
      const body = parsed.data;
      const sbAdmin = await createAdminClient();
      if (body.referral_promotion_id) {
        const { data: promotion, error: promotionError } = await sbAdmin
          .schema('private')
          .from('workspace_promotions')
          .select('id')
          .eq('ws_id', permissions.wsId)
          .eq('id', body.referral_promotion_id)
          .maybeSingle();
        if (promotionError)
          return NextResponse.json(
            { error: 'Failed to verify promotion' },
            { status: 500 }
          );
        if (!promotion)
          return NextResponse.json(
            { error: 'Promotion not found' },
            { status: 404 }
          );
      }

      // Update workspace settings
      const { data: settings, error } = await sbAdmin
        .from('workspace_settings')
        .upsert({
          ...body,
          ws_id: permissions.wsId,
        })
        .select()
        .single();

      if (error) {
        console.error('Error updating workspace settings:', error);
        return NextResponse.json(
          { error: 'Failed to update workspace settings' },
          { status: 500 }
        );
      }

      return NextResponse.json(settings);
    } catch (error) {
      console.error('Error in workspace settings API:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
