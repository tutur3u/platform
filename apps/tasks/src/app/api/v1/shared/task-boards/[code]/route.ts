import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { loadPublicTaskBoard } from '@/lib/tasks/public-task-board';

const paramsSchema = z.object({
  code: z.string().min(1),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = paramsSchema.parse(await params);
    const result = await loadPublicTaskBoard(code);

    if (result.status === 404) {
      return NextResponse.json(
        { error: 'Public board not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.data, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid public board code' },
        { status: 400 }
      );
    }

    serverLogger.error('Error loading public task board:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
