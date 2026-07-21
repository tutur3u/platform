import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAiCreditsAdminRequest } from '../access';
import {
  applyAdminAiCreditsModelFilters,
  parseAdminAiCreditsModelFilters,
  parsePositiveInt,
} from './route-filters';

export async function GET(req: NextRequest) {
  await connection();

  try {
    const auth = await authorizeAiCreditsAdminRequest();
    if (!auth.ok) return auth.response;

    const searchParams = req.nextUrl.searchParams;
    const page = parsePositiveInt(searchParams.get('page'), 1);
    const limit = Math.min(
      100,
      parsePositiveInt(searchParams.get('limit'), 50)
    );
    const filters = parseAdminAiCreditsModelFilters(searchParams);

    const { sbAdmin } = auth;
    const privateDb = sbAdmin.schema('private');
    let query = privateDb
      .from('ai_gateway_models')
      .select('*', { count: 'exact' });

    query = applyAdminAiCreditsModelFilters(query, filters);

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order('provider')
      .order('name')
      .range(from, to);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch models' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data,
      pagination: { page, limit, total: count ?? 0 },
    });
  } catch (error) {
    console.error('Error in AI credits models GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const patchSchema = z.object({
  id: z.string().max(MAX_NAME_LENGTH),
  is_enabled: z.boolean(),
});

export async function PATCH(req: Request) {
  try {
    const auth = await authorizeAiCreditsAdminRequest();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sbAdmin } = auth;

    if (!parsed.data.is_enabled) {
      const { data: allocationReference, error: allocationReferenceError } =
        await sbAdmin
          .from('ai_credit_plan_allocations')
          .select('tier')
          .or(
            `default_language_model.eq.${parsed.data.id},default_image_model.eq.${parsed.data.id}`
          )
          .limit(1)
          .maybeSingle();

      if (allocationReferenceError) {
        return NextResponse.json(
          { error: 'Failed to validate model usage' },
          { status: 500 }
        );
      }

      if (allocationReference?.tier) {
        return NextResponse.json(
          {
            error: `Cannot disable ${parsed.data.id} because it is configured as a default model for the ${allocationReference.tier} plan.`,
          },
          { status: 409 }
        );
      }
    }

    const { data, error } = await sbAdmin
      .schema('private')
      .from('ai_gateway_models')
      .update({ is_enabled: parsed.data.is_enabled })
      .eq('id', parsed.data.id)
      .select()
      .single();

    if (error) {
      if (error.message.includes('default model')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json(
        { error: 'Failed to update model' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in AI credits models PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
