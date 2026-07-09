import { checkEducationWorkspaceAccess } from '@tuturuuu/education-core/education/access';
import { type NextRequest, NextResponse } from 'next/server';
import { type AuthorizedRequest, withSessionAuth } from '@/lib/api-auth';

type Params = {
  wsId: string;
};

const VALSEA_BASE_URL = 'https://api.valsea.ai/v1';

async function verifyValseaWorkspaceAccess(
  context: AuthorizedRequest,
  wsId: string
) {
  const access = await checkEducationWorkspaceAccess({ context, wsId });
  return access.ok ? null : access.response;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, context, { wsId }) => {
    const accessError = await verifyValseaWorkspaceAccess(context, wsId);
    if (accessError) return accessError;

    const apiKey = request.headers.get('x-valsea-api-key')?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { message: 'Provide a Valsea API key to validate' },
        { status: 400 }
      );
    }

    const response = await fetch(`${VALSEA_BASE_URL}/clarifications`, {
      body: JSON.stringify({
        language: 'english',
        model: 'valsea-clarify',
        response_format: 'verbose_json',
        text: 'Validate this classroom API key.',
      }),
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            getString(data, 'message') ||
            getString(data, 'error') ||
            `Valsea key validation failed with ${response.status}`,
        },
        { status: response.status }
      );
    }

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  },
  {
    maxPayloadSize: 1024,
    rateLimit: { maxRequests: 12, windowMs: 60_000 },
  }
);
