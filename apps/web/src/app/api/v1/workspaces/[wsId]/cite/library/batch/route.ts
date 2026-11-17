import { NextResponse } from 'next/server';
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

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, auth, params) => {
    try {
      const access = await authorizeCitationLibrary(request, auth, params.wsId);
      if (!access.ok) return access.response;
      const service = await createAuthorizedCitationLibraryService(
        access.scope
      );
      const result = await service.getMany(
        access.scope,
        await readLibraryBody(request, 4096)
      );
      return NextResponse.json(result, { headers: LIBRARY_RESPONSE_HEADERS });
    } catch (error) {
      return citationLibraryErrorResponse(error);
    }
  },
  { allowAppSessionAuth: true, maxPayloadSize: 4096 }
);
