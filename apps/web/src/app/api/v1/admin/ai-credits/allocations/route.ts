import { matchesAllowedModel } from '@tuturuuu/ai/credits/model-mapping';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PLAN_DEFAULT_MODELS = {
  ENTERPRISE: {
    default_image_model: 'google/imagen-4.0-generate-001',
    default_language_model: 'google/gemini-2.5-flash-lite',
  },
  FREE: {
    default_image_model: 'google/imagen-4.0-fast-generate-001',
    default_language_model: 'google/gemini-2.5-flash-lite',
  },
  PLUS: {
    default_image_model: 'google/imagen-4.0-generate-001',
    default_language_model: 'google/gemini-2.5-flash-lite',
  },
  PRO: {
    default_image_model: 'google/imagen-4.0-generate-001',
    default_language_model: 'google/gemini-2.5-flash-lite',
  },
} as const;

type PlanTier = keyof typeof PLAN_DEFAULT_MODELS;
type AllocationWithOptionalDefaults = {
  default_image_model?: string | null;
  default_language_model?: string | null;
  tier: string;
} & Record<string, unknown>;

function getPlanDefaults(tier: string) {
  return PLAN_DEFAULT_MODELS[
    (tier in PLAN_DEFAULT_MODELS ? tier : 'FREE') as PlanTier
  ];
}

async function requireRootAdmin() {
  const supabase = await createClient();
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const member = await verifyWorkspaceMembershipType({
    wsId: ROOT_WORKSPACE_ID,
    userId: user.id,
    supabase,
  });

  if (member.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!member.ok) {
    return {
      error: NextResponse.json(
        { error: 'Root workspace admin required' },
        { status: 403 }
      ),
    };
  }

  return { user };
}

export async function GET() {
  try {
    const auth = await requireRootAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const sbAdmin = await createAdminClient();
    const { data, error } = await sbAdmin
      .from('ai_credit_plan_allocations')
      .select('*')
      .order('tier');

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch allocations' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      (data ?? []).map((row) => {
        const allocation = row as AllocationWithOptionalDefaults;
        const defaults = getPlanDefaults(allocation.tier);

        return {
          ...allocation,
          default_image_model:
            allocation.default_image_model ?? defaults.default_image_model,
          default_language_model:
            allocation.default_language_model ??
            defaults.default_language_model,
        };
      })
    );
  } catch (error) {
    console.error('Error in allocations GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const updateSchema = z.object({
  id: z.guid(),
  monthly_credits: z.number().optional(),
  credits_per_seat: z.number().nullable().optional(),
  default_image_model: z.string().min(1).optional(),
  default_language_model: z.string().min(1).optional(),
  daily_limit: z.number().nullable().optional(),
  max_output_tokens_per_request: z.number().nullable().optional(),
  markup_multiplier: z.number().optional(),
  allowed_models: z.array(z.string()).optional(),
  allowed_features: z.array(z.string()).optional(),
  max_requests_per_day: z.number().nullable().optional(),
  is_active: z.boolean().optional(),
});

async function validateDefaultModels(args: {
  allowedModels: string[];
  defaultImageModel: string;
  defaultLanguageModel: string;
  sbAdmin: any;
}) {
  const { allowedModels, defaultImageModel, defaultLanguageModel, sbAdmin } =
    args;

  const { data: models, error } = await sbAdmin
    .from('ai_gateway_models')
    .select('id, type, is_enabled')
    .in('id', [defaultLanguageModel, defaultImageModel]);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to validate default models' },
      { status: 500 }
    );
  }

  const byId = new Map(
    (
      (models ?? []) as Array<{
        id: string;
        is_enabled: boolean;
        type: string;
      }>
    ).map((model) => [model.id, model])
  );
  const languageModel = byId.get(defaultLanguageModel);
  const imageModel = byId.get(defaultImageModel);

  if (
    !languageModel ||
    languageModel.type !== 'language' ||
    !languageModel.is_enabled
  ) {
    return NextResponse.json(
      {
        error:
          'Default language model must reference an enabled language model.',
      },
      { status: 400 }
    );
  }

  if (!imageModel || imageModel.type !== 'image' || !imageModel.is_enabled) {
    return NextResponse.json(
      { error: 'Default image model must reference an enabled image model.' },
      { status: 400 }
    );
  }

  if (
    allowedModels.length > 0 &&
    (!matchesAllowedModel(defaultLanguageModel, allowedModels) ||
      !matchesAllowedModel(defaultImageModel, allowedModels))
  ) {
    return NextResponse.json(
      {
        error:
          'Default models must be included in the allowed models allowlist.',
      },
      { status: 400 }
    );
  }

  return null;
}

export async function PUT(req: Request) {
  try {
    const auth = await requireRootAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;
    const sbAdmin = await createAdminClient();

    // Fetch the allocation before update to know the tier
    const { data: existingData } = await sbAdmin
      .from('ai_credit_plan_allocations')
      .select('*')
      .eq('id', id)
      .single();

    const existing = existingData as {
      allowed_models: string[];
      default_image_model?: string | null;
      default_language_model?: string | null;
      monthly_credits: number;
      tier: string;
    } | null;

    if (!existing) {
      return NextResponse.json(
        { error: 'Allocation not found' },
        { status: 404 }
      );
    }

    const tierDefaults = getPlanDefaults(existing.tier);
    const defaultLanguageModel =
      updates.default_language_model ??
      existing.default_language_model ??
      tierDefaults.default_language_model;
    const defaultImageModel =
      updates.default_image_model ??
      existing.default_image_model ??
      tierDefaults.default_image_model;
    const allowedModels = updates.allowed_models ?? existing.allowed_models;

    const validationError = await validateDefaultModels({
      allowedModels,
      defaultImageModel,
      defaultLanguageModel,
      sbAdmin,
    });

    if (validationError) {
      return validationError;
    }

    const { data, error } = await sbAdmin
      .from('ai_credit_plan_allocations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update allocation' },
        { status: 500 }
      );
    }

    // If FREE tier monthly_credits changed, propagate to all current-period user balances
    if (
      existing?.tier === 'FREE' &&
      updates.monthly_credits != null &&
      updates.monthly_credits !== Number(existing.monthly_credits)
    ) {
      const periodStart = new Date();
      periodStart.setUTCDate(1);
      periodStart.setUTCHours(0, 0, 0, 0);

      // Update all FREE user-level balances (ws_id IS NULL) for the current period
      const { error: propagateError, count } = await sbAdmin
        .from('workspace_ai_credit_balances')
        .update({
          total_allocated: updates.monthly_credits,
          updated_at: new Date().toISOString(),
        })
        .is('ws_id', null)
        .not('user_id', 'is', null)
        .eq('period_start', periodStart.toISOString());

      if (propagateError) {
        console.error('Error propagating FREE tier credits:', propagateError);
      }

      return NextResponse.json({
        ...data,
        balances_updated: count ?? 0,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in allocations PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
