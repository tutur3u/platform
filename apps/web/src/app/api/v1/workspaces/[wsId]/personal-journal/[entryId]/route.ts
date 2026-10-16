import { journalUpdateSchema } from '@tuturuuu/internal-api/personal-journal';
import { connection, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authorizeJournal, journalResponse } from '@/lib/personal-journal/auth';
import { getJournalStore } from '@/lib/personal-journal/provider';
import {
  JournalConflict,
  JournalForbidden,
  JournalNotFound,
  JournalUnavailable,
  journalService,
} from '@/lib/personal-journal/service';

type Context = { params: Promise<{ wsId: string; entryId: string }> };
function failure(error: unknown) {
  if (error instanceof JournalUnavailable)
    return journalResponse({ error: 'Journal unavailable' }, 503);
  if (error instanceof JournalConflict)
    return journalResponse({ error: 'Journal revision conflict' }, 409);
  if (error instanceof JournalNotFound)
    return journalResponse({ error: 'Journal entry not found' }, 404);
  if (error instanceof JournalForbidden)
    return journalResponse({ error: 'Forbidden' }, 403);
  console.error('Personal journal entry request failed');
  return journalResponse({ error: 'Journal request failed' }, 500);
}
export async function GET(request: NextRequest, { params }: Context) {
  await connection();
  try {
    const { wsId, entryId } = await params;
    const auth = await authorizeJournal(request, wsId);
    if (!auth.ok) return auth.response;
    const id = z.guid().safeParse(entryId);
    if (!id.success)
      return journalResponse({ error: 'Invalid journal ID' }, 400);
    return journalResponse(
      await journalService(getJournalStore(), auth.scope).read(id.data)
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: NextRequest, { params }: Context) {
  try {
    const { wsId, entryId } = await params;
    const auth = await authorizeJournal(request, wsId);
    if (!auth.ok) return auth.response;
    const id = z.guid().safeParse(entryId);
    if (!id.success)
      return journalResponse({ error: 'Invalid journal ID' }, 400);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return journalResponse({ error: 'Invalid JSON' }, 400);
    }
    const parsed = journalUpdateSchema.safeParse(body);
    if (!parsed.success)
      return journalResponse({ error: 'Invalid journal update' }, 400);
    return journalResponse(
      await journalService(getJournalStore(), auth.scope).update(
        id.data,
        parsed.data
      )
    );
  } catch (error) {
    return failure(error);
  }
}
