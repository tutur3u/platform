import { SHOW_VERSION_BADGE_CONFIG_ID } from '@tuturuuu/internal-api/users';
import { MAX_MEDIUM_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const TASKS_USER_CONFIG_APP_SESSION_AUTH = {
  targetApp: 'tasks',
} as const;

const userConfigBodySchema = z.object({
  value: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable(),
});

async function parseUserConfigBody(req: Request) {
  try {
    const body = await req.json();
    const parsedBody = userConfigBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    return parsedBody.data;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
}

export const GET = withSessionAuth<{ configId: string }>(
  async (_req, { user, supabase }, { configId }) => {
    if (
      configId === SHOW_VERSION_BADGE_CONFIG_ID &&
      !isExactTuturuuuDotComEmail(user.email)
    ) {
      return NextResponse.json({ value: null });
    }

    const { data, error } = await supabase
      .from('user_configs')
      .select('value')
      .eq('user_id', user.id)
      .eq('id', configId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching tasks user config:', error);
      return NextResponse.json(
        { message: 'Error fetching user config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ value: data?.value ?? null });
  },
  {
    allowAppSessionAuth: TASKS_USER_CONFIG_APP_SESSION_AUTH,
    cache: { maxAge: 60, swr: 30 },
  }
);

export const PUT = withSessionAuth<{ configId: string }>(
  async (req, { user, supabase }, { configId }) => {
    const parsedBody = await parseUserConfigBody(req);

    if (parsedBody instanceof NextResponse) {
      return parsedBody;
    }

    const { value } = parsedBody;
    const isVersionBadgeConfig = configId === SHOW_VERSION_BADGE_CONFIG_ID;

    if (
      isVersionBadgeConfig &&
      value !== null &&
      value !== '' &&
      value !== 'true' &&
      value !== 'false'
    ) {
      return NextResponse.json(
        { message: 'Invalid version badge config value' },
        { status: 400 }
      );
    }

    if (
      isVersionBadgeConfig &&
      value === 'true' &&
      !isExactTuturuuuDotComEmail(user.email)
    ) {
      return NextResponse.json(
        { message: 'Version badge is limited to @tuturuuu.com accounts' },
        { status: 403 }
      );
    }

    if (value === null || value === '') {
      const { error } = await supabase
        .from('user_configs')
        .delete()
        .eq('user_id', user.id)
        .eq('id', configId);

      if (error) {
        console.error('Error deleting tasks user config:', error);
        return NextResponse.json(
          { message: 'Error deleting user config' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'success' });
    }

    const { error } = await supabase.from('user_configs').upsert(
      [
        {
          id: configId,
          user_id: user.id,
          value,
          updated_at: new Date().toISOString(),
        },
      ],
      {
        onConflict: 'user_id,id',
      }
    );

    if (error) {
      console.error('Error upserting tasks user config:', error);
      return NextResponse.json(
        { message: 'Error upserting user config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { allowAppSessionAuth: TASKS_USER_CONFIG_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<{ configId: string }>(
  async (_req, { user, supabase }, { configId }) => {
    const { error } = await supabase
      .from('user_configs')
      .delete()
      .eq('user_id', user.id)
      .eq('id', configId);

    if (error) {
      console.error('Error deleting tasks user config:', error);
      return NextResponse.json(
        { message: 'Error deleting user config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { allowAppSessionAuth: TASKS_USER_CONFIG_APP_SESSION_AUTH }
);
