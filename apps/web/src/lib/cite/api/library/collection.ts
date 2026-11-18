import { connection, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  authorizeCitationLibrary,
  createAuthorizedCitationLibraryService,
} from '@/lib/cite/library/authorization';
import {
  citationLibraryErrorResponse,
  LIBRARY_RESPONSE_HEADERS,
  readLibraryBody,
} from '@/lib/cite/library/http';

type Params = { wsId: string };
const options = { allowAppSessionAuth: true, maxPayloadSize: 65536 };

export const GET = withSessionAuth<Params>(async (request, auth, params) => {
  try {
    await connection();
    const access = await authorizeCitationLibrary(request, auth, params.wsId);
    if (!access.ok) return access.response;
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const service = await createAuthorizedCitationLibraryService(access.scope);
    const result = await service.list(access.scope, query);
    return NextResponse.json(result, { headers: LIBRARY_RESPONSE_HEADERS });
  } catch (error) {
    return citationLibraryErrorResponse(error);
  }
}, options);

export const POST = withSessionAuth<Params>(async (request, auth, params) => {
  try {
    const access = await authorizeCitationLibrary(request, auth, params.wsId);
    if (!access.ok) return access.response;
    const service = await createAuthorizedCitationLibraryService(access.scope);
    const result = await service.create(
      access.scope,
      await readLibraryBody(request)
    );
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
      headers: LIBRARY_RESPONSE_HEADERS,
    });
  } catch (error) {
    return citationLibraryErrorResponse(error);
  }
}, options);
