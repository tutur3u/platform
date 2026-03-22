import { DeepgramClient, DeepgramError } from '@deepgram/sdk';
import { type NextRequest, NextResponse } from 'next/server';

export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (process.env.DEEPGRAM_ENV === 'development') {
    return NextResponse.json({
      key: process.env.DEEPGRAM_API_KEY ?? '',
    });
  }

  const url = request.url;
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

  if (!deepgramApiKey) {
    return NextResponse.json(
      { message: 'Missing Deepgram API key.' },
      { status: 500 }
    );
  }

  const deepgram = new DeepgramClient({ apiKey: deepgramApiKey });

  try {
    const projectsResponse = await deepgram.manage.v1.projects.list();
    const project = projectsResponse.projects?.[0];

    if (!project?.project_id) {
      return NextResponse.json(
        {
          message:
            'Cannot find a Deepgram project. Please create a project first.',
        },
        { status: 404 }
      );
    }

    const keyResponse = await deepgram.manage.v1.projects.keys.create(
      project.project_id,
      {
        comment: 'Temporary API key',
        scopes: ['usage:write'],
        tags: ['next.js'],
        time_to_live_in_seconds: 60,
      }
    );

    const response = NextResponse.json({ ...keyResponse, url });
    response.headers.set('Surrogate-Control', 'no-store');
    response.headers.set(
      'Cache-Control',
      's-maxage=0, no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    response.headers.set('Expires', '0');

    return response;
  } catch (error) {
    if (error instanceof DeepgramError) {
      return NextResponse.json(
        {
          message: error.message,
          statusCode: error.statusCode,
          body: error.body,
        },
        { status: error.statusCode ?? 500 }
      );
    }

    return NextResponse.json(
      { message: 'Unable to create a Deepgram key.' },
      { status: 500 }
    );
  }
}
