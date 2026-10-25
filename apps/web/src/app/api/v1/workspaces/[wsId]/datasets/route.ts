import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_URL_LENGTH,
} from '@tuturuuu/utils/constants';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLegacyHeadHandler } from '@/legacy-api-routes/head';
import { withWorkspaceDatasetsAccess } from './dataset-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  await connection();
  const { wsId } = await params;

  return withWorkspaceDatasetsAccess(
    req,
    wsId,
    async (supabase, apiKeyContext, scope) => {
      const { data, count, error } = await supabase
        .from('workspace_datasets')
        .select('*', { count: 'exact' })
        .eq('ws_id', scope.wsId);

      if (error) {
        console.log(error);
        return NextResponse.json(
          { message: 'Error fetching workspace datasets' },
          { status: 500 }
        );
      }

      return apiKeyContext
        ? NextResponse.json({ data, count })
        : NextResponse.json(data || []);
    }
  );
}

export async function POST(req: Request, { params }: Params) {
  return withWorkspaceDatasetsAccess(
    req,
    (await params).wsId,
    async (supabase, _key, scope) => {
      const { wsId: id } = scope;

      const parsed = z
        .object({
          name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
          description: z
            .string()
            .max(MAX_LONG_TEXT_LENGTH)
            .nullable()
            .optional(),
          url: z.string().max(MAX_URL_LENGTH).nullable().optional(),
          type: z.enum(['excel', 'csv', 'html']).optional(),
          html_ids: z.array(z.string()).nullable().optional(),
        })
        .strict()
        .safeParse(await req.json().catch(() => null));
      if (!parsed.success)
        return NextResponse.json(
          { message: 'Invalid request body' },
          { status: 400 }
        );
      const data = parsed.data;

      const { error } = await supabase.from('workspace_datasets').insert({
        ...data,
        ws_id: id,
      });

      if (error) {
        console.log(error);
        return NextResponse.json(
          { message: 'Error creating workspace dataset' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'success' });
    }
  );
}

export const HEAD = createLegacyHeadHandler(GET);
