import { MAX_MEDIUM_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { buildPostgrestRateLimitResponse } from '@/lib/postgrest-rate-limit';
import { safeParseBody } from '@/lib/safe-parse-body';

export const GET = withSessionAuth<{ configId: string }>(
  async (_req, { user, supabase }, { configId: id }) => {
    const { data, error } = await supabase
      .from('user_configs')
      .select('value')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      serverLogger.error('Error fetching user config:', error);
      return NextResponse.json(
        { message: 'Error fetching user config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ value: data?.value ?? null });
  },
  { allowAppSessionAuth: true, cache: { maxAge: 60, swr: 30 } }
);

export const PUT = withSessionAuth<{ configId: string }>(
  async (req, { user, supabase }, { configId: id }) => {
    const bodySchema = z.object({
      value: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable(),
    });
    const bodyResult = await safeParseBody<{ value: string | null }>(req);
    if (bodyResult instanceof NextResponse) {
      return bodyResult;
    }

    const parsedBody = bodySchema.safeParse(bodyResult.data);

    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const { value } = parsedBody.data;

    if (value === null || value === '') {
      const { error } = await supabase
        .from('user_configs')
        .delete()
        .eq('user_id', user.id)
        .eq('id', id);

      if (error) {
        serverLogger.error('Error deleting user config:', error);
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
          id,
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
      const rateLimitResponse = buildPostgrestRateLimitResponse(error);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      serverLogger.error('Error upserting user config:', error);
      return NextResponse.json(
        { message: 'Error upserting user config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { allowAppSessionAuth: true }
);

export const DELETE = withSessionAuth<{ configId: string }>(
  async (_req, { user, supabase }, { configId: id }) => {
    const { error } = await supabase
      .from('user_configs')
      .delete()
      .eq('user_id', user.id)
      .eq('id', id);

    if (error) {
      serverLogger.error('Error deleting user config:', error);
      return NextResponse.json(
        { message: 'Error deleting user config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { allowAppSessionAuth: true }
);
