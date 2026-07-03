import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_LONG_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const upsertSchema = z.object({
  deviceId: z.string().trim().min(1).max(MAX_LONG_TEXT_LENGTH),
  token: z.string().trim().min(1).max(MAX_LONG_TEXT_LENGTH),
  platform: z.enum(['android', 'ios']),
  appFlavor: z.enum(['development', 'staging', 'production']),
});

const deleteSchema = z.object({
  deviceId: z.string().trim().min(1).max(MAX_LONG_TEXT_LENGTH),
  appFlavor: z.enum(['development', 'staging', 'production']),
  token: z.string().trim().min(1).max(MAX_LONG_TEXT_LENGTH).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { deviceId, token, platform, appFlavor } = parsed.data;
    const now = new Date().toISOString();

    // Keep the unique token constraint clean before upserting the owning device row.
    const { error: deleteTokenError } = await sbAdmin
      .from('notification_push_devices')
      .delete()
      .eq('token', token)
      .neq('user_id', user.id);

    if (deleteTokenError) {
      console.error(
        'Failed to clear conflicting push token rows:',
        deleteTokenError
      );
      return NextResponse.json(
        { error: 'Failed to register device' },
        { status: 500 }
      );
    }

    const { data, error } = await sbAdmin
      .from('notification_push_devices')
      .upsert(
        {
          user_id: user.id,
          device_id: deviceId,
          token,
          platform,
          app_flavor: appFlavor,
          last_seen_at: now,
          updated_at: now,
        },
        {
          onConflict: 'user_id,device_id,app_flavor',
        }
      )
      .select(
        'id, user_id, device_id, token, platform, app_flavor, last_seen_at'
      )
      .single();

    if (error) {
      console.error('Failed to upsert push device:', error);
      return NextResponse.json(
        { error: 'Failed to register device' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      device: data,
    });
  } catch (error) {
    console.error('Push device registration route failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { deviceId, appFlavor, token } = parsed.data;

    const baseDeleteQuery = sbAdmin
      .from('notification_push_devices')
      .delete()
      .eq('user_id', user.id)
      .eq('device_id', deviceId)
      .eq('app_flavor', appFlavor);

    const { error } = token
      ? await baseDeleteQuery.eq('token', token)
      : await baseDeleteQuery;

    if (error) {
      console.error('Failed to delete push device:', error);
      return NextResponse.json(
        { error: 'Failed to unregister device' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Push device delete route failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
