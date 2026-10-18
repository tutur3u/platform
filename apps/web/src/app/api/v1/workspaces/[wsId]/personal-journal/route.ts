import { journalCreateSchema } from '@tuturuuu/internal-api/personal-journal';
import { connection, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authorizeJournal, journalResponse } from '@/lib/personal-journal/auth';
import { getJournalStore } from '@/lib/personal-journal/provider';
import {
  JournalConflict,
  JournalForbidden,
  JournalUnavailable,
  journalService,
} from '@/lib/personal-journal/service';

type Context = { params: Promise<{ wsId: string }> };
function failure(error: unknown) {
  if (error instanceof JournalUnavailable)
    return journalResponse({ error: 'Journal unavailable' }, 503);
  if (error instanceof JournalConflict)
    return journalResponse({ error: 'Journal revision conflict' }, 409);
  if (error instanceof JournalForbidden)
    return journalResponse({ error: 'Forbidden' }, 403);
  console.error('Personal journal request failed');
  return journalResponse({ error: 'Journal request failed' }, 500);
}
export async function GET(request: NextRequest, { params }: Context) {
  await connection();
  try {
    const auth = await authorizeJournal(request, (await params).wsId);
    if (!auth.ok) return auth.response;
    const query = z
      .object({ before: z.guid().optional() })
      .strict()
      .safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success)
      return journalResponse({ error: 'Invalid journal query' }, 400);
    return journalResponse(
      await journalService(getJournalStore(), auth.scope).list(
        query.data.before
      )
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const auth = await authorizeJournal(request, (await params).wsId);
    if (!auth.ok) return auth.response;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return journalResponse({ error: 'Invalid JSON' }, 400);
    }
    const parsed = journalCreateSchema.safeParse(body);
    if (!parsed.success)
      return journalResponse({ error: 'Invalid journal entry' }, 400);
    return journalResponse(
      await journalService(getJournalStore(), auth.scope).create(parsed.data),
      201
    );
  } catch (error) {
    return failure(error);
  }
}
