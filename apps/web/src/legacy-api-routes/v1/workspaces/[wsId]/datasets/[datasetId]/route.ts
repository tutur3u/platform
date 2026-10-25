import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_URL_LENGTH,
} from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDatasetAccess } from './dataset-access';

interface Params {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

// Strict allowlist: unknown fields (including `ws_id`) are rejected so a
// caller can never reparent a dataset or write server-owned columns.
const datasetUpdateSchema = z
  .object({
    id: z.string().max(MAX_NAME_LENGTH).optional(),
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
    description: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
    url: z.string().max(MAX_URL_LENGTH).nullable().optional(),
  })
  .strict();

export async function PUT(req: NextRequest, { params }: Params) {
  const { wsId, datasetId } = await params;

  return withDatasetAccess(req, { wsId, datasetId }, async (supabase) => {
    const body = await req.json().catch(() => null);
    const parsed = datasetUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { id, ...data } = parsed.data;

    if (id !== undefined && id !== datasetId) {
      return NextResponse.json(
        { message: 'Dataset id does not match the URL' },
        { status: 400 }
      );
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { message: 'No updatable fields provided' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('workspace_datasets')
      .update(data)
      .eq('id', datasetId)
      .eq('ws_id', wsId);

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error updating workspace dataset' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { wsId, datasetId } = await params;

  return withDatasetAccess(req, { wsId, datasetId }, async (supabase) => {
    const { error } = await supabase
      .from('workspace_datasets')
      .delete()
      .eq('id', datasetId)
      .eq('ws_id', wsId);

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error deleting workspace dataset' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  });
}
