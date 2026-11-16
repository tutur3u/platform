import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { authorizeCitationLibrary } from '@/lib/cite/library/authorization';
import {
  CitationLibraryError,
  deleteLibraryItemSchema,
} from '@/lib/cite/library/contracts';
import {
  citationLibraryErrorResponse,
  LIBRARY_RESPONSE_HEADERS,
  readLibraryBody,
} from '@/lib/cite/library/http';
import { createCitationLibraryService } from '@/lib/cite/library/service';
import { getCitationLibraryStore } from '@/lib/cite/library/store';

type Params = { wsId: string; itemId: string };
const options = { allowAppSessionAuth: true, maxPayloadSize: 65536 };
function itemId(value: string) {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw new CitationLibraryError('INVALID_INPUT', 400);
  return result.data;
}

export const GET = withSessionAuth<Params>(async (request, auth, params) => {
  try {
    await connection();
    const access = await authorizeCitationLibrary(request, auth, params.wsId);
    if (!access.ok) return access.response;
    const item = await createCitationLibraryService(
      getCitationLibraryStore(auth.supabase)
    ).get(access.scope, itemId(params.itemId));
    return NextResponse.json({ item }, { headers: LIBRARY_RESPONSE_HEADERS });
  } catch (error) {
    return citationLibraryErrorResponse(error);
  }
}, options);

export const PATCH = withSessionAuth<Params>(async (request, auth, params) => {
  try {
    const access = await authorizeCitationLibrary(request, auth, params.wsId);
    if (!access.ok) return access.response;
    const item = await createCitationLibraryService(
      getCitationLibraryStore(auth.supabase)
    ).update(
      access.scope,
      itemId(params.itemId),
      await readLibraryBody(request)
    );
    return NextResponse.json({ item }, { headers: LIBRARY_RESPONSE_HEADERS });
  } catch (error) {
    return citationLibraryErrorResponse(error);
  }
}, options);

export const DELETE = withSessionAuth<Params>(async (request, auth, params) => {
  try {
    const access = await authorizeCitationLibrary(request, auth, params.wsId);
    if (!access.ok) return access.response;
    const body = deleteLibraryItemSchema.safeParse(
      await readLibraryBody(request)
    );
    if (!body.success) throw new CitationLibraryError('INVALID_INPUT', 400);
    await createCitationLibraryService(
      getCitationLibraryStore(auth.supabase)
    ).remove(access.scope, itemId(params.itemId), body.data.expectedVersion);
    return new NextResponse(null, {
      status: 204,
      headers: LIBRARY_RESPONSE_HEADERS,
    });
  } catch (error) {
    return citationLibraryErrorResponse(error);
  }
}, options);
