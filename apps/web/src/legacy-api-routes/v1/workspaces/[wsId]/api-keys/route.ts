import { generateApiKey, hashApiKey } from '@tuturuuu/auth/api-keys';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

import { assertWorkspaceApiKeysAccess } from './shared';

const ApiKeyCreateSchema = z.object({
  name: z.string().max(MAX_NAME_LENGTH).min(1),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  role_id: z.string().max(MAX_LONG_TEXT_LENGTH).nullable(),
  expires_at: z
    .string()
    .refine(
      (val) => {
        if (!val) return true;
        try {
          const date = new Date(val);
          return date.toISOString() === val;
        } catch {
          return false;
        }
      },
      { message: 'expires_at must be a valid ISO 8601 datetime' }
    )
    .nullable(),
});

const SAFE_COLUMNS =
  'id, ws_id, name, description, key_prefix, role_id, last_used_at, expires_at, created_at, updated_at, created_by';

const ApiKeyListQuerySchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('10'),
  q: z.string().optional(),
});

interface RouteParams {
  wsId: string;
}

export const GET = withSessionAuth<RouteParams>(
  async (req: NextRequest, { user, supabase }, rawParams) => {
    try {
      const wsId = await normalizeWorkspaceId(rawParams.wsId, supabase);
      const url = new URL(req.url);
      const wantsPaginatedResponse =
        url.searchParams.has('page') ||
        url.searchParams.has('pageSize') ||
        url.searchParams.has('q');
      const queryParams = Object.fromEntries(url.searchParams);
      const validation = ApiKeyListQuerySchema.safeParse(queryParams);

      if (!validation.success) {
        return NextResponse.json(
          {
            message: 'Invalid query parameters',
            errors: validation.error.issues,
          },
          { status: 400 }
        );
      }

      const denied = await assertWorkspaceApiKeysAccess(
        supabase,
        user.id,
        wsId
      );
      if (denied) return denied;

      const sbAdmin = await createAdminClient();
      const { page, pageSize, q } = validation.data;

      let queryBuilder = sbAdmin
        .from('workspace_api_keys')
        .select(SAFE_COLUMNS, { count: 'exact' })
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });

      if (q) {
        queryBuilder = queryBuilder.ilike('name', `%${q}%`);
      }

      if (wantsPaginatedResponse) {
        const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
        const parsedSize = Math.max(1, Number.parseInt(pageSize, 10) || 10);
        const start = (parsedPage - 1) * parsedSize;
        const end = start + parsedSize - 1;

        queryBuilder = queryBuilder.range(start, end);
      }

      const { data, error, count } = await queryBuilder;

      if (error) {
        console.error(error);
        return NextResponse.json(
          { message: 'Error fetching workspace API configs' },
          { status: 500 }
        );
      }

      if (data && data.length > 0) {
        const keyIds = data.map((key) => key.id);
        const { data: lastUsedData } = await sbAdmin
          .from('workspace_api_key_usage_logs')
          .select('api_key_id, created_at')
          .in('api_key_id', keyIds)
          .order('created_at', { ascending: false });

        const lastUsedMap = new Map<string, string>();
        for (const log of lastUsedData ?? []) {
          if (!lastUsedMap.has(log.api_key_id)) {
            lastUsedMap.set(log.api_key_id, log.created_at);
          }
        }

        for (const key of data) {
          key.last_used_at = lastUsedMap.get(key.id) ?? null;
        }
      }

      if (wantsPaginatedResponse) {
        return NextResponse.json({ data: data ?? [], count: count ?? 0 });
      }

      return NextResponse.json(data ?? []);
    } catch (error) {
      console.error('Error in GET workspace API keys:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

export const POST = withSessionAuth<RouteParams>(
  async (req: NextRequest, { user, supabase }, rawParams) => {
    try {
      const wsId = await normalizeWorkspaceId(rawParams.wsId, supabase);

      const denied = await assertWorkspaceApiKeysAccess(
        supabase,
        user.id,
        wsId
      );
      if (denied) return denied;

      const body = await req.json();
      const validation = ApiKeyCreateSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { message: 'Invalid request', errors: validation.error.issues },
          { status: 400 }
        );
      }

      const data = validation.data;

      const { key, prefix } = generateApiKey();
      const keyHash = await hashApiKey(key);

      const sbAdmin = await createAdminClient();

      const { error } = await sbAdmin.from('workspace_api_keys').insert({
        ws_id: wsId,
        name: data.name,
        description: data.description,
        role_id: data.role_id,
        expires_at: data.expires_at,
        key_hash: keyHash,
        key_prefix: prefix,
        created_by: user.id,
      });

      if (error) {
        console.error('Error creating API key:', error);
        return NextResponse.json(
          { message: 'Error creating workspace API key' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        message: 'API key created successfully',
        key,
        prefix,
      });
    } catch (error) {
      console.error('Error in POST workspace API keys:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
