import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { wsId, location, buildingRequirements } = await req.json();

    console.log('Architecture API request received:', {
      wsId,
      location,
      buildingRequirements,
    });

    if (!wsId) {
      return NextResponse.json(
        { message: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    if (!location) {
      return NextResponse.json(
        { message: 'Location is required' },
        { status: 400 }
      );
    }

    if (!buildingRequirements) {
      return NextResponse.json(
        { message: 'Building requirements are required' },
        { status: 400 }
      );
    }

    // Call our object/architecture endpoint directly
    // This avoids potential circular references
    const url = new URL(req.url);
    const origin = url.origin;
    const aiServiceUrl = `${origin}/api/object/architecture`;

    console.log('Calling AI service URL:', aiServiceUrl);

    const response = await fetch(aiServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wsId,
        location,
        buildingRequirements,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Error from AI service:', error);
      return NextResponse.json(
        { message: `Error from AI service: ${error}` },
        { status: response.status }
      );
    }

    console.log('AI service response received, streaming to client');

    // Stream the response back to the client
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in architecture analysis API route:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
