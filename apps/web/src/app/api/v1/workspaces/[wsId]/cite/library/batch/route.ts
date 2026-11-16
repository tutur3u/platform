import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { authorizeCitationLibrary } from '@/lib/cite/library/authorization';
import {
  citationLibraryErrorResponse,
  LIBRARY_RESPONSE_HEADERS,
  readLibraryBody,
} from '@/lib/cite/library/http';
import { createCitationLibraryService } from '@/lib/cite/library/service';
import { getCitationLibraryStore } from '@/lib/cite/library/store';

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, auth, params) => {
    try {
      const access = await authorizeCitationLibrary(request, auth, params.wsId);
      if (!access.ok) return access.response;
      const result = await createCitationLibraryService(
        getCitationLibraryStore(auth.supabase)
      ).getMany(access.scope, await readLibraryBody(request, 4096));
      return NextResponse.json(result, { headers: LIBRARY_RESPONSE_HEADERS });
    } catch (error) {
      return citationLibraryErrorResponse(error);
    }
  },
  { allowAppSessionAuth: true, maxPayloadSize: 4096 }
);
