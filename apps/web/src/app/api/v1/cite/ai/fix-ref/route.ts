import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { createCitationAiGrounding } from '@/lib/cite/ai/grounding';
import {
  CITE_AI_HEADERS,
  citationAiErrorResponse,
  readCitationFixBody,
} from '@/lib/cite/ai/http';
import { createSessionCitationAiService } from '@/lib/cite/ai/runtime';

export const POST = withSessionAuth(
  async (request, auth) => {
    try {
      const input = await readCitationFixBody(request);
      const service = createSessionCitationAiService(
        auth.supabase,
        createCitationAiGrounding(request.headers)
      );
      const result = await service.fix(auth.user.id, input, request.signal);
      return NextResponse.json(result, { headers: CITE_AI_HEADERS });
    } catch (error) {
      return citationAiErrorResponse(error);
    }
  },
  { allowAppSessionAuth: true, maxPayloadSize: 96000 }
);
